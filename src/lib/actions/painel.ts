"use server";

import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { consultarPainel } from "../operacao/painel";

export async function carregarPainel(filtro: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "operador");
    return consultarPainel(db(), filtro);
  });
}
