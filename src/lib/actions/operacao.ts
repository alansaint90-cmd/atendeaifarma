"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { consultarOperacao } from "../operacao/consultas";
import { consultarEstadosIa } from "../operacao/estado-ia";
import { apagarConversaOperacional } from "../operacao/apagar-conversa";
import { excluirContatoOperacional } from "../operacao/excluir-contato";

export async function carregarOperacao() {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador");
    return consultarOperacao(db(), consultarEstadosIa);
  });
}

export async function apagarConversa(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    return apagarConversaOperacional(db(), sessao, entrada);
  });
}

export async function excluirContato(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    return excluirContatoOperacional(db(), sessao, entrada);
  });
}
