import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { bootstrapSql, seedSql } from "./bootstrap";
import { db } from "./client";
import { codigoSeguroBanco, ErroPreparacaoBanco, type EtapaPreparacaoBanco } from "./diagnostico";

interface MigrationTransaction { execute: (query: SQL) => PromiseLike<unknown> }
interface MigrationDatabase { transaction: (work: (tx: MigrationTransaction) => Promise<void>) => Promise<void> }
function resultRows(value: unknown): { id: string; checksum: string }[] {
  return (Array.isArray(value) ? value : (value as { rows: { id: string; checksum: string }[] }).rows);
}
export async function applyMigrations(database: MigrationDatabase) {
  let etapa: EtapaPreparacaoBanco = "arquivos_migracoes";
  try {
    const folder = path.join(process.cwd(), "src/lib/db/migrations");
    const journal = JSON.parse(await readFile(path.join(folder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    const migrations = await Promise.all(journal.entries.map(async ({ tag }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(tag)) throw new ErroPreparacaoBanco(etapa,"NOME_MIGRACAO_INVALIDO");
      const content = (await readFile(path.join(folder, `${tag}.sql`), "utf8")).replaceAll("\r\n", "\n");
      return { id: tag, content, checksum: createHash("sha256").update(content).digest("hex") };
    }));
    etapa = "conexao_transacao";
    await database.transaction(async tx => {
      etapa = "configuracao_transacao";
      await tx.execute(sql`SET LOCAL lock_timeout = '30s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
      etapa = "trava_migracoes";
      await tx.execute(sql`SELECT pg_advisory_xact_lock(712940861)`);
      etapa = "estrutura_base";
      for (const statement of bootstrapSql.split(";").filter(value => value.trim())) await tx.execute(sql.raw(statement));
      etapa = "historico_migracoes";
      const applied = resultRows(await tx.execute(sql`SELECT id, checksum FROM atendeia_migrations WHERE is_deleted = false`));
      for (const migration of migrations) {
        const previous = applied.find(item => item.id === migration.id);
        if (previous) {
          if (previous.checksum !== migration.checksum) throw new ErroPreparacaoBanco("historico_migracoes","MIGRACAO_ALTERADA");
          continue;
        }
        etapa = "aplicacao_migracao";
        for (const statement of migration.content.split("--> statement-breakpoint").filter(value => value.trim())) {
          await tx.execute(sql.raw(statement));
        }
        etapa = "registro_migracao";
        await tx.execute(sql`INSERT INTO atendeia_migrations (id, checksum, modified_by)
          VALUES (${migration.id}, ${migration.checksum}, 'bootstrap-admin')`);
      }
      etapa = "dados_sistema";
      for (const statement of seedSql.split(";").filter(value => value.trim())) await tx.execute(sql.raw(statement));
      etapa = "conclusao_transacao";
    });
  } catch (erro) {
    if (erro instanceof ErroPreparacaoBanco) throw erro;
    throw new ErroPreparacaoBanco(etapa,codigoSeguroBanco(erro));
  }
}

let initialization: Promise<void> | undefined;
export function ensureDatabase() {
  return initialization ??= applyMigrations({ transaction: work => db().transaction(tx => work(tx)) })
    .catch((erro: unknown) => {
      initialization = undefined;
      if (erro instanceof ErroPreparacaoBanco) throw erro;
      throw new Error("Não foi possível preparar o banco. Confira DATABASE_URL, disponibilidade e permissão CREATE no PostgreSQL e a integridade das migrações.");
    });
}
