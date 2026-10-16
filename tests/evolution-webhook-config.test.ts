import { test } from "node:test";
import assert from "node:assert/strict";
import { sincronizarWebhookEvolution, sincronizarWebhooksConfigurados, ErroWebhookEvolution } from "../src/lib/evolution/configurar-webhook";
import { POST } from "../src/app/api/settings/evolution-webhook/route";

const values = {
  EVOLUTION_API_URL: "https://evolution.example.test",
  EVOLUTION_API_KEY: "chave-evolution-de-teste",
  EVOLUTION_INSTANCE_NAME: "thais tmf",
  EVOLUTION_WEBHOOK_SECRET: "segredo-webhook-de-teste-com-32-caracteres",
};
const origin = "https://atendeia.example.test";

test("sincronização confirma os três chips e informa falha parcial", async () => {
  const salvos: string[] = [];
  const request: typeof fetch = async (url, init) => {
    if (init?.method === "POST") { salvos.push(String(url)); return Response.json({ ok: true }); }
    return Response.json({ url: `${origin}/api/webhooks/evolution`, enabled: true,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      headers: { "x-webhook-secret": values.EVOLUTION_WEBHOOK_SECRET } });
  };
  const configuracao = { ...values, EVOLUTION_SECOND_INSTANCE_NAME: "segundo", EVOLUTION_THIRD_INSTANCE_NAME: "levaelava" };
  await sincronizarWebhooksConfigurados(configuracao, origin, request);
  assert.equal(salvos.length, 3);
  assert.ok(salvos[2].endsWith("/levaelava"));
  assert.ok(salvos[0].endsWith("/thais%20tmf")); assert.ok(salvos[1].endsWith("/segundo"));
  await assert.rejects(sincronizarWebhooksConfigurados(configuracao, origin, async (url, init) => {
    if (String(url).endsWith("/segundo")) return new Response(null, { status: 401 });
    return request(url, init);
  }), /Instância segundo:.*não foi concluída/);
  await assert.rejects(sincronizarWebhooksConfigurados(configuracao, origin, async (url, init) => {
    if (String(url).endsWith("/levaelava")) return new Response(null, { status: 401 });
    return request(url, init);
  }), /Instância levaelava:.*não foi concluída/);
});

test("sincronização envia cabeçalho secreto, preserva eventos e confirma leitura posterior", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const request: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (calls.length === 2) return Response.json({ ok: true });
    return Response.json(calls.length === 1
      ? { url: "https://antigo.example.test", events: ["CONTACTS_UPDATE"], headers: { "X-Existing": "valor" } }
      : { url: `${origin}/api/webhooks/evolution`, enabled: true, webhookByEvents: false, webhookBase64: false,
        events: ["CONTACTS_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
        headers: { "X-Existing": "valor", "x-webhook-secret": values.EVOLUTION_WEBHOOK_SECRET } });
  };
  await sincronizarWebhookEvolution({ ...values, REDIS_URL: "redis://localhost:6379", AI_ENABLED: "false" }, origin, request);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /\/webhook\/set\/thais%20tmf$/);
  assert.equal(new Headers(calls[1].init.headers).get("apikey"), values.EVOLUTION_API_KEY);
  const body = JSON.parse(String(calls[1].init.body));
  assert.equal(body.webhook.headers["x-webhook-secret"], values.EVOLUTION_WEBHOOK_SECRET);
  assert.equal(body.webhook.headers["X-Existing"], "valor");
  assert.equal(body.webhook.url, `${origin}/api/webhooks/evolution`);
  assert.equal(body.webhook.byEvents, false);
  assert.equal(body.webhook.base64, false);
  assert.deepEqual(body.webhook.events, ["CONTACTS_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]);
});

test("sincronização recusa configuração incompleta e não confirma cabeçalho ausente", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    if (calls === 2) return Response.json({ ok: true });
    return Response.json({ url: `${origin}/api/webhooks/evolution`, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"], headers: null });
  };
  await assert.rejects(sincronizarWebhookEvolution({ ...values, EVOLUTION_WEBHOOK_SECRET: "" }, origin, request), erro => {
    assert.ok(erro instanceof ErroWebhookEvolution);
    assert.match(erro.message, /segredo do webhook/);
    assert.doesNotMatch(erro.message, /segredo-webhook-de-teste/);
    return true;
  });
  await assert.rejects(sincronizarWebhookEvolution({ EVOLUTION_INSTANCE_NAME: "thaistmf01" }, origin, request), erro => {
    assert.ok(erro instanceof ErroWebhookEvolution);
    assert.match(erro.message, /URL base da Evolution/);
    assert.match(erro.message, /chave de API da Evolution/);
    assert.match(erro.message, /segredo do webhook/);
    assert.doesNotMatch(erro.message, /nome exato da instância/);
    return true;
  });
  assert.equal(calls, 0);
  await assert.rejects(sincronizarWebhookEvolution(values, origin, request), /não confirmou/);
  assert.equal(calls, 3);
});

test("rota de sincronização exige sessão antes de acessar a Evolution", async () => {
  const response = await POST(new Request(`${origin}/api/settings/evolution-webhook`, { method: "POST" }));
  assert.equal(response.status, 401);
});
