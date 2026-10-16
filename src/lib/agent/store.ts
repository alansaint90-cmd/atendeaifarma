import type Redis from "ioredis";
import { agentKeys, owned, assertResult } from "./redis";
import type { IncomingMessage } from "./message";
import type { DeliveryState } from "./processor";
import type { Turn } from "./providers";
import { streamKey } from "../evolution/queue";

const retention = 30 * 86400;
const nameRetention = 100 * 86400;
export function messageStore(client: Redis, token: string, message: IncomingMessage) {
  const stateKey = `atendeia:{evolution}:reply:${message.identity}`;
  const historyKey = `atendeia:{evolution}:history:${message.conversation}`;
  const nameKey = `atendeia:{evolution}:name:${message.conversation}`;
  return {
    async contactName(): Promise<string | null> {
      return client.get(nameKey);
    },
    async rememberName(name: string) {
      await assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1",
        2, agentKeys.lock, nameKey, token, name, nameRetention));
    },
    async read(): Promise<DeliveryState | null> {
      const value = await client.get(stateKey);
      return value ? JSON.parse(value) as DeliveryState : null;
    },
    async write(state: DeliveryState) {
      await assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1",
        2, agentKeys.lock, stateKey, token, JSON.stringify(state), retention));
    },
    async history(): Promise<Turn[]> {
      return (await client.lrange(historyKey, -12, -1)).map(value => JSON.parse(value) as Turn);
    },
    async complete(state: DeliveryState, turns: Turn[]) {
      await assertResult(await client.eval(owned + `
        redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
        redis.call('RPUSH', KEYS[3], ARGV[4], ARGV[5])
        redis.call('LTRIM', KEYS[3], -12, -1)
        redis.call('EXPIRE', KEYS[3], 86400)
        return 1`, 3, agentKeys.lock, stateKey, historyKey, token, JSON.stringify(state), retention,
      JSON.stringify(turns[0]), JSON.stringify(turns[1])));
    },
  };
}

export async function finishEvent(client: Redis, token: string, id: string, payload: string, status: string) {
  // Arquivar antes de liberar espaço na fila; tudo na mesma operação Redis.
  await assertResult(await client.eval(owned + `
    redis.call('XADD', KEYS[3], 'MAXLEN', '=', 10000, '*', 'eventId', ARGV[2], 'status', ARGV[3], 'payload', ARGV[4])
    redis.call('XACK', KEYS[2], ARGV[5], ARGV[2])
    redis.call('XDEL', KEYS[2], ARGV[2])
    return 1`, 3, agentKeys.lock, streamKey, agentKeys.archive, token, id, status, payload, agentKeys.group));
}
