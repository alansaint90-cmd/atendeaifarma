import { createHash } from "node:crypto";
import { z } from "zod";
import type { EvolutionEvent } from "../evolution/schema";

const mensagemSchema = z.object({
  key: z.object({ id: z.string().min(1).max(200), fromMe: z.boolean(),
    remoteJid: z.string().max(100), remoteJidAlt: z.string().max(100).optional() }),
  pushName: z.string().max(200).optional(),
  messageTimestamp: z.coerce.number().int().positive().max(253402300799),
  message: z.object({ conversation: z.string().max(12000).optional(),
    extendedTextMessage: z.object({ text: z.string().max(12000) }).optional(),
    imageMessage: z.object({ caption: z.string().max(12000).optional() }).optional(),
    videoMessage: z.object({ caption: z.string().max(12000).optional() }).optional(),
    audioMessage: z.object({}).optional(), documentMessage: z.object({}).optional(),
    stickerMessage: z.object({}).optional() }),
});

export function mensagensOperacionais(evento: EvolutionEvent, agora = Date.now()) {
  if (evento.event !== "messages.upsert") return [];
  return (Array.isArray(evento.data) ? evento.data : [evento.data]).flatMap(item => {
    const resultado = mensagemSchema.safeParse(item);
    if (!resultado.success) return [];
    const dado = resultado.data;
    if (!/@(s\.whatsapp\.net|lid)$/.test(dado.key.remoteJid) || dado.messageTimestamp * 1000 > agora + 60000) return [];
    const jid = [dado.key.remoteJid, dado.key.remoteJidAlt].find(valor => valor && /^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(valor));
    if (!jid) return [];
    const texto = dado.message.conversation ?? dado.message.extendedTextMessage?.text;
    const tipo = texto !== undefined ? "text" : dado.message.imageMessage ? "image" : dado.message.videoMessage ? "video"
      : dado.message.audioMessage ? "audio" : dado.message.documentMessage ? "document" : dado.message.stickerMessage ? "sticker" : null;
    if (!tipo) return [];
    const conteudo = texto ?? dado.message.imageMessage?.caption ?? dado.message.videoMessage?.caption ?? `[${tipo}]`;
    return [{ identidade: createHash("sha256").update(JSON.stringify([evento.instance, dado.key.id])).digest("hex"),
      instancia: evento.instance, provedorId: dado.key.id, jid, telefone: `+${jid.split("@")[0]}`,
      nome: dado.key.fromMe ? undefined : dado.pushName?.trim(), saida: dado.key.fromMe,
      conteudo, tipo, instante: new Date(dado.messageTimestamp * 1000).toISOString() }];
  });
}
