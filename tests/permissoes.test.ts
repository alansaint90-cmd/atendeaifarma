import test from "node:test";
import assert from "node:assert/strict";
import { temPermissao, type SessaoAtiva } from "../src/lib/auth/permissoes";

test("papéis desconhecidos nunca recebem privilégio pela posição negativa na hierarquia", () => {
  assert.equal(temPermissao({ userId: "teste", papel: "inexistente" } as unknown as SessaoAtiva, "super_admin"), false);
  assert.equal(temPermissao(null, "visualizador"), false);
  assert.equal(temPermissao({ userId: "teste", papel: "operador" }, "admin"), false);
  assert.equal(temPermissao({ userId: "teste", papel: "admin" }, "operador"), true);
});
