import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { criarSessao, hashToken, lerSessao, limitarAuth, novoToken } from "../src/lib/auth/repositorio";
import { consumirDesafio, guardarDesafio } from "../src/lib/auth/desafios";
import { configuracaoPasskey } from "../src/lib/auth/passkeys";

test("sessões opacas respeitam suspensão, papel atual, expiração e auditoria atômica", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const usuario = (await cliente.query<{ id: string }>("INSERT INTO atendeia_users(name,enabled,role,modified_by) VALUES ('Teste',true,'operador',$1) RETURNING id", [systemUserId])).rows[0].id;
    const token = novoToken();
    await banco.transaction(tx => criarSessao(tx, usuario, token));
    const gravado = (await cliente.query<{ token_hash: string }>("SELECT token_hash FROM atendeia_sessions")).rows[0].token_hash;
    assert.equal(gravado, hashToken(token)); assert.notEqual(gravado, token);
    assert.equal((await lerSessao(banco, token))?.papel, "operador");
    await cliente.query("UPDATE atendeia_users SET role='visualizador' WHERE id=$1", [usuario]);
    assert.equal((await lerSessao(banco, token))?.papel, "visualizador");
    await cliente.query("UPDATE atendeia_users SET enabled=false WHERE id=$1", [usuario]);
    assert.equal(await lerSessao(banco, token), null);
    await cliente.query("UPDATE atendeia_users SET enabled=true WHERE id=$1", [usuario]);
    await cliente.query("UPDATE atendeia_sessions SET updated_at=now()-interval '2 hours'");
    assert.equal(await lerSessao(banco, token), null);
    await cliente.query("UPDATE atendeia_sessions SET updated_at=now(),expires_at=now()-interval '1 minute'");
    assert.equal(await lerSessao(banco, token), null);
    assert.equal(await lerSessao(banco, "forjado"), null);
    assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='login_passkey'")).rows.length, 1);
    const rejeitado = novoToken();
    await assert.rejects(banco.transaction(async tx => { await criarSessao(tx, usuario, rejeitado); throw new Error("rollback"); }));
    assert.equal(await lerSessao(banco, rejeitado), null);
  } finally { await cliente.close(); }
});

test("desafios são de uso único, com finalidade, validade e limite compartilhado", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const token = await guardarDesafio(banco, "desafio-de-teste", "login");
    await assert.rejects(consumirDesafio(banco, token, "registro"));
    assert.equal((await consumirDesafio(banco, token, "login")).challenge, "desafio-de-teste");
    await assert.rejects(consumirDesafio(banco, token, "login"));
    const expirado = await guardarDesafio(banco, "outro", "login");
    await cliente.query("UPDATE atendeia_auth_desafios SET expira_em=now()-interval '1 minute'");
    await assert.rejects(consumirDesafio(banco, expirado, "login"));
    await limitarAuth(banco, "conta-teste", 2); await limitarAuth(banco, "conta-teste", 2);
    await assert.rejects(limitarAuth(banco, "conta-teste", 2));
    await limitarAuth(banco, "outra-conta", 2);
    await cliente.query("UPDATE atendeia_auth_limites SET janela=now()-interval '2 minutes'");
    await limitarAuth(banco, "conta-teste", 2);
  } finally { await cliente.close(); }
});

test("WebAuthn não deriva a origem de cabeçalhos nem aceita origem insegura de produção", () => {
  assert.throws(() => configuracaoPasskey("http://empresa.example"));
  assert.throws(() => configuracaoPasskey("https://empresa.example/caminho"));
  assert.equal(configuracaoPasskey("https://empresa.example").expectedRPID, "empresa.example");
  assert.equal(configuracaoPasskey("http://localhost:8001").expectedOrigin, "http://localhost:8001");
});
