import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { atualizarPerfil, lerPerfil } from "../src/lib/perfil/servico";

test("cadastro próprio persiste nome, celular e foto com auditoria e trava de versão", async () => {
  const cliente = new PGlite();
  const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const id = (await cliente.query<{ id: string }>(
      "INSERT INTO atendeia_users(name,email,role,enabled,modified_by) VALUES ('Nome anterior','perfil@example.test','operador',true,$1) RETURNING id",
      [systemUserId],
    )).rows[0].id;
    const sessao = { userId: id, papel: "operador" as const };
    const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString("base64")}`;
    const inicial = await lerPerfil(banco, sessao);
    const salvo = await atualizarPerfil(banco, sessao, { nome: "Nome atualizado", celular: "(11) 98765-4321", foto: png, version: inicial.version });
    assert.equal(salvo.nome, "Nome atualizado");
    assert.equal(salvo.email, "perfil@example.test");
    assert.equal(salvo.foto, png);
    assert.equal(salvo.version, inicial.version + 1);
    assert.deepEqual(await lerPerfil(banco, sessao), salvo);
    const trilha = (await cliente.query<{ changed_fields: string[]; modified_by: string }>(
      "SELECT changed_fields,modified_by FROM atendeia_audit_logs WHERE action='perfil_atualizado'",
    )).rows;
    assert.equal(trilha.length, 1);
    assert.equal(trilha[0].modified_by, id);
    assert.deepEqual(trilha[0].changed_fields, ["nome", "celular", "foto"]);
    await assert.rejects(atualizarPerfil(banco, sessao, { nome: "Sobrescrita", celular: "", foto: null, version: inicial.version }), /outra sessão/);
    await assert.rejects(atualizarPerfil(banco, sessao, { nome: "Invasão", celular: "", foto: null, version: salvo.version, userId: systemUserId }));
    await assert.rejects(atualizarPerfil(banco, sessao, { nome: "Foto inválida", celular: "", foto: "data:image/svg+xml;base64,PHN2Zz4=", version: salvo.version }), /imagem JPG ou PNG/);
    assert.deepEqual(await lerPerfil(banco, sessao), salvo);
  } finally { await cliente.close(); }
});
