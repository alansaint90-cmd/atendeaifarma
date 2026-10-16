import test from "node:test";
import assert from "node:assert/strict";
import { podeAcessarRotaPainel } from "../src/lib/auth/rotas-painel";

test("Configurações é exclusiva do super administrador; gerente mantém o chatbot SDR", () => {
  assert.equal(podeAcessarRotaPainel("super_admin", "settings"), true);
  assert.equal(podeAcessarRotaPainel("admin", "settings"), false);
  assert.equal(podeAcessarRotaPainel("operador", "settings"), false);
  assert.equal(podeAcessarRotaPainel("admin", "chatbot"), true);
  assert.equal(podeAcessarRotaPainel("operador", "chatbot"), false);
});
