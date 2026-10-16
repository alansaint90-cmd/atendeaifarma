import { sql, type SQL } from "drizzle-orm";
import { linhas, type TransacaoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { type SessaoAtiva, exigirPermissao } from "../auth/permissoes";
import { PAPEIS, type Papel } from "../db/schema/_enums";

/** Revalida o ator dentro da transação, inclusive para chamadas internas. */
export async function atorCrm(tx: TransacaoSql, sessao: SessaoAtiva, minimo: Papel = "visualizador") {
  const [usuario] = linhas<{ papel: Papel }>(await tx.execute(sql`SELECT role AS papel FROM atendeia_users
    WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false FOR SHARE`));
  if (!usuario || !PAPEIS.includes(usuario.papel)) throw new ErroDeNegocio("Sessão indisponível.");
  const ator = { userId: sessao.userId, papel: usuario.papel };
  await exigirPermissao(ator, minimo, tx); return ator;
}
export function escopoFunil(ator: SessaoAtiva, campo: SQL) {
  return ator.papel === "super_admin" || ator.papel === "admin" ? sql`true` : sql`EXISTS (
    SELECT 1 FROM atendeia_funis_acessos acesso WHERE acesso.funil_id=${campo} AND acesso.usuario_id=${ator.userId} AND acesso.is_deleted=false)`;
}
export async function exigirFunil(tx: TransacaoSql, ator: SessaoAtiva, id: string) {
  const encontrado = linhas(await tx.execute(sql`SELECT id FROM atendeia_funis WHERE id=${id} AND is_deleted=false
    AND ${escopoFunil(ator, sql`atendeia_funis.id`)} FOR SHARE`));
  if (!encontrado.length) throw new ErroDeNegocio("Funil indisponível ou sem permissão.");
}
export async function auditarCrm(tx: TransacaoSql, ator: SessaoAtiva, id: string, acao: string, campos: string[] = [], detalhes: { motivo?: string; antes?: string[]; depois?: string[] } = {}) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(entity_type,entity_id,action,changed_fields,modified_by,details)
    VALUES ('crm',${id},${acao},${JSON.stringify(campos)}::jsonb,${ator.userId},${JSON.stringify(detalhes)}::jsonb)`);
}
