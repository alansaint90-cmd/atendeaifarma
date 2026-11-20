import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { autorizar, hoje, type AtorFarmacia } from "./comum";

export const periodoMovimentosSchema=z.strictObject({dias:z.union([z.literal(7),z.literal(15),z.literal(30)]).default(7)});
export interface MovimentoDiario {dia:string;entradas:number;saidas:number;variacao:number}
export async function consultarMovimentacao(banco:BancoSql,ator:AtorFarmacia,entrada:unknown) {
  const {dias}=periodoMovimentosSchema.parse(entrada);
  return banco.transaction(async tx=>{
    await autorizar(tx,ator,"operador");
    const movimentos=linhas<MovimentoDiario>(await tx.execute(sql`
      WITH dias AS (SELECT (${hoje}-s)::date dia FROM generate_series(0,${dias-1}) s), movimentos AS (
        SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date dia,
          sum(greatest(m.quantidade,0))::int entradas,sum(greatest(-m.quantidade,0))::int saidas,sum(m.quantidade)::int variacao
        FROM atendeia_produtos_movimentos m JOIN atendeia_produtos_lotes l ON l.id=m.lote_id JOIN atendeia_produtos p ON p.id=l.produto_id
        WHERE m.is_deleted=false AND l.is_deleted=false AND p.is_deleted=false
          AND m.created_at>=(((${hoje}-(${dias}-1))::timestamp) AT TIME ZONE 'America/Sao_Paulo')
          AND m.created_at<(((${hoje}+1)::timestamp) AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY 1)
      SELECT d.dia::text,coalesce(m.entradas,0)::int entradas,coalesce(m.saidas,0)::int saidas,coalesce(m.variacao,0)::int variacao
      FROM dias d LEFT JOIN movimentos m ON m.dia=d.dia ORDER BY d.dia`));
    const categorias=linhas<{nome:string}>(await tx.execute(sql`SELECT DISTINCT categoria nome FROM atendeia_produtos WHERE is_deleted=false ORDER BY categoria`)).map(c=>c.nome);
    return {movimentos,dias,categorias};
  });
}
