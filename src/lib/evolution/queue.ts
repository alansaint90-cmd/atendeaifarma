import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { EvolutionEvent } from "./schema";
import { duracaoPausaManual, pausaManualKey, pausasManuaisParaEvento } from "../agent/pausa";

export const streamKey = "atendeia:{evolution}:events";
// Atomic deduplication and enqueue. Capacity failures never silently discard data.
export const enqueueScript = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
if redis.call('XLEN', KEYS[1]) >= 1000 then return -1 end
redis.call('XADD', KEYS[1], '*', 'payload', ARGV[1])
redis.call('SET', KEYS[2], '1', 'EX', 86400)
local pausas = cjson.decode(ARGV[2])
for indice, pausa in ipairs(pausas) do
  local chave = 3 + (indice - 1) * 4
  if tonumber(pausa.ate) > tonumber(ARGV[3]) and redis.call('EXISTS', KEYS[chave + 1]) == 0 then
    local anterior = tonumber(redis.call('GET', KEYS[chave]) or '0')
    if tonumber(pausa.ate) > anterior then
      redis.call('SET', KEYS[chave], pausa.ate, 'PXAT', pausa.ate)
    end
    local ciclo = redis.call('GET', KEYS[chave + 2])
    if ciclo and cjson.decode(ciclo).started <= tonumber(pausa.ate) - ${duracaoPausaManual} then
      redis.call('DEL', KEYS[chave + 2])
      redis.call('ZREM', KEYS[chave + 3], pausa.conversation)
    end
  end
end
return 1
`;

let connection: { url: string; client: Redis; ready: Promise<unknown> } | undefined;
async function getRedis(url: string): Promise<Redis> {
  if (!connection || connection.url !== url || connection.client.status === "end") {
    connection?.client.disconnect();
    const client = new Redis(url, {
      lazyConnect: true, enableOfflineQueue: false, connectTimeout: 5000,
      commandTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: () => null,
    });
    client.on("error", () => { /* The caller receives a generic 503; no secrets in logs. */ });
    connection = { url, client, ready: client.connect() };
  }
  await connection.ready;
  return connection.client;
}

export async function enqueueEvolutionEvent(event: EvolutionEvent, url: string): Promise<"queued" | "duplicate"> {
  const client = await getRedis(url);
  return enqueueEvolutionEventWithClient(client, event);
}

export async function enqueueEvolutionEventWithClient(client: Redis, event: EvolutionEvent): Promise<"queued" | "duplicate"> {
  // Without an event timestamp, recurring connection/status transitions are distinct.
  const identity = !event.date_time && event.event !== "messages.upsert" ? randomUUID() : JSON.stringify(event);
  const fingerprint = createHash("sha256").update(identity).digest("hex");
  const payload = JSON.stringify({ ...event, receivedAt: new Date().toISOString(), source: "evolution-webhook" });
  const pausas = await pausasManuaisParaEvento(client, event);
  const chaves = pausas.flatMap(pausa => [pausaManualKey(pausa.conversation), pausa.outgoingKey,
    `atendeia:{evolution}:followup:${pausa.conversation}`, "atendeia:{evolution}:followups"]);
  const result = await client.eval(enqueueScript, 2 + chaves.length, streamKey, `atendeia:{evolution}:dedupe:${fingerprint}`,
    ...chaves, payload, JSON.stringify(pausas.map(pausa => ({ ate: pausa.ate, conversation: pausa.conversation }))), Date.now());
  if (result === -1) throw new Error("Queue capacity reached");
  if (result !== 0 && result !== 1) throw new Error("Unexpected queue response");
  return result === 1 ? "queued" : "duplicate";
}
