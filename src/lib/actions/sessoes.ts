"use server";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { nomeCookieSessao, opcoesCookie } from "../auth/cookies";
import { hashToken, auditarIdentidade } from "../auth/repositorio";
import { db } from "../db/client";

export async function minhasSessoes() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador");
    const atual = hashToken((await cookies()).get(nomeCookieSessao())?.value ?? "");
    const itens = await db().execute(sql`SELECT id,created_at,updated_at,expires_at,(token_hash=${atual}) AS atual FROM atendeia_sessions
      WHERE user_id=${sessao.userId} AND is_deleted=false AND expires_at>now() AND updated_at>now()-interval '1 hour' ORDER BY created_at DESC LIMIT 100`);
    return itens.map(i => ({ id: String(i.id), criadoEm: new Date(String(i.created_at)).toISOString(), expiraEm: new Date(String(i.expires_at)).toISOString(), atual: Boolean(i.atual) }));
  });
}
export async function encerrarMinhaSessao(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "visualizador"); const id = z.uuid().parse(entrada);
    const cookie = await cookies(); const hash = hashToken(cookie.get(nomeCookieSessao())?.value ?? "");
    const atual = await db().transaction(async tx => {
      const itens = await tx.execute(sql`UPDATE atendeia_sessions SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${sessao.userId}
        WHERE id=${id} AND user_id=${sessao.userId} AND is_deleted=false RETURNING (token_hash=${hash}) AS atual`);
      if (!itens.length) throw new ErroDeNegocio("Sessão indisponível.");
      await auditarIdentidade(tx, sessao.userId, "sessao_encerrada", id); return Boolean(itens[0].atual);
    });
    if (atual) cookie.set(nomeCookieSessao(), "", opcoesCookie(0)); return { atual };
  });
}

export async function sairDoSistema() {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "visualizador");
    const cookie = await cookies();
    await db().transaction(async tx => {
      const itens = await tx.execute(sql`UPDATE atendeia_sessions SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${sessao.userId}
        WHERE id=${sessao.sessionId} AND user_id=${sessao.userId} AND is_deleted=false RETURNING id`);
      if (!itens.length) throw new ErroDeNegocio("Sessão indisponível.");
      await auditarIdentidade(tx, sessao.userId, "sessao_encerrada", sessao.sessionId);
    });
    cookie.set(nomeCookieSessao(), "", opcoesCookie(0));
    return { atual: true };
  });
}
