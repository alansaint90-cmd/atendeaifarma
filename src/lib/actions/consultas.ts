"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { effectiveSettings } from "../settings/repository";
import { instanciasConfiguradas } from "../evolution/instancias";
import { dataConsultaSchema } from "../consultas/calendario";
import { identidadeConsultaSchema, reservaConsultaSchema, instanciaConsultaSchema } from "../consultas/schema";
import { consultarHorarios, listarConsultas, reservarConsulta, cancelarConsulta } from "../consultas/repository";
import { consultarResumoAgenda } from "../consultas/resumo";
function exigirModuloClinico(): void { throw new ErroDeNegocio("Agenda clínica indisponível nesta edição. Utilize Pedidos para atendimento da farmácia."); }

export async function carregarResumoAgenda() {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    exigirModuloClinico();
    return consultarResumoAgenda(db());
  });
}

export async function carregarAgendaConsultas(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    exigirModuloClinico();
    const dia = dataConsultaSchema.parse(entrada);
    const instancias = instanciasConfiguradas(await effectiveSettings());
    return { horarios: await consultarHorarios(db(), dia), consultas: await listarConsultas(db(), dia), instancias };
  });
}
export async function confirmarConsulta(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    exigirModuloClinico();
    const dados = z.strictObject({ reserva: reservaConsultaSchema, instancia: instanciaConsultaSchema, solicitacaoId: z.uuid() }).parse(entrada);
    const config = await effectiveSettings();
    if (!instanciasConfiguradas(config).includes(dados.instancia)) throw new ErroDeNegocio("Escolha um chip configurado.");
    const consulta = await reservarConsulta(db(), dados.reserva, { instancia: dados.instancia, origem: sessao.userId,
      identidade: `painel:${sessao.userId}:${dados.solicitacaoId}`, autor: sessao.userId });
    revalidatePath("/"); return consulta;
  });
}
export async function cancelarConsultaAgendada(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    exigirModuloClinico();
    const alvo = identidadeConsultaSchema.parse(entrada);
    const resultado = await cancelarConsulta(db(), alvo, sessao.userId);
    revalidatePath("/"); return resultado;
  });
}
