import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/auth/passkey/route";

test("cerimônia recusa configuração desligada, origem estrangeira e payloads inválidos sem expor detalhes", async () => {
  const anteriores = { enabled: process.env.AUTH_LOGIN_ENABLED, origem: process.env.AUTH_ORIGIN, banco: process.env.DATABASE_URL };
  delete process.env.DATABASE_URL;
  process.env.AUTH_ORIGIN = "https://atendeia.example";
  const chamar = async (origem: string, body: string) => {
    const inicio = Date.now(); const r = await POST(new Request("https://atendeia.example/api/auth/passkey", { method: "POST", headers: { origin: origem, "content-type": "application/json" }, body }));
    assert.equal(r.status, 401); assert.equal(r.headers.get("cache-control"), "no-store"); assert.ok(Date.now()-inicio>=480);
    return r.text();
  };
  try {
    process.env.AUTH_LOGIN_ENABLED = "false";
    const base = await chamar("https://atendeia.example", '{"acao":"iniciar_login"}');
    process.env.AUTH_LOGIN_ENABLED = "true";
    assert.equal(await chamar("https://estrangeiro.example", '{"acao":"iniciar_login"}'), base);
    assert.equal(await chamar("https://atendeia.example", '{"acao":"iniciar_registro","convite":"invalido"}'), base);
    assert.equal(await chamar("https://atendeia.example", "x".repeat(65537)), base);
  } finally {
    for (const [chave,valor] of Object.entries({ AUTH_LOGIN_ENABLED: anteriores.enabled, AUTH_ORIGIN: anteriores.origem, DATABASE_URL: anteriores.banco })) {
      if (valor === undefined) delete process.env[chave]; else process.env[chave]=valor;
    }
  }
});
