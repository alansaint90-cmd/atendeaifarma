import { z } from "zod";
import type { AgentConfig } from "./config";
import type { IncomingMessage } from "./message";
import { ProviderError } from "./providers";

const maxAudio = 10 * 1024 * 1024;
const formatos: Record<string, string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
  "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm",
  "audio/flac": "flac", "audio/x-flac": "flac",
};

// Limita também corpos sem Content-Length, antes de decodificar o base64.
async function jsonLimitado(response: Response, limite: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("audio_resposta_invalida");
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > limite) throw new ProviderError("audio_limite_excedido");
      partes.push(value);
    }
    return JSON.parse(Buffer.concat(partes).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function transcribeAudio(config: AgentConfig, message: IncomingMessage, request = fetch): Promise<string> {
  if (!message.audio) throw new ProviderError("audio_ausente");
  let etapa = "evolution_audio";
  try {
    // Busca pelo ID na instância configurada. Nunca acessa URL de mídia do webhook.
    const url = `${config.EVOLUTION_API_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`;
    const media = await request(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { apikey: config.EVOLUTION_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id: message.audio.id } }, convertToMp4: false }),
    });
    if (!media.ok) throw new ProviderError(`evolution_audio_http_${media.status}`);
    const parsed = z.object({ base64: z.string().min(1), mimetype: z.string().max(100) })
      .safeParse(await jsonLimitado(media, Math.ceil(maxAudio * 4 / 3) + 8192));
    if (!parsed.success) throw new ProviderError("audio_resposta_invalida");
    const mime = parsed.data.mimetype.split(";")[0].trim().toLowerCase();
    const extensao = formatos[mime];
    if (!extensao) throw new ProviderError("audio_formato_invalido");
    const base64 = parsed.data.base64;
    if (base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) {
      throw new ProviderError("audio_base64_invalido");
    }
    const bytes = Buffer.from(base64, "base64");
    if (bytes.toString("base64") !== base64) throw new ProviderError("audio_base64_invalido");
    if (!bytes.length || bytes.length > maxAudio) throw new ProviderError("audio_limite_excedido");
    const body = new FormData();
    body.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), `mensagem.${extensao}`);
    body.set("model", "gpt-4o-mini-transcribe");
    body.set("response_format", "json");
    etapa = "openai_audio";
    const response = await request("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` }, body,
    });
    if (!response.ok) throw new ProviderError(`openai_audio_http_${response.status}`);
    const transcript = z.object({ text: z.string().trim().min(1).max(12000) })
      .safeParse(await jsonLimitado(response, 128000));
    if (!transcript.success) throw new ProviderError("audio_transcricao_invalida");
    return transcript.data.text;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(`${etapa}_falhou`);
  }
}
