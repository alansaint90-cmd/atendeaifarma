"use server";
import { revalidatePath } from "next/cache";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { effectiveSettings } from "../settings/repository";
import { instanciasConfiguradas } from "../evolution/instancias";
import { db } from "../db/client";
import { agendamentoSchema } from "../agendamentos/schema";
import { listarAgendamentos, salvarAgendamento, cancelarAgendamento } from "../agendamentos/repository";

export async function carregarAgendamentos() {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    const config = await effectiveSettings();
    return { itens: await listarAgendamentos(db()), instancias: instanciasConfiguradas(config),
      processadorAtivo: process.env.ATENDEIA_WORKER_ENABLED === "true" };
  });
}
export async function gravarAgendamento(entrada: unknown, identidade?: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    const dados = agendamentoSchema.parse(entrada);
    const config = await effectiveSettings();
    if (!instanciasConfiguradas(config).includes(dados.instancia)) throw new ErroDeNegocio("Selecione um chip configurado no servidor.");
    const item = await salvarAgendamento(db(), dados, identidade, sessao.userId); revalidatePath("/"); return item;
  });
}
export async function cancelarEnvioAgendado(identidade: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    const item = await cancelarAgendamento(db(), identidade, sessao.userId); revalidatePath("/"); return item;
  });
}
