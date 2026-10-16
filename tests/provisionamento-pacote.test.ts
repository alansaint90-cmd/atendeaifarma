import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

test("provisionamento empacotado funciona sem checkout e recusa configuração ausente", async () => {
  const pasta = await mkdtemp(path.join(tmpdir(), "atendeia-provisionamento-"));
  const destino = path.join(pasta, "provisionar.cjs");
  try {
    await build({ entryPoints: ["scripts/provisionar-proprietario.ts"], bundle: true, platform: "node", format: "cjs", target: "node24", outfile: destino, logLevel: "silent" });
    const resultado = spawnSync(process.execPath, [destino], { cwd: pasta, encoding: "utf8", timeout: 15000,
      env: { ...process.env, DATABASE_URL: "", AUTH_ORIGIN: "", PROVISIONAR_NOME: "", PROVISIONAR_EMAIL: "", PROVISIONAR_ARQUIVO: "", PROVISIONAR_DIAGNOSTICO: "true" } });
    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /Provisionamento não concluído/);
    assert.match(resultado.stderr, /Diagnóstico seguro: validacao_de_variaveis/);
    assert.doesNotMatch(resultado.stderr, /MODULE_NOT_FOUND|Cannot find module|ReferenceError/);
    assert.equal(resultado.stdout, "");
    const docker = await readFile("Dockerfile", "utf8");
    assert.match(docker, /pnpm build:provisionamento/);
    assert.match(docker, /COPY --from=build.*provisionar-proprietario\.cjs/);
    assert.match(docker, /CMD \["node", "server\.js"\]/);
  } finally { await unlink(destino).catch(() => {}); await rmdir(pasta); }
});
