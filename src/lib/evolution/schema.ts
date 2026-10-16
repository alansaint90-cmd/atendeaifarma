import { z } from "zod";

export const webhookConfigSchema = z.object({
  EVOLUTION_WEBHOOK_SECRET: z.string().min(32).max(256),
  EVOLUTION_INSTANCE_NAME: z.string().min(1).max(100).regex(/^[\p{L}\p{N}_. -]+$/u),
  EVOLUTION_SECOND_INSTANCE_NAME: z.string().max(100).regex(/^[\p{L}\p{N}_. -]*$/u).optional(),
  EVOLUTION_THIRD_INSTANCE_NAME: z.string().max(100).regex(/^[\p{L}\p{N}_. -]*$/u).optional(),
  REDIS_URL: z.string().url().regex(/^rediss?:\/\//),
});
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

export const evolutionEventSchema = z.object({
  event: z.string().max(80).transform(value => value.toLowerCase().replaceAll("_", ".").replaceAll("-", "."))
    .pipe(z.enum(["messages.upsert", "messages.update", "connection.update"])),
  instance: z.string().min(1).max(100).regex(/^[\p{L}\p{N}_. -]+$/u),
  date_time: z.string().min(1).max(64).optional(),
  data: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown())).max(1000)]),
});
// Deliberately omit Evolution's envelope apikey, destination and server_url.
export type EvolutionEvent = z.infer<typeof evolutionEventSchema>;
