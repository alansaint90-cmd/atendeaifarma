import { test } from "node:test";
import assert from "node:assert/strict";
import { receiveEvolutionEvent, type Enqueue } from "../src/lib/evolution/webhook";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

const secret = "test-only-webhook-secret-not-for-production";
const config = { EVOLUTION_WEBHOOK_SECRET: secret, EVOLUTION_INSTANCE_NAME: "tmf", REDIS_URL: "redis://localhost:6379/0" };
const payload = { event: "MESSAGES_UPSERT", instance: "tmf", data: { key: { id: "test-id" }, message: { conversation: "Olá" } }, apikey: "must-not-be-queued" };
const request = (body: unknown = payload, key = secret) => new Request("http://localhost/api/webhooks/evolution", {
  method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": key }, body: JSON.stringify(body),
});

test("webhook aceita três chips configurados e recusa desconhecidos antes de persistir", async () => {
  const recebidos: string[] = [];
  const tresChips = { ...config, EVOLUTION_SECOND_INSTANCE_NAME: "segundo", EVOLUTION_THIRD_INSTANCE_NAME: "levaelava" };
  const fila: Enqueue = async evento => { recebidos.push(evento.instance); return "queued"; };
  for (const instancia of ["tmf", "segundo", "levaelava"]) {
    assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: instancia }), tresChips, fila)).status, 202);
  }
  assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: "desconhecida" }), tresChips, fila)).status, 403);
  assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: "segundo" }, "inválido"), tresChips, fila)).status, 401);
  assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: "levaelava" }, "inválido"), tresChips, fila)).status, 401);
  assert.deepEqual(recebidos, ["tmf", "segundo", "levaelava"]);
});

test("webhook nega segredo ausente/incorreto e configuração incompleta antes de enfileirar", async () => {
  let calls = 0;
  const enqueue: Enqueue = async () => { calls++; return "queued"; };
  assert.equal((await receiveEvolutionEvent(request(), {}, enqueue)).status, 503);
  assert.equal((await receiveEvolutionEvent(request(payload, ""), config, enqueue)).status, 401);
  assert.equal((await receiveEvolutionEvent(request(payload, "incorrect"), config, enqueue)).status, 401);
  assert.equal(calls, 0);
});
test("webhook valida instância, evento, JSON e tipo de conteúdo", async () => {
  let calls = 0;
  const enqueue: Enqueue = async () => { calls++; return "queued"; };
  assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: "outra" }), config, enqueue)).status, 403);
  assert.equal((await receiveEvolutionEvent(request({ ...payload, event: "INVALID_EVENT" }), config, enqueue)).status, 422);
  assert.equal((await receiveEvolutionEvent(request({ ...payload, data: null }), config, enqueue)).status, 422);
  const invalid = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": secret }, body: "{" });
  assert.equal((await receiveEvolutionEvent(invalid, config, enqueue)).status, 400);
  const text = new Request("http://localhost", { method: "POST", headers: { "x-webhook-secret": secret }, body: "text" });
  assert.equal((await receiveEvolutionEvent(text, config, enqueue)).status, 415);
  assert.equal(calls, 0);
});
test("webhook confirma somente depois da fila e remove a API key do envelope", async () => {
  let received: EvolutionEvent | undefined;
  const response = await receiveEvolutionEvent(request(), config, async event => { received = event; return "queued"; });
  assert.equal(response.status, 202);
  assert.equal(received?.event, "messages.upsert");
  assert.equal(received?.instance, "tmf");
  assert.equal(JSON.stringify(received).includes("must-not-be-queued"), false);
  assert.deepEqual(await response.json(), { received: true, status: "queued" });
});
test("webhook sinaliza duplicata e devolve erro recuperável se o Redis falhar", async () => {
  assert.equal((await receiveEvolutionEvent(request(), config, async () => "duplicate")).status, 200);
  const response = await receiveEvolutionEvent(request(), config, async () => { throw new Error("redis://private-password@host"); });
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("private-password"), false);
});
test("webhook limita corpo mesmo sem Content-Length", async () => {
  const response = await receiveEvolutionEvent(request({ ...payload, data: { text: "x".repeat(1024 * 1024) } }), config, async () => { throw new Error("must not enqueue"); });
  assert.equal(response.status, 413);
});

test("persistência exige autenticação e antecede fila; falha de banco não confirma evento", async () => {
  const ordem: string[] = [];
  const persistir = async () => { ordem.push("banco"); };
  const fila: Enqueue = async () => { ordem.push("fila"); return "queued"; };
  assert.equal((await receiveEvolutionEvent(request(payload, "incorreto"), config, fila, persistir)).status, 401);
  assert.equal((await receiveEvolutionEvent(request({ ...payload, instance: "outra" }), config, fila, persistir)).status, 403);
  assert.deepEqual(ordem, []);
  assert.equal((await receiveEvolutionEvent(request(), config, fila, persistir)).status, 202);
  assert.deepEqual(ordem, ["banco", "fila"]);
  ordem.length = 0;
  const resposta = await receiveEvolutionEvent(request(), config, fila, async () => { throw new Error("senha privada"); });
  assert.equal(resposta.status, 503); assert.deepEqual(ordem, []); assert.ok(!(await resposta.text()).includes("senha privada"));
});
