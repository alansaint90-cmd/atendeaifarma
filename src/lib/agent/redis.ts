import Redis from "ioredis";

export const agentKeys = {
  lock: "atendeia:{evolution}:agent-lock", heartbeat: "atendeia:{evolution}:agent-status",
  archive: "atendeia:{evolution}:processed", group: "atendeia-agent-v1", consumer: "serial",
};
export function agentRedis(url: string) {
  const client = new Redis(url, { lazyConnect: true, connectTimeout: 5000, commandTimeout: 5000,
    enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null });
  client.on("error", () => {});
  return client;
}
export const owned = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end\n";
export async function assertResult(result: unknown) {
  if (result !== 1) throw new Error("Posse do processamento perdida.");
}
