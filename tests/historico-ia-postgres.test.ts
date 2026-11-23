import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID, createHash } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { registrarEnvioIa } from "../src/lib/operacao/atribuir-ia";
import { receberOperacao } from "../src/lib/operacao/receber";

test("PostgreSQL 16: resposta e eco concorrentes persistem um único balão", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/atendefarma_test");
  const a = postgres(url.toString(), { max: 1, onnotice: () => {} }), b = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const dbA = drizzle(a), dbB = drizzle(b), instancia = `historico-${randomUUID()}`, numero = `5511${randomInt(100000000, 999999999)}`;
  const evento = (id: string, saida: boolean) => ({ event: "messages.upsert" as const, instance: instancia, data: {
    key: { id, fromMe: saida, remoteJid: `${numero}@s.whatsapp.net` }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Teste fictício" },
  } });
  try {
    assert.match((await a`SHOW server_version`)[0].server_version, /^16\./); await applyMigrations(dbA);
    const entrada = evento(randomUUID(), false);
    await receberOperacao(dbA, entrada);
    const origem = { identidade: createHash("sha256").update(`${instancia}:${entrada.data.key.id}`).digest("hex"), instante: entrada.data.messageTimestamp };
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      await Promise.all([registrarEnvioIa(dbA, instancia, id, { numero, texto: "Teste fictício", origem }), receberOperacao(dbB, evento(id, true))]);
      assert.equal((await a`SELECT m.id,m.sender_type FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id
        JOIN atendeia_channels ch ON ch.id=c.channel_id WHERE ch.instance_name=${instancia} AND m.provider_message_id=${id}
          AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false`).length, 1);
      assert.equal((await a`SELECT sender_type FROM atendeia_messages WHERE provider_message_id=${id} AND is_deleted=false`)[0].sender_type, "bot");
    }
  } finally { await a.end(); await b.end(); }
});
