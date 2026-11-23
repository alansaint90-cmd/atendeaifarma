import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import type { SessaoAtiva } from "../auth/permissoes";
import { linhas, type BancoSql } from "../db/porta";
import { effectiveSettings } from "../settings/repository";
import { jsonLimitado } from "../agent/audio";
import { autorizar } from "./comum";
import { configurarCanalManual } from "./canal-manual";

const limite = 10 * 1024 * 1024;
const indisponivel = () => new ErroDeNegocio("Não foi possível recuperar este áudio. Ele pode não estar mais disponível no WhatsApp.");

/** Valida o conteúdo recebido do provedor, sem aceitar URLs ou gravar binários. */
export function decodificarAudioHistorico(entrada: unknown) {
  const dados = z.object({ base64: z.string().min(1).max(Math.ceil(limite / 3) * 4), mimetype: z.string().max(100) }).parse(entrada);
  const mime = dados.mimetype.split(";")[0].trim().toLowerCase().replace("audio/mp3", "audio/mpeg").replace("audio/x-m4a", "audio/mp4").replace("audio/x-wav", "audio/wav").replace("audio/x-flac", "audio/flac");
  const bytes = Buffer.from(dados.base64, "base64");
  if (!bytes.length || bytes.length > limite || bytes.toString("base64") !== dados.base64) throw indisponivel();
  const inicio = bytes.subarray(0, 12).toString("ascii");
  const assinatura = mime === "audio/ogg" ? inicio.startsWith("OggS")
    : mime === "audio/mpeg" ? inicio.startsWith("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : mime === "audio/mp4" ? inicio.slice(4, 8) === "ftyp"
    : mime === "audio/webm" ? bytes.subarray(0, 4).toString("hex") === "1a45dfa3"
    : mime === "audio/wav" ? inicio.startsWith("RIFF") && inicio.slice(8, 12) === "WAVE"
    : mime === "audio/flac" && inicio.startsWith("fLaC");
  if (!assinatura) throw indisponivel();
  return { bytes: new Uint8Array(bytes), mime };
}

export async function recuperarAudioHistorico(banco: BancoSql, ator: SessaoAtiva, entrada: unknown, dependencias = { settings: effectiveSettings, request: fetch }) {
  const id = z.uuid().parse(entrada);
  const consultar = () => banco.transaction(async tx => {
    await autorizar(tx, ator, "operador");
    return linhas<{ instancia: string; numero: string | null; provedor: string; direcao: string }>(await tx.execute(sql`
      SELECT ch.instance_name instancia,p.phone numero,m.provider_message_id provedor,m.direction direcao
      FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id
      JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id
      WHERE m.id=${id} AND m.message_type='audio' AND m.provider_message_id IS NOT NULL
        AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false AND p.is_deleted=false`))[0];
  });
  const mensagem = await consultar();
  if (!mensagem) throw indisponivel();
  const { config } = configurarCanalManual(await dependencias.settings(), mensagem.instancia, mensagem.numero);
  let audio: ReturnType<typeof decodificarAudioHistorico>;
  try {
    const resposta = await dependencias.request(`${config.EVOLUTION_API_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`, {
      method: "POST", headers: { apikey: config.EVOLUTION_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id: mensagem.provedor, fromMe: mensagem.direcao === "outbound" } }, convertToMp4: false }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) throw indisponivel();
    audio = decodificarAudioHistorico(await jsonLimitado(resposta, Math.ceil(limite * 4 / 3) + 8192));
  } catch { throw indisponivel(); }
  // Exclusão ou revogação durante a recuperação também impede a reprodução.
  if (!await consultar()) throw indisponivel();
  return audio;
}
