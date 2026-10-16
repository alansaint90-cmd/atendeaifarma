"use server";
import { z } from "zod";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { chatbotSchema } from "../chatbots/schema";
import { salvarChatbotServidor } from "../chatbots/server-repository";
import { effectiveSettings } from "../settings/repository";
import { instanciasConfiguradas } from "../evolution/instancias";
import { prepararAssistentes } from "../chatbots/instancias";

const salvarSchema = z.strictObject({
  id: z.uuid().nullable(),
  versao: z.number().int().min(0).nullable(),
  configuracao: chatbotSchema,
  instancia: z.string().min(1).max(100).regex(/^[\p{L}\p{N}_. -]+$/u),
});

export async function carregarChatbots() {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "admin");
    const instancias = instanciasConfiguradas(await effectiveSettings());
    return prepararAssistentes(db(), instancias, sessao.userId);
  });
}

export async function salvarChatbot(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "admin");
    const validado = salvarSchema.safeParse(entrada);
    if (!validado.success) throw new ErroDeNegocio(validado.error.issues[0]?.message ?? "Configuração inválida.");
    const { id, versao, configuracao } = validado.data;
    const settings = await effectiveSettings();
    const instancia = validado.data.instancia;
    if (!instanciasConfiguradas(settings).includes(instancia)) throw new ErroDeNegocio("Selecione uma instância configurada no servidor.");
    return salvarChatbotServidor(db(), { id, versao, configuracao, instancia, usuario: sessao.userId });
  });
}
