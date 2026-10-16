"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { ensureDatabase } from "../db/migrate";
import { listTags, mutateTag } from "../tags/repository";
import { revalidatePath } from "next/cache";

export async function carregarTags() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); await ensureDatabase(); return listTags(db()); });
}
export async function salvarTag(value: unknown, identity?: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); await ensureDatabase();
    const tag = await mutateTag(db(), value, identity, false, sessao.userId);
    revalidatePath("/"); return tag;
  });
}
export async function excluirTag(identity: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); await ensureDatabase();
    const tag = await mutateTag(db(), null, identity, true, sessao.userId);
    revalidatePath("/"); return tag;
  });
}
