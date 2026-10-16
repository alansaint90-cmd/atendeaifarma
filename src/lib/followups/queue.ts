import type Redis from "ioredis";
import { z } from "zod";
import type { EvolutionEvent } from "../evolution/schema";
import type { IncomingMessage } from "../agent/message";
import { digest } from "../agent/message";
import { agentKeys, owned, assertResult } from "../agent/redis";
import type { FollowupConfig } from "./schema";
import type { FollowupJob } from "./processor";
import { nextDue } from "./schedule";

export const followupQueue = "atendeia:{evolution}:followups";
const prefix = "atendeia:{evolution}:";
const ttl = 100 * 86400;
const activitySchema = z.object({ key: z.object({ id: z.string().min(1).max(200), fromMe: z.boolean(),
  remoteJid: z.string(), remoteJidAlt: z.string().optional() }), messageTimestamp: z.coerce.number().positive() });
export function activity(event: EvolutionEvent, instance: string) {
  if (event.event !== "messages.upsert" || event.instance !== instance) return null;
  const parsed = activitySchema.safeParse(event.data);
  if (!parsed.success) return null;
  const { key, messageTimestamp } = parsed.data;
  if (!/@(s\.whatsapp\.net|lid)$/.test(key.remoteJid)) return null;
  const jid = [key.remoteJid, key.remoteJidAlt].find(value => value && /^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(value));
  if (!jid || messageTimestamp > Date.now() / 1000 + 60) return null;
  return { identity: digest(`${instance}:${key.id}`), conversation: digest(`${instance}:${jid}`), timestamp: messageTimestamp, fromMe: key.fromMe };
}
export function followupStore(client: Redis, token: string) {
  async function guarded(script: string, keys: string[], args: (string | number)[]) {
    await assertResult(await client.eval(owned + script + "; return 1", keys.length + 1, agentKeys.lock, ...keys, token, ...args));
  }
  const jobKey = (conversation: string) => prefix + "followup:" + conversation;
  return {
    async observe(event: EvolutionEvent, instance: string) {
      const current = activity(event, instance);
      if (!current) return;
      await guarded(`
        if redis.call('EXISTS', KEYS[4]) == 1 then return 1 end
        if redis.call('SET', KEYS[5], '1', 'EX', ARGV[4], 'NX') == false then return 1 end
        local raw = redis.call('GET', KEYS[2])
        if raw then
          local job = cjson.decode(raw)
          if tonumber(ARGV[3]) >= math.floor(job.started / 1000) then
            redis.call('DEL', KEYS[2]); redis.call('ZREM', KEYS[3], ARGV[2])
          end
        end`, [jobKey(current.conversation), followupQueue, prefix + "outgoing:" + current.identity,
        prefix + "activity:" + current.identity], [current.conversation, current.timestamp, ttl]);
    },
    async outgoing(instance: string, id: string) {
      await guarded("redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])", [prefix + "outgoing:" + digest(`${instance}:${id}`)], [ttl]);
    },
    async schedule(message: IncomingMessage, config: FollowupConfig) {
      if (!config.enabled || !config.revision) return;
      const index = config.steps.findIndex(step => step.enabled);
      if (index < 0) return;
      const now = Date.now();
      const job: FollowupJob = { instance: config.instance, conversation: message.conversation, identity: message.identity, number: message.number,
        started: message.timestamp * 1000, index, due: nextDue(config, now, index), revision: config.revision, status: "aguardando" };
      await guarded(`
        if redis.call('SET', KEYS[4], '1', 'EX', ARGV[4], 'NX') == false then return 1 end
        redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
        redis.call('ZADD', KEYS[3], ARGV[3], ARGV[5])`, [jobKey(message.conversation), followupQueue,
        prefix + "scheduled:" + message.identity], [JSON.stringify(job), job.due, ttl, message.conversation]);
    },
    async due(): Promise<FollowupJob | null> {
      const [conversation] = await client.zrangebyscore(followupQueue, "-inf", Date.now(), "LIMIT", 0, 1);
      if (!conversation) return null;
      const raw = await client.get(jobKey(conversation));
      if (!raw) { await guarded("redis.call('ZREM', KEYS[2], ARGV[2])", [followupQueue], [conversation]); return null; }
      return JSON.parse(raw) as FollowupJob;
    },
    async save(job: FollowupJob) {
      await guarded("redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); redis.call('ZADD', KEYS[3], ARGV[4], ARGV[5])",
        [jobKey(job.conversation), followupQueue], [JSON.stringify(job), ttl, job.due, job.conversation]);
    },
    async finish(job: FollowupJob, result: string) {
      await guarded(`redis.call('DEL', KEYS[2]); redis.call('ZREM', KEYS[3], ARGV[2])
        redis.call('XADD', KEYS[4], 'MAXLEN', '=', 10000, '*', 'status', ARGV[3], 'conversation', ARGV[2])`,
      [jobKey(job.conversation), followupQueue, prefix + "followup-results"], [job.conversation, result]);
    },
    async history(job: FollowupJob, text: string, revisao?: string) {
      await guarded("redis.call('RPUSH', KEYS[2], ARGV[2]); redis.call('LTRIM', KEYS[2], -12, -1); redis.call('EXPIRE', KEYS[2], 86400)",
        [prefix + "history:" + job.conversation], [JSON.stringify({ role: "assistant", content: text, revisao })]);
    },
  };
}
