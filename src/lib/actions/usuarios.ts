"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { listarUsuarios, criarUsuario, alterarUsuario, renovarConvite } from "../auth/usuarios";

export async function carregarUsuarios() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return listarUsuarios(db(), sessao); });
}
export async function convidarUsuario(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return criarUsuario(db(), sessao, entrada); });
}
export async function atualizarUsuario(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return alterarUsuario(db(), sessao, entrada); });
}
export async function reiniciarAcessoUsuario(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return renovarConvite(db(), sessao, entrada); });
}
