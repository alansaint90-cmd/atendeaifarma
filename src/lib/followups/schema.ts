import { z } from "zod";

const stepSchema = z.strictObject({ enabled: z.boolean(), text: z.string().trim().max(3000),
  delay: z.number().int().min(1).max(10080), unit: z.enum(["minutes", "hours", "days"]) });
export const followupSchema = z.strictObject({
  revision: z.uuid().optional(),
  enabled: z.boolean(), instance: z.string().trim().max(100), target: z.literal("ai"),
  startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24),
  timezone: z.enum(["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/Rio_Branco"]),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length),
  steps: z.tuple([stepSchema, stepSchema, stepSchema]),
}).superRefine((value, context) => {
  if (value.endHour <= value.startHour) context.addIssue({ code: "custom", path: ["endHour"], message: "O horário final deve ser posterior ao inicial." });
  if (value.enabled && (!value.instance || !value.steps.some(step => step.enabled))) context.addIssue({ code: "custom", message: "Selecione o chip e ative ao menos uma mensagem." });
  value.steps.forEach((step, i) => {
    if (step.enabled && !step.text) context.addIssue({ code: "custom", path: ["steps", i, "text"], message: "Preencha a mensagem ativada." });
    if (delayMs(step) > 30 * 86400000) context.addIssue({ code: "custom", path: ["steps", i, "delay"], message: "O intervalo máximo é 30 dias." });
  });
});
export type FollowupConfig = z.infer<typeof followupSchema>;
export const defaultFollowup: FollowupConfig = { enabled: false, instance: "", target: "ai", startHour: 8, endHour: 20,
  timezone: "America/Sao_Paulo", days: [1, 2, 3, 4, 5, 6, 0], steps: [
    { enabled: false, text: "Olá, estou à disposição para continuarmos seu atendimento. Quando precisar, é só chamar.", delay: 1, unit: "hours" },
    { enabled: false, text: "", delay: 1, unit: "days" }, { enabled: false, text: "", delay: 3, unit: "days" },
  ] };
export function delayMs(step: { delay: number; unit: "minutes" | "hours" | "days" }) {
  return step.delay * ({ minutes: 60000, hours: 3600000, days: 86400000 }[step.unit]);
}
export function parseFollowup(raw?: string): FollowupConfig {
  if (!raw) return structuredClone(defaultFollowup);
  return followupSchema.parse(JSON.parse(raw));
}
