import type { AgentConfig } from "./config";
import type { IncomingMessage } from "./message";
import { digest } from "./message";
import { ProviderError, type Turn, type RespostaGerada } from "./providers";
import { extrairNomeInformado, instrucoesComNome, respostaComNome, personaDoAgente, mesmoNome, removerRotuloDaPersona } from "./nome";
import { deveConsultarAgenda } from "../consultas/intencao";
import { mensagensDaConsulta } from "../consultas/fluxo";

export interface DeliveryState { status: "gerando" | "gerada" | "enviando" | "enviada" | "incerta" | "falhou"; attempts: number; reply?: string; partes?: string[]; providerIds?: string[]; transcript?: string; code?: string; configHash?: string; providerId?: string; transferencia?: boolean; consulta?: boolean }
export interface ProcessingPort {
  read(): Promise<DeliveryState | null>;
  write(state: DeliveryState): Promise<void>;
  history(): Promise<Turn[]>;
  contactName?(): Promise<string | null>;
  rememberName?(name: string): Promise<void>;
  complete(state: DeliveryState, turns: Turn[]): Promise<void>;
  enabled(): Promise<boolean>;
  transcribe?(config: AgentConfig, message: IncomingMessage): Promise<string>;
  transferir?(destino: string): Promise<void>;
  cadastroConsulta?(texto: string, iniciar: boolean): Promise<string | null>;
  generate(config: AgentConfig, history: Turn[], text: string): Promise<RespostaGerada>;
  send(config: AgentConfig, number: string, text: string): Promise<string>;
  registrarParte?(id: string): Promise<void>;
}

export async function processMessage(message: IncomingMessage, config: AgentConfig, port: ProcessingPort): Promise<string> {
  let state = await port.read();
  if (state?.status === "enviada" || state?.status === "incerta" || state?.status === "falhou") return state.status;
  // Não repetir um envio cujo resultado se perdeu durante queda ou timeout.
  if (state?.status === "enviando") {
    await port.write({ ...state, status: "incerta", code: "envio_interrompido" });
    return "incerta";
  }
  if (!await port.enabled()) return "pausada";
  const configHash = digest(JSON.stringify(config));
  const revisao = digest(config.AI_SYSTEM_PROMPT);
  if (state?.configHash !== configHash) {
    if (state?.providerIds?.length) {
      await port.write({ ...state, status: "falhou", code: "configuracao_alterada_entre_partes" }); return "falhou";
    }
    state = null;
  }
  if ((state?.attempts ?? 0) >= 3 && !state?.reply) {
    await port.write({ ...state!, status: "falhou", code: "limite_tentativas" });
    return "falhou";
  }
  if (!state?.reply) {
    const attempts = (state?.attempts ?? 0) + 1;
    let transcript = state?.transcript;
    await port.write({ status: "gerando", attempts, configHash, transcript });
    let reply: string;
    let transferencia = false;
    let consulta = false;
    let partes: string[] | undefined;
    try {
      if (message.audio && !transcript) {
        if (!port.transcribe) throw new ProviderError("audio_transcricao_indisponivel");
        const candidate = (await port.transcribe(config, message)).trim();
        if (!candidate || candidate.length > 12000) throw new ProviderError("audio_transcricao_invalida");
        transcript = candidate;
        await port.write({ status: "gerando", attempts, configHash, transcript });
        if (!await port.enabled()) return "pausada";
      }
      const historico = await port.history();
      const persona = personaDoAgente(config.AI_SYSTEM_PROMPT);
      const candidato = extrairNomeInformado(transcript ?? message.text, historico);
      const apresentacaoExplicita = extrairNomeInformado(transcript ?? message.text, []);
      const informado = mesmoNome(candidato, persona) && !apresentacaoExplicita ? null : candidato;
      const salvo = await port.contactName?.() ?? null;
      const confirmadoNoHistorico = historico.some(turno => turno.role === "user" && mesmoNome(extrairNomeInformado(turno.content, []), salvo));
      const nome = informado ?? (mesmoNome(salvo, persona) && !confirmadoNoHistorico ? null : salvo);
      if (informado && port.rememberName) await port.rememberName(informado);
      const instrucoes = `${instrucoesComNome(config.AI_SYSTEM_PROMPT, nome, historico.length === 0)}\nNão use o nome da assistente como rótulo ou prefixo das mensagens. Preserve a apresentação natural no início da conversa.`;
      // Preservar o histórico armazenado, mas não ensinar novamente uma persona ou roteiro antigo.
      const contextoAtual = persona ? historico.filter(turno => turno.role === "user" || turno.revisao === revisao) : historico;
      const saudacao = /^(?:oi+|ol[aá]+|bom dia|boa tarde|boa noite)[\s!.😊👋]*$/iu.test((transcript ?? message.text).trim());
      if (!nome && !historico.length && !message.midia && saudacao && config.openingMessages?.length) partes = config.openingMessages;
      let cadastro = config.agendaConsultas && port.cadastroConsulta ? await port.cadastroConsulta(transcript ?? message.text, false) : null;
      if (!cadastro && config.agendaConsultas && port.cadastroConsulta && deveConsultarAgenda(transcript ?? message.text, historico)) {
        cadastro = await port.cadastroConsulta(transcript ?? message.text, true);
      }
      const gerada = cadastro ?? (partes ? partes.join("\n\n") : message.midia && config.atendimento?.transferMedia ? { transferir: true as const }
        : await port.generate({ ...config, AI_SYSTEM_PROMPT: instrucoes }, contextoAtual, transcript ?? message.text));
      if (cadastro) { consulta = true; partes = undefined; reply = cadastro; }
      else if (typeof gerada !== "string" && "agendar" in gerada) {
        if (!config.agendaConsultas || !port.cadastroConsulta) throw new ProviderError("agenda_indisponivel");
        const inicio = await port.cadastroConsulta(transcript ?? message.text, true);
        if (!inicio) throw new ProviderError("agenda_indisponivel");
        consulta = true; reply = inicio;
      } else if (typeof gerada !== "string") {
        if (!(config.atendimento?.transferHuman || (message.midia && config.atendimento?.transferMedia)) || !port.transferir) throw new ProviderError("transferencia_indisponivel");
        transferencia = true;
        reply = config.atendimento.transferNotice.replace(/\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/giu, nome?.split(" ")[0] ?? "").trim()
          || "Vou encaminhar seu atendimento para nossa equipe.";
      } else reply = partes ? gerada : removerRotuloDaPersona(respostaComNome(gerada, nome), persona);
      if (consulta) partes = mensagensDaConsulta(reply);
    }
    catch (error) {
      const code = error instanceof ProviderError ? error.code : "geracao_falhou";
      await port.write({ status: attempts >= 3 ? "falhou" : "gerando", attempts, code, configHash, transcript });
      return attempts >= 3 ? "falhou" : "repetir";
    }
    state = { status: "gerada", attempts, reply, partes, configHash, transcript, transferencia, consulta };
    await port.write(state);
  }
  if (!await port.enabled()) return "pausada";
  if (!state.partes && !state.transferencia && /\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/iu.test(state.reply!)) {
    state = { ...state, reply: respostaComNome(state.reply!, await port.contactName?.() ?? null) };
    await port.write(state);
  }
  const semRotulo = state.transferencia || state.partes || state.consulta ? state.reply! : removerRotuloDaPersona(state.reply!, personaDoAgente(config.AI_SYSTEM_PROMPT));
  if (semRotulo !== state.reply) {
    state = { ...state, reply: semRotulo };
    await port.write(state);
  }
  const partes = state.partes ?? [state.reply!];
  for (let indice = state.providerIds?.length ?? 0; indice < partes.length; indice++) {
    if (!await port.enabled()) return "pausada";
    await port.write({ ...state, status: "enviando" });
    // Reserva antes de cada saída; entrega incerta nunca é repetida.
    if (state.transferencia) await port.transferir!(config.atendimento!.destination);
    try {
      state.providerId = await port.send(config, message.number, partes[indice]);
      await port.registrarParte?.(state.providerId);
    } catch (error) {
      await port.write({ ...state, status: "incerta", code: error instanceof ProviderError ? error.code : "envio_incerto" });
      return "incerta";
    }
    state = { ...state, providerIds: [...(state.providerIds ?? []), state.providerId!] };
    if (indice < partes.length - 1) await port.write({ ...state, status: "gerada" });
  }
  // Estado e histórico são confirmados juntos. Se falhar, permanece "enviando".
  await port.complete({ ...state, status: "enviada" }, [
    { role: "user", content: state.transcript ?? message.text, revisao }, { role: "assistant", content: state.reply!, revisao },
  ]);
  return "enviada";
}
