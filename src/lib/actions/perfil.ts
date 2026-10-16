"use server";

import { revalidatePath } from "next/cache";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { lerPerfil, atualizarPerfil } from "../perfil/servico";

export async function carregarMeuPerfil() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador"); return lerPerfil(db(), sessao); });
}

export async function salvarMeuPerfil(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    const dados = await atualizarPerfil(db(), sessao, entrada);
    revalidatePath("/perfil"); revalidatePath("/"); return dados;
  });
}
