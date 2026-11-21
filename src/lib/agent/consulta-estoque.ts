import { z } from "zod";
import type { AgentConfig } from "./config";
import type { IncomingMessage } from "./message";
import { digest } from "./message";
import type { DeliveryState, ProcessingPort } from "./processor";
import { ProviderError } from "./providers";

export interface EstadoConsultaEstoque {
  termo: string;
  etapa: "aviso" | "consultando" | "consultar" | "resposta" | "transferir";
  prazo?: number;
}
export const esperaConsultaEstoque = 15000;
const aviso = "Um momento, vou consultar o estoque.";
const consultando = "Consultando…";
const falhaConsulta = "Não consegui consultar o sistema agora. Não posso confirmar preço ou disponibilidade. Tente novamente ou solicite atendimento humano.";

/** Cada saída e prazo ficam no checkpoint Redis; nenhuma espera mantém a lease ocupada. */
export async function processarConsultaEstoque(message: IncomingMessage, config: AgentConfig, port: ProcessingPort, inicial: DeliveryState): Promise<string> {
  let estado = inicial;
  const agora = port.agora ?? Date.now;
  const salvar = async (proximo: DeliveryState) => { await port.write(proximo); estado = proximo; };
  const enviar = async (texto: string): Promise<string | null> => {
    if (!await port.enabled()) return "pausada";
    await salvar({ ...estado, status: "enviando" });
    try {
      const id = await port.send(config, message.number, texto);
      await port.registrarParte?.(id);
      // Só o chamador confirma a próxima etapa, junto com o ID desta saída.
      estado = { ...estado, providerId: id, providerIds: [...(estado.providerIds ?? []), id] };
      return null;
    } catch (erro) {
      await salvar({ ...estado, status: "incerta", code: erro instanceof ProviderError ? erro.code : "envio_incerto" });
      return "incerta";
    }
  };
  if (!await port.enabled()) return "pausada";
  if (estado.estoque!.etapa === "aviso") {
    const resultado = await enviar(aviso);
    if (resultado) return resultado;
    await salvar({ ...estado, status: "gerada", estoque: { ...estado.estoque!, etapa: "consultando", prazo: agora() + esperaConsultaEstoque } });
    return "aguardando_estoque";
  }
  if (estado.estoque!.etapa === "consultando") {
    if (agora() < estado.estoque!.prazo!) return "aguardando_estoque";
    const resultado = await enviar(consultando);
    if (resultado) return resultado;
    await salvar({ ...estado, status: "gerada", estoque: { ...estado.estoque!, etapa: "consultar" } });
  }
  if (estado.estoque!.etapa === "consultar") {
    if (!await port.enabled()) return "pausada";
    let partes: string[];
    let transferencia = false;
    try {
      const resposta = await port.consultarEstoque!(estado.estoque!.termo);
      if (typeof resposta === "string") partes = z.array(z.string().trim().min(1).max(6000)).parse([resposta]);
      else if ("mensagens" in resposta) {
        transferencia = resposta.transferirEstoque === true;
        partes = transferencia ? [] : z.array(z.string().trim().min(1).max(6000)).min(1).max(2).parse(resposta.mensagens);
      } else throw new ProviderError("consulta_estoque_resposta_invalida");
    } catch { partes = [falhaConsulta]; }
    await salvar({ ...estado, status: "gerada", partes, transferencia,
      reply: [aviso, consultando, ...partes].join("\n\n"), estoque: { ...estado.estoque!, etapa: "resposta" } });
  }
  if (estado.estoque!.etapa === "resposta" && estado.transferencia) {
    // Também descarta avisos pendentes de versões anteriores, preservando o que já foi enviado.
    const confirmadas = (estado.partes ?? []).slice(0, Math.max(0, (estado.providerIds?.length ?? 2) - 2));
    await salvar({ ...estado, partes: confirmadas, reply: [aviso, consultando, ...confirmadas].join("\n\n"),
      estoque: { ...estado.estoque!, etapa: "transferir" } });
  }
  if (estado.estoque!.etapa === "resposta") {
    for (let indice = (estado.providerIds?.length ?? 2) - 2; indice < estado.partes!.length; indice++) {
      const resultado = await enviar(estado.partes![indice]);
      if (resultado) return resultado;
      await salvar({ ...estado, status: "gerada", estoque: { ...estado.estoque!, etapa: "resposta" } });
    }
    if (estado.transferencia) await salvar({ ...estado, estoque: { ...estado.estoque!, etapa: "transferir" } });
  }
  if (estado.estoque!.etapa === "transferir") {
    if (!await port.enabled()) return "pausada";
    // Sem aviso de transferência ao cliente. O servidor sinaliza a fila humana e pausa a IA.
    await port.transferir!(config.atendimento?.destination || "Suporte", "estoque_indisponivel");
  }
  const revisao = digest(config.AI_SYSTEM_PROMPT);
  await port.complete({ ...estado, status: "enviada" }, [
    { role: "user", content: estado.transcript ?? message.text, revisao },
    { role: "assistant", content: estado.reply!, revisao },
  ]);
  return "enviada";
}
