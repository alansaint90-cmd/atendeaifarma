import test from "node:test";
import assert from "node:assert/strict";
import type Redis from "ioredis";
import { pausasManuaisParaEvento, pausaManualAtiva, pausaManualKey } from "../src/lib/agent/pausa";
import { digest } from "../src/lib/agent/message";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

test("LID explícito e lotes preservam a pausa sem presumir telefone nem afetar outro chip", async () => {
  const dados = new Map<string, string>();
  const client = { get: async (key: string) => dados.get(key) ?? null,
    set: async (key: string, value: string) => { dados.set(key, value); return "OK"; } } as unknown as Redis;
  const timestamp = Math.floor(Date.now() / 1000), instance = "teste";
  const telefone = "5511999999999@s.whatsapp.net", lid = "123456789@lid";
  const evento = (fromMe: boolean, alt?: string): EvolutionEvent => ({ event: "messages.upsert", instance,
    data: { key: { id: "id", fromMe, remoteJid: lid, remoteJidAlt: alt }, messageTimestamp: timestamp } });
  const semPar = await pausasManuaisParaEvento(client, evento(true));
  assert.equal(semPar.length, 1);
  assert.equal(semPar[0].conversation, digest(`${instance}:${lid}`));
  dados.set(pausaManualKey(semPar[0].conversation), String(semPar[0].ate));
  assert.deepEqual(await pausasManuaisParaEvento(client, evento(false, telefone)), []);
  assert.equal(await pausaManualAtiva(client, digest(`${instance}:${telefone}`)), true);
  assert.equal(await pausaManualAtiva(client, digest(`outro:${telefone}`)), false);
  assert.equal(await pausaManualAtiva(client, digest(`${instance}:${telefone}`), timestamp * 1000 + 1799999), true);
  const manual = evento(true);
  const lote = await pausasManuaisParaEvento(client, { ...manual, data: [manual.data as Record<string, unknown>] });
  assert.equal(lote.length, 2);
  assert.ok(lote.some(p => p.conversation === digest(`${instance}:${telefone}`)));
  assert.equal(await pausaManualAtiva(client, digest(`${instance}:${telefone}`), timestamp * 1000 + 1800000), false);
  assert.deepEqual(await pausasManuaisParaEvento(client, { ...manual, data: {
    key: { id: "grupo", fromMe: true, remoteJid: "123@g.us", remoteJidAlt: telefone }, messageTimestamp: timestamp } }), []);
});
