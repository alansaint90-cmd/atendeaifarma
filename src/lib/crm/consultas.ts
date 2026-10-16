import { sql, type SQL } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import type { SessaoAtiva } from "../auth/permissoes";
import { filtrosCrm, type FiltrosCrm } from "./validacao";
import { atorCrm, escopoFunil } from "./acesso";

function condicoes(ator: SessaoAtiva, f: FiltrosCrm): SQL {
  const partes: SQL[] = [sql`o.is_deleted=false AND f.is_deleted=false`, escopoFunil(ator, sql`o.funil_id`)];
  if (f.funilId) partes.push(sql`o.funil_id=${f.funilId}`);
  if (f.etapaId) partes.push(sql`o.etapa_id=${f.etapaId}`);
  if (f.responsavelId) partes.push(sql`o.responsavel_id=${f.responsavelId}`);
  if (f.canalId) partes.push(sql`o.canal_id=${f.canalId}`);
  if (f.status) partes.push(sql`o.status=${f.status}`);
  if (f.motivoId) partes.push(sql`o.motivo_id=${f.motivoId}`);
  if (f.criadoDe) partes.push(sql`o.created_at>=${f.criadoDe}::timestamptz`);
  if (f.criadoAte) partes.push(sql`o.created_at<${f.criadoAte}::timestamptz`);
  if (f.fechadoDe) partes.push(sql`o.fechado_em>=${f.fechadoDe}::timestamptz`);
  if (f.fechadoAte) partes.push(sql`o.fechado_em<${f.fechadoAte}::timestamptz`);
  for (const tag of new Set(f.tags)) partes.push(sql`EXISTS(SELECT 1 FROM atendeia_funis_oportunidades_tags ot JOIN atendeia_tags t ON t.id=ot.tag_id WHERE ot.oportunidade_id=o.id AND ot.tag_id=${tag} AND ot.is_deleted=false AND t.is_deleted=false)`);
  return sql.join(partes, sql` AND `);
}
export interface Oportunidade { id: string; titulo: string; valor: string; status: "aberta" | "ganha" | "perdida"; funilId: string; etapaId: string; responsavel: string; updatedAt: string; criadoEm: string; fechadoEm: string | null }
export async function consultarCrm(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const filtro = filtrosCrm.parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao); const where = condicoes(ator, filtro);
    const itens = linhas<Oportunidade>(await tx.execute(sql`SELECT o.id,o.titulo,o.valor,o.status,o.funil_id AS "funilId",o.etapa_id AS "etapaId",u.name AS responsavel,
      o.updated_at AS "updatedAt",o.created_at AS "criadoEm",o.fechado_em AS "fechadoEm"
      FROM atendeia_funis_oportunidades o JOIN atendeia_funis f ON f.id=o.funil_id JOIN atendeia_users u ON u.id=o.responsavel_id
      WHERE ${where} ORDER BY o.created_at DESC,o.id LIMIT 50 OFFSET ${(filtro.pagina - 1) * 50}`));
    const [resumo] = linhas<{ total: number; ganhas: number; perdidas: number; receita: string; conversao: string }>(await tx.execute(sql`
      SELECT count(*)::int AS total,count(*) FILTER(WHERE o.status='ganha')::int AS ganhas,count(*) FILTER(WHERE o.status='perdida')::int AS perdidas,
      coalesce(sum(o.valor) FILTER(WHERE o.status='ganha'),0)::numeric(20,2)::text AS receita,
      coalesce(round(100.0*count(*) FILTER(WHERE o.status='ganha')/nullif(count(*) FILTER(WHERE o.status<>'aberta'),0),2),0)::text AS conversao
      FROM atendeia_funis_oportunidades o JOIN atendeia_funis f ON f.id=o.funil_id WHERE ${where}`));
    const receitas = linhas<{ funil: string; responsavel: string; valor: string }>(await tx.execute(sql`SELECT f.nome AS funil,u.name AS responsavel,sum(o.valor)::numeric(20,2)::text AS valor
      FROM atendeia_funis_oportunidades o JOIN atendeia_funis f ON f.id=o.funil_id JOIN atendeia_users u ON u.id=o.responsavel_id
      WHERE ${where} AND o.status='ganha' GROUP BY f.id,u.id ORDER BY f.nome,u.name`));
    const perdas = linhas<{ motivoId: string; motivo: string; quantidade: number; percentual: string; valor: string }>(await tx.execute(sql`
      SELECT o.motivo_id AS "motivoId",fe.motivo,count(*)::int AS quantidade,sum(o.valor)::numeric(20,2)::text AS valor,
      round(100.0*count(*)/nullif(sum(count(*)) OVER(),0),2)::text AS percentual
      FROM atendeia_funis_oportunidades o JOIN atendeia_funis f ON f.id=o.funil_id
      JOIN atendeia_funis_oportunidades_fechamentos fe ON fe.oportunidade_id=o.id AND fe.is_deleted=false
      WHERE ${where} AND o.status='perdida' GROUP BY o.motivo_id,fe.motivo ORDER BY quantidade DESC`));
    return { itens: itens.map(i => ({ ...i, updatedAt: new Date(i.updatedAt).toISOString(), criadoEm: new Date(i.criadoEm).toISOString(), fechadoEm: i.fechadoEm ? new Date(i.fechadoEm).toISOString() : null })), resumo, receitas, perdas };
  });
}
