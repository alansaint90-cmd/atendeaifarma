import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { systemUserId } from "../db/bootstrap";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { PAPEIS, type Papel } from "../db/schema/_enums";
import { contextoAuth } from "./contexto";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const novoToken = () => randomBytes(32).toString("base64url");
export interface Identidade { userId: string; papel: Papel; nome: string; email: string; sessionId: string }

export async function auditarIdentidade(tx: TransacaoSql, ator: string, acao: string, objeto = ator) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields,details)
    VALUES (${ator},${acao},'identidade',${objeto},'[]'::jsonb,${JSON.stringify(contextoAuth.getStore() ?? {})}::jsonb)`);
}

/** Papel e suspensão são consultados em toda requisição. O token nunca carrega privilégios. */
export async function lerSessao(banco: TransacaoSql, token: string): Promise<Identidade | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [registro] = linhas<Identidade>(await banco.execute(sql`
    UPDATE atendeia_sessions s SET updated_at=now()
    FROM atendeia_users u WHERE s.user_id=u.id AND s.token_hash=${hashToken(token)}
    AND s.is_deleted=false AND u.is_deleted=false AND u.enabled=true
    AND s.expires_at>now() AND s.updated_at>now()-interval '1 hour'
    RETURNING u.id AS "userId",u.role AS papel,u.name AS nome,u.email AS email,s.id AS "sessionId"`));
  return registro && PAPEIS.includes(registro.papel) ? registro : null;
}

export async function criarSessao(tx: TransacaoSql, usuario: string, token: string, duracaoSegundos = 86400, acao = "login_passkey") {
  const duracao = Number.isInteger(duracaoSegundos) && duracaoSegundos >= 300 && duracaoSegundos <= 60 * 60 * 24 * 30
    ? duracaoSegundos
    : 86400;
  await tx.execute(sql`INSERT INTO atendeia_sessions(user_id,token_hash,expires_at,modified_by)
    VALUES (${usuario},${hashToken(token)},now()+(${duracao} * interval '1 second'),${usuario})`);
  await auditarIdentidade(tx, usuario, acao);
}

/** Contador compartilhado entre réplicas; sua transação não deve ser revertida pela autenticação. */
export async function limitarAuth(banco: BancoSql, chave: string, limite = 30) {
  const [registro] = linhas<{ tentativas: number }>(await banco.execute(sql`
    INSERT INTO atendeia_auth_limites(chave,janela,tentativas,modified_by)
    VALUES (${hashToken(chave)},now(),1,${systemUserId})
    ON CONFLICT(chave) WHERE is_deleted=false DO UPDATE SET
    tentativas=CASE WHEN atendeia_auth_limites.janela<now()-interval '1 minute' THEN 1 ELSE atendeia_auth_limites.tentativas+1 END,
    janela=CASE WHEN atendeia_auth_limites.janela<now()-interval '1 minute' THEN now() ELSE atendeia_auth_limites.janela END,
    updated_at=now()
    RETURNING tentativas`));
  if (!registro || registro.tentativas > limite) throw new ErroDeNegocio("Muitas tentativas. Aguarde um minuto e tente novamente.");
}
