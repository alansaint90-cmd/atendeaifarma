import type { SQL } from "drizzle-orm";

export interface TransacaoSql { execute(consulta: SQL): PromiseLike<unknown> }
export interface BancoSql extends TransacaoSql {
  transaction<T>(trabalho: (tx: TransacaoSql) => Promise<T>): Promise<T>;
}
export function linhas<T>(resultado: unknown): T[] {
  return (Array.isArray(resultado) ? resultado : (resultado as { rows: T[] }).rows) as T[];
}
