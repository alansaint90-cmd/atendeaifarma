import { z } from "zod";
import { parseFollowup } from "../followups/schema";

const secret = z.string().trim().min(1).max(4096).regex(/^\S+$/);
export const settingsSchema = z.object({
  FOLLOW_UP_CONFIG: z.string().max(20000).refine(value => { try { parseFollowup(value); return true; } catch { return false; } }, "Configuração de follow-up inválida.").optional(),
  FOLLOW_UP_SECOND_CONFIG: z.string().max(20000).refine(value => { try { parseFollowup(value); return true; } catch { return false; } }, "Configuração de follow-up inválida.").optional(),
  FOLLOW_UP_THIRD_CONFIG: z.string().max(20000).refine(value => { try { parseFollowup(value); return true; } catch { return false; } }, "Configuração de follow-up inválida.").optional(),
  AI_ENABLED: z.enum(["true", "false"]).optional(),
  AI_SYSTEM_PROMPT: z.string().trim().min(1).max(200000).optional(), // legado: apenas leitura de registros antigos
  OPENAI_API_KEY: secret.regex(/^sk-[A-Za-z0-9_-]+$/).optional(),
  OPENAI_MODEL: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  EVOLUTION_API_URL: z.string().trim().url().regex(/^https?:\/\//).refine(value => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }).optional(),
  EVOLUTION_API_KEY: secret.optional(),
  EVOLUTION_INSTANCE_NAME: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}_. -]+$/u).optional(),
  EVOLUTION_SECOND_INSTANCE_NAME: z.string().trim().max(100).regex(/^[\p{L}\p{N}_. -]*$/u).optional(),
  EVOLUTION_THIRD_INSTANCE_NAME: z.string().trim().max(100).regex(/^[\p{L}\p{N}_. -]*$/u).optional(),
  EVOLUTION_WEBHOOK_SECRET: secret.min(32).max(256).optional(),
  REDIS_URL: z.string().trim().url().regex(/^rediss?:\/\//).max(4096).optional(),
}).strict();
export type IntegrationSettings = z.infer<typeof settingsSchema>;
export const settingNames = Object.keys(settingsSchema.shape).filter(name => name !== "AI_SYSTEM_PROMPT") as (keyof IntegrationSettings)[];
export const publicNames = ["OPENAI_MODEL", "EVOLUTION_API_URL", "EVOLUTION_INSTANCE_NAME", "EVOLUTION_SECOND_INSTANCE_NAME", "EVOLUTION_THIRD_INSTANCE_NAME", "AI_ENABLED"] as const;
export const saveSettingsSchema = z.object({ version: z.number().int().min(0),
  values: settingsSchema.omit({ AI_SYSTEM_PROMPT: true }) }).strict();

export function settingsStatus(values: IntegrationSettings, version: number) {
  return {
    version,
    configured: Object.fromEntries(settingNames.map(name => [name, Boolean(values[name])])),
    values: Object.fromEntries(publicNames.map(name => [name, values[name] ?? ""])),
  };
}
