import { z } from "zod";
import { novaSenha, senhaEntrada } from "./senhas";
const base64 = z.string().min(1).max(24000).regex(/^[A-Za-z0-9_-]+$/);
const base = {
  id: base64.max(2048), rawId: base64.max(2048), type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.object({ credProps: z.object({ rk: z.boolean().optional() }).optional() }).strip(),
};
export const registroResposta = z.strictObject({ ...base, response: z.strictObject({
  clientDataJSON: base64, attestationObject: base64, authenticatorData: base64.optional(),
  transports: z.array(z.string().max(30)).max(10).optional(), publicKey: base64.optional(), publicKeyAlgorithm: z.number().int().optional(),
}) });
export const loginResposta = z.strictObject({ ...base, response: z.strictObject({
  clientDataJSON: base64, authenticatorData: base64, signature: base64, userHandle: base64.optional(),
}) });
export const entradaAuth = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("iniciar_fator"), senha: senhaEntrada }),
  z.strictObject({ acao: z.literal("concluir_fator"), resposta: registroResposta }),
  z.strictObject({ acao: z.literal("iniciar_login") }),
  z.strictObject({ acao: z.literal("iniciar_senha"), email: z.email().max(254), senha: senhaEntrada }),
  z.strictObject({ acao: z.literal("iniciar_registro"), convite: z.string().regex(/^[A-Za-z0-9_-]{43}$/), senha: novaSenha }),
  z.strictObject({ acao: z.literal("concluir_registro_senha"), convite: z.string().regex(/^[A-Za-z0-9_-]{43}$/), senha: novaSenha }),
  z.strictObject({ acao: z.literal("concluir_login"), resposta: loginResposta }),
  z.strictObject({ acao: z.literal("concluir_registro"), resposta: registroResposta }),
]);
