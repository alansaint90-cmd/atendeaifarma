import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { systemUserId } from "../db/bootstrap";
import { linhas, type TransacaoSql } from "../db/porta";
import { hashToken, novoToken } from "./repositorio";

export const recusaLogin = () => new ErroDeNegocio("Não foi possível autenticar. Confira o acesso e tente novamente.");
export interface Desafio { challenge: string; userId: string | null; conviteId: string | null }
export async function guardarDesafio(banco: TransacaoSql, challenge: string, finalidade: "registro" | "login" | "fator", usuario?: string, convite?: string) {
  const token = novoToken();
  await banco.execute(sql`INSERT INTO atendeia_auth_desafios(token_hash,challenge,finalidade,user_id,convite_id,expira_em,modified_by)
    VALUES (${hashToken(token)},${challenge},${finalidade},${usuario ?? null},${convite ?? null},now()+interval '5 minutes',${systemUserId})`);
  return token;
}
/** Consumido mesmo se a verificação posterior falhar: cada desafio permite uma tentativa. */
export async function consumirDesafio(banco: TransacaoSql, token: string, finalidade: "registro" | "login" | "fator") {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw recusaLogin();
  const [item] = linhas<Desafio>(await banco.execute(sql`UPDATE atendeia_auth_desafios SET usado_em=now(),updated_at=now()
    WHERE token_hash=${hashToken(token)} AND finalidade=${finalidade} AND is_deleted=false AND usado_em IS NULL AND expira_em>now()
    RETURNING challenge,user_id AS "userId",convite_id AS "conviteId"`));
  if (!item) throw recusaLogin();
  return item;
}
