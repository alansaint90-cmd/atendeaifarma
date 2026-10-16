import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import { linhas, type TransacaoSql } from "../db/porta";
import type { SessaoAtiva } from "../auth/permissoes";
import { systemUserId } from "../db/bootstrap";
export type AtorFarmacia = SessaoAtiva | { sistema: true };
export async function autorizar(tx: TransacaoSql, ator: AtorFarmacia, minimo: "visualizador" | "operador" | "admin" = "operador", permiteSistema = false) {
  if ("sistema" in ator) {
    if (!permiteSistema) throw new ErroDeNegocio("Esta operação exige um atendente autorizado.");
    return systemUserId;
  }
  z.uuid().parse(ator.userId);
  const [usuario] = linhas<{role:string}>(await tx.execute(sql`SELECT role FROM atendeia_users WHERE id=${ator.userId} AND enabled=true AND is_deleted=false`));
  const niveis = ["super_admin","admin","operador","visualizador"];
  if (!usuario || !niveis.includes(usuario.role) || niveis.indexOf(usuario.role)>niveis.indexOf(minimo)) throw new ErroDeNegocio("Sem permissão para esta operação.");
  return ator.userId;
}
// Todas as mutações de estoque/pedido tomam esta trava antes de bloquear linhas.
// O isolamento por implantação limita a serialização à farmácia atual.
export async function travarEstoque(tx: TransacaoSql) { await tx.execute(sql`SELECT pg_advisory_xact_lock(714202610)`); }
export async function auditar(tx: TransacaoSql, autor: string, id: string, acao: string) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
    VALUES (${acao},'farmacia',${id},'["operacao"]'::jsonb,${autor})`);
}
export async function evento(tx: TransacaoSql, autor: string, id: string, tipo: string, detalhe: string, chave: string) {
  await tx.execute(sql`INSERT INTO atendeia_pedidos_eventos(pedido_id,tipo,detalhe,chave,modified_by) VALUES (${id},${tipo},${detalhe},${chave},${autor})`);
  await auditar(tx,autor,id,`pedido_${tipo}`);
}
export const hoje = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
export const elegivel = sql`l.is_deleted=false AND l.bloqueado=false AND (l.validade IS NULL OR l.validade>=${hoje}) AND (p.medicamento=false OR l.validade IS NOT NULL) AND p.ativo=true AND p.is_deleted=false`;
export const reservaAtiva = sql`r.is_deleted=false AND r.status='ativa' AND r.expira_em>now()`;
