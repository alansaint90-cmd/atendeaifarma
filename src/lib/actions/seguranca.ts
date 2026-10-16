"use server";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { mudarSenha } from "../auth/trocar-senha";
import { nomeCookieSessao, opcoesCookie } from "../auth/cookies";
import { auditarIdentidade } from "../auth/repositorio";
import { revogarAcessos } from "../auth/usuarios";

export async function trocarMinhaSenha(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    const resultado = await mudarSenha(db(), sessao, entrada);
    (await cookies()).set(nomeCookieSessao(), "", opcoesCookie(0)); return resultado;
  });
}
export async function minhasPasskeys() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    const itens = await db().execute(sql`SELECT id,nome,created_at FROM atendeia_users_passkeys WHERE user_id=${sessao.userId} AND is_deleted=false ORDER BY created_at`);
    return itens.map(i => ({ id: String(i.id), nome: String(i.nome) }));
  });
}
export async function removerMinhaPasskey(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    const id = z.uuid().parse(entrada);
    await db().transaction(async tx => {
      const ativos = await tx.execute(sql`SELECT id FROM atendeia_users WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false FOR UPDATE`);
      if (!ativos.length) throw new ErroDeNegocio("Sessão expirada. Entre novamente.");
      const itens = await tx.execute(sql`SELECT id FROM atendeia_users_passkeys WHERE user_id=${sessao.userId} AND is_deleted=false FOR UPDATE`);
      if (itens.length < 2 || !itens.some(i => i.id === id)) throw new ErroDeNegocio("Cadastre outra passkey antes de remover esta.");
      await auditarIdentidade(tx, sessao.userId, "passkey_removida", id);
      await tx.execute(sql`UPDATE atendeia_users_passkeys SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${sessao.userId}
        WHERE id=${id} AND user_id=${sessao.userId} AND is_deleted=false`);
      await revogarAcessos(tx, sessao.userId, sessao.userId);
    });
    (await cookies()).set(nomeCookieSessao(), "", opcoesCookie(0));
  });
}
