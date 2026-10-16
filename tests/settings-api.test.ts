import test from "node:test";
import assert from "node:assert/strict";
import { GET, PUT } from "../src/app/api/settings/integrations/route";
import { GET as agentStatus } from "../src/app/api/settings/agent/route";

test("API protege leitura e gravação antes de acessar banco", async () => {
  const old = process.env.SETTINGS_ADMIN_TOKEN;
  process.env.SETTINGS_ADMIN_TOKEN = "test-admin-".repeat(4);
  try {
    assert.equal((await GET()).status, 401);
    assert.equal((await agentStatus()).status, 401);
    assert.equal((await PUT(new Request("http://localhost/api/settings/integrations", { method: "PUT" }))).status, 401);
    const headers = { authorization: `Bearer ${process.env.SETTINGS_ADMIN_TOKEN}`, "content-type": "application/json" };
    assert.equal((await PUT(new Request("http://localhost/api/settings/integrations", { method: "PUT", headers: { ...headers, origin: "https://evil.example" }, body: "{}" }))).status, 401);
    const invalid = await PUT(new Request("http://localhost/api/settings/integrations", { method: "PUT", headers, body: JSON.stringify({ version: 0, values: { REDIS_URL: "super-secret-invalid" } }) }));
    assert.equal(invalid.status, 401);
    assert.ok(!(await invalid.text()).includes("super-secret-invalid"));
    assert.equal((await PUT(new Request("http://localhost/api/settings/integrations", { method: "PUT", headers, body: "x".repeat(1048577) }))).status, 401);
  } finally {
    if (old === undefined) delete process.env.SETTINGS_ADMIN_TOKEN;
    else process.env.SETTINGS_ADMIN_TOKEN = old;
  }
});
