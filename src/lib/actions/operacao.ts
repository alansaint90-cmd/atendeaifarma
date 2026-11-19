"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { consultarOperacao } from "../operacao/consultas";
import { apagarConversaOperacional } from "../operacao/apagar-conversa";

export async function carregarOperacao() {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador");
    return consultarOperacao(db());
  });
}

export async function apagarConversa(entrada: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    return apagarConversaOperacional(db(), sessao, entrada);
  });
}
