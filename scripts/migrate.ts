import { ensureDatabase } from "../src/lib/db/migrate";
import { closeDatabase } from "../src/lib/db/client";

async function main() {
  try {
    await ensureDatabase();
    console.info("AtendeIA: tabelas e migrações verificadas com sucesso.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Falha ao preparar o banco.");
    process.exitCode = 1;
  } finally { await closeDatabase(); }
}
void main();
