import { createHash } from "node:crypto";
import { z } from "zod";
import type { EvolutionEvent } from "../evolution/schema";

const messageSchema = z.object({
  key: z.object({ id: z.string().min(1).max(200), fromMe: z.literal(false),
    remoteJid: z.string().max(100), remoteJidAlt: z.string().max(100).optional() }),
  messageTimestamp: z.coerce.number().int().positive(),
  message: z.object({ conversation: z.string().max(12000).optional(),
    extendedTextMessage: z.object({ text: z.string().max(12000) }).optional(),
    audioMessage: z.object({}).optional(), imageMessage: z.object({}).optional(), documentMessage: z.object({}).optional() }),
});
export interface IncomingMessage { identity: string; conversation: string; number: string; text: string; timestamp: number; audio?: { id: string }; midia?: boolean }
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function incomingMessage(event: EvolutionEvent, instance: string, now = Date.now(), transferirMidia = false): IncomingMessage | null {
  if (event.event !== "messages.upsert" || event.instance !== instance || Array.isArray(event.data)) return null;
  const parsed = messageSchema.safeParse(event.data);
  if (!parsed.success) return null;
  const data = parsed.data;
  // Somente conversas individuais; nunca inferir telefone de um LID.
  if (!/@(s\.whatsapp\.net|lid)$/.test(data.key.remoteJid)) return null;
  const jid = [data.key.remoteJid, data.key.remoteJidAlt].find(value => value && /^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(value));
  const text = (data.message.conversation ?? data.message.extendedTextMessage?.text ?? "").trim();
  const age = now / 1000 - data.messageTimestamp;
  const midia = transferirMidia && Boolean(data.message.imageMessage || data.message.documentMessage);
  if (!jid || (!text && !data.message.audioMessage && !midia) || age > 300 || age < -60) return null;
  return { identity: digest(`${instance}:${data.key.id}`), conversation: digest(`${instance}:${jid}`),
    number: jid.split("@")[0], text: midia ? "[Imagem ou documento recebido]" : text, timestamp: data.messageTimestamp,
    ...(midia ? { midia: true } : {}),
    ...(!text && data.message.audioMessage ? { audio: { id: data.key.id } } : {}) };
}
