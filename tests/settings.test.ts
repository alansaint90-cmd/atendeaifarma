import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "../src/lib/settings/security";
import { saveSettingsSchema, settingsSchema, settingsStatus } from "../src/lib/settings/schema";

test("criptografia aleatória autentica dados e não permite chave incorreta", () => {
  const key = randomBytes(32).toString("base64");
  const values = { OPENAI_API_KEY: "sk-test-only" };
  const encrypted = seal(values, key);
  assert.ok(!encrypted.includes(values.OPENAI_API_KEY));
  assert.notEqual(encrypted, seal(values, key));
  assert.deepEqual(unseal(encrypted, key), values);
  assert.throws(() => unseal(encrypted, randomBytes(32).toString("base64")));
  const parts = encrypted.split(".");
  const payload = Buffer.from(parts[2], "base64");
  payload[0] ^= 1;
  parts[2] = payload.toString("base64");
  assert.throws(() => unseal(parts.join("."), key));
  assert.throws(() => seal(values, "invalida"));
});

test("resposta ao navegador omite todas as credenciais", () => {
  const values = { OPENAI_API_KEY: "sk-test-only", EVOLUTION_API_KEY: "secret-evolution", EVOLUTION_WEBHOOK_SECRET: "x".repeat(32), REDIS_URL: "redis://default:secret@localhost:6379/0", OPENAI_MODEL: "model-example" };
  const status = settingsStatus(values, 7);
  assert.equal(status.version, 7);
  assert.equal(status.configured.OPENAI_API_KEY, true);
  for (const key of ["OPENAI_API_KEY", "EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET", "REDIS_URL"] as const) {
    assert.ok(!JSON.stringify(status).includes(values[key]));
  }
  assert.equal(status.values.OPENAI_MODEL, "model-example");
});

test("contexto legado é lido sem reaparecer na tela nem aceitar nova gravação", () => {
  const legado = "Informação antiga do orquestrador";
  assert.equal(settingsSchema.safeParse({ AI_SYSTEM_PROMPT: legado }).success, true);
  const status = settingsStatus({ AI_SYSTEM_PROMPT: legado }, 1);
  assert.equal(JSON.stringify(status).includes(legado), false);
  assert.equal("AI_SYSTEM_PROMPT" in status.configured, false);
  assert.equal(saveSettingsSchema.safeParse({ version: 1, values: { AI_SYSTEM_PROMPT: legado } }).success, false);
});

test("configurações rejeitam protocolo Redis inválido e segredos curtos", () => {
  assert.equal(settingsSchema.safeParse({ REDIS_URL: "//default:secret@redis:6379" }).success, false);
  assert.equal(settingsSchema.safeParse({ EVOLUTION_WEBHOOK_SECRET: "curto" }).success, false);
  assert.equal(settingsSchema.safeParse({ EVOLUTION_API_URL: "https://user:pass@example.com" }).success, false);
  assert.equal(settingsSchema.safeParse({ unexpected: "value" }).success, false);
  assert.equal(settingsSchema.safeParse({ EVOLUTION_INSTANCE_NAME: "atendeaitmf", REDIS_URL: "redis://default:pass@redis:6379/0" }).success, true);
});
