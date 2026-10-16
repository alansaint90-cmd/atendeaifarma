import { z } from "zod";
import { settingsSchema } from "../settings/schema";
import { chatbotSchema, type Chatbot } from "../chatbots/schema";
import { montarInstrucoesDoAgente } from "../chatbots/prompt-servidor";

export const agentBaseConfigSchema = settingsSchema.extend({
  AI_ENABLED: z.literal("true"),
  OPENAI_API_KEY: settingsSchema.shape.OPENAI_API_KEY.unwrap(),
  OPENAI_MODEL: settingsSchema.shape.OPENAI_MODEL.unwrap(),
  EVOLUTION_API_URL: settingsSchema.shape.EVOLUTION_API_URL.unwrap(),
  EVOLUTION_API_KEY: settingsSchema.shape.EVOLUTION_API_KEY.unwrap(),
  EVOLUTION_INSTANCE_NAME: settingsSchema.shape.EVOLUTION_INSTANCE_NAME.unwrap(),
  REDIS_URL: settingsSchema.shape.REDIS_URL.unwrap(),
});
export const agentConfigSchema = agentBaseConfigSchema.extend({
  AI_SYSTEM_PROMPT: z.string().trim().min(1).max(200000),
  openingMessages: chatbotSchema.shape.openingMessages,
  agendaConsultas: chatbotSchema.shape.agendaConsultas,
  atendimento: z.object({ transferHuman: z.boolean(), transferMedia: z.boolean(),
    destination: z.string(), transferNotice: z.string() }).optional(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function configurarAgente(settings: unknown, chatbot: Chatbot | null) {
  const base = agentBaseConfigSchema.safeParse(settings);
  return agentConfigSchema.safeParse(base.success ? { ...base.data,
    AI_SYSTEM_PROMPT: montarInstrucoesDoAgente(chatbot),
    openingMessages: chatbot?.openingMessages,
    agendaConsultas: chatbot?.agendaConsultas,
    atendimento: chatbot ? { transferHuman: chatbot.transferHuman, transferMedia: chatbot.transferMedia,
      destination: chatbot.destination, transferNotice: chatbot.transferNotice } : undefined } : {});
}
