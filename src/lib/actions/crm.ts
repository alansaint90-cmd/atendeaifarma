"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { consultarCrm } from "../crm/consultas";
import { catalogoCrm, criarFunil, criarMotivo, alterarMotivo, definirAcessos } from "../crm/cadastros";
import { criarOportunidade, encerrarOportunidade, moverOportunidade } from "../crm/oportunidades";

export async function carregarCrm(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    return { catalogo: await catalogoCrm(db(), sessao), consulta: await consultarCrm(db(), sessao, entrada) }; });
}
export async function adicionarFunil(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return criarFunil(db(), sessao, entrada); });
}
export async function adicionarMotivo(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return criarMotivo(db(), sessao, entrada); });
}
export async function modificarMotivo(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return alterarMotivo(db(), sessao, entrada); });
}
export async function salvarAcessosFunis(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return definirAcessos(db(), sessao, entrada); });
}
export async function adicionarOportunidade(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador"); return criarOportunidade(db(), sessao, entrada); });
}
export async function fecharNegocio(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador"); return encerrarOportunidade(db(), sessao, entrada); });
}
export async function moverNegocio(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador"); return moverOportunidade(db(), sessao, entrada); });
}
