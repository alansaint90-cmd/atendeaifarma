export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { ensureDatabase } = await import("./lib/db/migrate");
    await ensureDatabase();
    console.info("Atende AI: migrações PostgreSQL verificadas com sucesso.");
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ATENDEIA_WORKER_ENABLED === "true") {
    const { startAgentWorker } = await import("./lib/agent/worker");
    startAgentWorker();
  }
}
