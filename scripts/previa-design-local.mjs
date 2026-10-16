// Inicia somente a prévia visual com integrações externas desativadas.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const ambiente = { ...process.env };
// Valores vazios explícitos impedem o Next de carregar segredos dos arquivos .env.
for (const arquivo of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  try {
    for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const chave = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      if (chave) ambiente[chave] = "";
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}
Object.assign(ambiente, { NODE_ENV: "development", DATABASE_URL: "", REDIS_URL: "", ATENDEIA_WORKER_ENABLED: "false", AI_ENABLED: "false", AUTH_LOGIN_ENABLED: "false", ATENDEIA_PREVIA_LOCAL: "true" });
const processo = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "8000"], { env: ambiente, stdio: "inherit", windowsHide: true });
processo.on("exit", codigo => { process.exitCode = codigo ?? 1; });
