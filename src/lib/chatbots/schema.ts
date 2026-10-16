import { z } from "zod";

export const personalities = ["Vendedor", "Direto ao ponto", "Profissional", "Amigável", "Empático", "Descontraído"] as const;
const name = z.string().trim().min(1, "Preencha o nome e o identificador.").max(100).regex(/^[^<>\x00-\x1f]+$/u, "O nome contém caracteres inválidos.");
export const chatbotSchema = z.object({
  id: z.string().min(1).max(100), identifier: name, persona: name,
  gender: z.enum(["Feminino", "Masculino", "Neutro"]),
  personalities: z.array(z.enum(personalities)).max(3).refine(items => new Set(items).size === items.length),
  mission: z.string().max(10000), context: z.string().max(200000),
  openingMessages: z.array(z.string().trim().min(1).max(2000).refine(texto => !/\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/iu.test(texto), "A abertura deve perguntar o nome, sem marcadores como [NOME].")).max(2).optional(),
  fallback: z.string().max(10000), delay: z.number().int().min(0).max(3600),
  agendaConsultas: z.boolean().optional(),
  transferMedia: z.boolean(), transferHuman: z.boolean(),
  destination: z.enum(["Atendimento humano", "Comercial", "Suporte", "Financeiro"]),
  transferNotice: z.string().max(10000), closingPhrase: z.string().max(500),
  flows: z.array(z.object({ name, description: z.string().trim().min(1).max(10000) })).max(50),
  temperature: z.number().min(0).max(1), contextRevision: z.string().optional(),
});
export type Chatbot = z.infer<typeof chatbotSchema>;
export const chatbotsSchema = z.array(chatbotSchema).max(100).refine(
  items => new Set(items.map(bot => bot.identifier.toLocaleLowerCase())).size === items.length,
  "Já existe um chatbot com esse identificador.",
).refine(items => new Set(items.map(bot => bot.id)).size === items.length, "Identificador interno duplicado.");
