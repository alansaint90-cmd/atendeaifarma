import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { apagarConversaOperacional } from "../src/lib/operacao/apagar-conversa";

test("PostgreSQL 16: exclusões concorrentes auditam uma vez e respeitam mensagem concorrente", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/atendefarma_test");
  const a = postgres(url.toString(), { max: 1, onnotice: () => {} }), b = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const dbA = drizzle(a), dbB = drizzle(b), autor = randomUUID(), instancia = `exclusao-${randomUUID()}`;
  const sessao = { userId: autor, papel: "admin" as const };
  try {
    assert.match((await a`SHOW server_version`)[0].server_version, /^16\./); await applyMigrations(dbA);
    await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${autor},'Gestor fictício','admin',true,${systemUserId})`;
    for (let i = 0; i < 2; i++) await receberOperacao(dbA, { event: "messages.upsert", instance: instancia, data: {
      key: { id: randomUUID(), fromMe: false, remoteJid: `5511${randomInt(100000000, 999999999)}@s.whatsapp.net` },
      messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Teste local fictício" } } });
    const conversas = await a`SELECT c.id,c.version FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE c.is_deleted=false AND ch.is_deleted=false AND ch.instance_name=${instancia} ORDER BY c.id`;
    const entrada = { id: String(conversas[0].id), version: Number(conversas[0].version) };
    const resultados = await Promise.allSettled([apagarConversaOperacional(dbA, sessao, entrada), apagarConversaOperacional(dbB, sessao, entrada)]);
    assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await a`SELECT id FROM atendeia_audit_logs WHERE entity_id=${entrada.id} AND action='conversa_apagada' AND is_deleted=false`).length, 1);
    const segunda = { id: String(conversas[1].id), version: Number(conversas[1].version) };
    let liberar!: () => void, bloqueada!: () => void;
    const travaObtida = new Promise<void>(resolve => { bloqueada = resolve; }), continuar = new Promise<void>(resolve => { liberar = resolve; });
    const mensagem = a.begin(async tx => {
      await tx`SELECT id FROM atendeia_conversations WHERE id=${segunda.id} AND is_deleted=false FOR UPDATE`;
      bloqueada(); await continuar;
      await tx`UPDATE atendeia_conversations SET version=version+1,updated_at=clock_timestamp() WHERE id=${segunda.id} AND is_deleted=false`;
    });
    await travaObtida;
    const exclusao = apagarConversaOperacional(dbB, sessao, segunda);
    const rejeitada = assert.rejects(exclusao, /Registro alterado/);
    liberar(); await mensagem; await rejeitada;
    assert.equal((await a`SELECT id FROM atendeia_conversations WHERE id=${segunda.id} AND is_deleted=false`).length, 1);
  } finally { await a.end(); await b.end(); }
});
