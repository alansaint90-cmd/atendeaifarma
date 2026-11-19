import test from "node:test";
import assert from "node:assert/strict";
import { podeAcessarRotaPainel } from "../src/lib/auth/rotas-painel";
import { nav } from "../src/lib/demo/data";

test("Configurações é exclusiva do super administrador; gerente mantém o chatbot SDR", () => {
  assert.equal(podeAcessarRotaPainel("super_admin", "settings"), true);
  assert.equal(podeAcessarRotaPainel("admin", "settings"), false);
  assert.equal(podeAcessarRotaPainel("operador", "settings"), false);
  assert.equal(podeAcessarRotaPainel("admin", "chatbot"), true);
  assert.equal(podeAcessarRotaPainel("operador", "chatbot"), false);
  const campanha = nav.find(([id]) => id === "campaigns");
  assert.ok(campanha, "Campanhas deve estar registrada para permitir navegação e acesso direto");
  assert.equal(podeAcessarRotaPainel("admin", campanha[0]), true);
  assert.equal(podeAcessarRotaPainel("super_admin", campanha[0]), true);
  assert.equal(podeAcessarRotaPainel("operador", campanha[0]), false);
  assert.equal(podeAcessarRotaPainel("visualizador", campanha[0]), false);
});
