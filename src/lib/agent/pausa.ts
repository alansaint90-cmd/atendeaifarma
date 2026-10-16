import type Redis from "ioredis";
import type { EvolutionEvent } from "../evolution/schema";
import { activity } from "../followups/queue";
import { z } from "zod";
import { digest } from "./message";
import { agentKeys, owned, assertResult } from "./redis";

export const duracaoPausaManual = 30 * 60 * 1000;
export async function pausarTransferencia(client: Redis, token: string, conversa: string, agora = Date.now()) {
  await assertResult(await client.eval(owned + `
    local prazo = math.max(tonumber(redis.call('GET', KEYS[2]) or '0'), tonumber(ARGV[2]))
    redis.call('SET', KEYS[2], prazo, 'PXAT', prazo)
    redis.call('DEL', KEYS[3])
    redis.call('ZREM', KEYS[4], ARGV[3])
    return 1`, 4, agentKeys.lock, pausaManualKey(conversa),
  `atendeia:{evolution}:followup:${conversa}`, 'atendeia:{evolution}:followups', token, agora + duracaoPausaManual, conversa));
}
export const pausaManualKey = (conversation: string) => `atendeia:{evolution}:manual-pause:${conversation}`;
const aliasKey = (conversation: string) => `atendeia:{evolution}:contact-alias:${conversation}`;
const endereco = /^(?:[1-9]\d{6,14}@s\.whatsapp\.net|\d{1,30}@lid)$/;
const eventoManualSchema = z.object({ key: z.object({ id: z.string().min(1).max(200), fromMe: z.boolean(),
  remoteJid: z.string().regex(endereco), remoteJidAlt: z.string().optional() }),
  messageTimestamp: z.coerce.number().positive() });

export async function pausasManuaisParaEvento(client: Redis, event: EvolutionEvent) {
  if (event.event !== "messages.upsert") return [];
  const pausas: { conversation: string; ate: number; outgoingKey: string }[] = [];
  for (const item of Array.isArray(event.data) ? event.data : [event.data]) {
    const parsed = eventoManualSchema.safeParse(item);
    if (!parsed.success || parsed.data.messageTimestamp * 1000 > Date.now() + 60000) continue;
    const { key, messageTimestamp } = parsed.data;
    const identificadores = [key.remoteJid, key.remoteJidAlt].filter((jid): jid is string => Boolean(jid && endereco.test(jid)));
    const conversas = identificadores.map(jid => digest(`${event.instance}:${jid}`));
    // Associação explícita recebida da Evolution, nunca converter dígitos de LID em telefone.
    if (conversas.length === 2 && conversas[0] !== conversas[1]) {
      await client.set(aliasKey(conversas[0]), conversas[1], "EX", 100 * 86400);
      await client.set(aliasKey(conversas[1]), conversas[0], "EX", 100 * 86400);
    }
    if (!key.fromMe) continue;
    for (const conversa of [...conversas]) {
      const associado = await client.get(aliasKey(conversa));
      if (associado) conversas.push(associado);
    }
    for (const conversation of new Set(conversas)) pausas.push({ conversation,
      ate: messageTimestamp * 1000 + duracaoPausaManual,
      outgoingKey: `atendeia:{evolution}:outgoing:${digest(`${event.instance}:${key.id}`)}` });
  }
  return pausas;
}

export function pausaManualParaEvento(event: EvolutionEvent) {
  const atual = activity(event, event.instance);
  if (!atual?.fromMe) return null;
  return { conversation: atual.conversation, ate: atual.timestamp * 1000 + duracaoPausaManual,
    outgoingKey: `atendeia:{evolution}:outgoing:${atual.identity}` };
}

export async function pausaManualAtiva(client: Redis, conversation: string, agora = Date.now()) {
  if (Number(await client.get(pausaManualKey(conversation))) > agora) return true;
  const associado = await client.get(aliasKey(conversation));
  return associado ? Number(await client.get(pausaManualKey(associado))) > agora : false;
}
