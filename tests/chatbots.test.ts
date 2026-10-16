import { test } from "node:test";
import assert from "node:assert/strict";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { loadChatbots, saveChatbots, storageKey } from "../src/lib/chatbots/repository";

function memoryStorage(value: string | null = null) {
  const data = new Map<string, string>();
  if (value !== null) data.set(storageKey, value);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test("modelo inicial não injeta produtos ou mentorias no prompt", () => {
  assert.equal(chatbotExample.context, "");
  assert.equal(loadChatbots(memoryStorage()).bots[0].context, "");
});
test("preserva prompt editado ao salvar e recarregar dados anteriores", () => {
  const bot = { ...structuredClone(chatbotExample), context: "Meu texto\n<exemplo> & emojis ⚽", contextRevision: "antiga" };
  const storage = memoryStorage(JSON.stringify([bot]));
  const before = loadChatbots(storage);
  assert.equal(before.bots[0].context, bot.context);
  saveChatbots(storage, [{ ...bot, delay: 8 }], before.revision);
  assert.equal(loadChatbots(storage).bots[0].context, bot.context);
});
test("rejeita dados corrompidos sem sobrescrever a versão original", () => {
  for (const raw of ["{", "null", '[{"id":"x"}]']) {
    const storage = memoryStorage(raw);
    assert.throws(() => loadChatbots(storage), /inválidos/);
    assert.equal(storage.getItem(storageKey), raw);
  }
});
test("impede sobrescrita silenciosa entre duas abas", () => {
  const storage = memoryStorage();
  const first = loadChatbots(storage), second = loadChatbots(storage);
  saveChatbots(storage, [{ ...first.bots[0], context: "Primeira aba" }], first.revision);
  assert.throws(() => saveChatbots(storage, second.bots, second.revision), /outra aba/);
  assert.equal(loadChatbots(storage).bots[0].context, "Primeira aba");
});
test("valida duplicidade, faixa numérica, personalidade e fluxo", () => {
  const storage = memoryStorage();
  for (const patch of [{ delay: -1 }, { temperature: 2 }, { personalities: ["inexistente"] }, { flows: [{ name: "", description: "" }] }]) {
    assert.throws(() => saveChatbots(storage, [{ ...chatbotExample, ...patch } as typeof chatbotExample], null));
    assert.equal(storage.getItem(storageKey), null);
  }
  assert.throws(() => saveChatbots(storage, [chatbotExample, { ...chatbotExample, id: "outro" }], null));
});
test("reporta falha de gravação sem alegar sucesso", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.throws(() => saveChatbots(storage, [chatbotExample], null), /Não foi possível salvar/);
});
