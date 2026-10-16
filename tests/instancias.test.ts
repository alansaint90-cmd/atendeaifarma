import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { campoFollowup, followupDaInstancia, instanciasConfiguradas, settingsDaInstancia } from "../src/lib/evolution/instancias";
import { defaultFollowup } from "../src/lib/followups/schema";
import { incomingMessage } from "../src/lib/agent/message";
import { pausaManualParaEvento } from "../src/lib/agent/pausa";
import type { EvolutionEvent } from "../src/lib/evolution/schema";
import { configuracaoPermiteFollowup, type FollowupJob } from "../src/lib/followups/processor";

test("três chips mantêm configurações e revisões independentes; chip renomeado começa desligado", () => {
  const primeiro = { ...structuredClone(defaultFollowup), instance: "principal", revision: randomUUID(), enabled: true };
  primeiro.steps[0].enabled = true;
  const segundo = { ...structuredClone(primeiro), instance: "segundo", revision: randomUUID() };
  segundo.steps[0].text = "Texto exclusivo do segundo número";
  const terceiro = { ...structuredClone(primeiro), instance: "levaelava", revision: randomUUID() };
  terceiro.steps[0].text = "Texto exclusivo do terceiro número";
  const settings = { EVOLUTION_INSTANCE_NAME: "principal", EVOLUTION_SECOND_INSTANCE_NAME: "segundo",
    EVOLUTION_THIRD_INSTANCE_NAME: "levaelava", FOLLOW_UP_THIRD_CONFIG: JSON.stringify(terceiro),
    FOLLOW_UP_CONFIG: JSON.stringify(primeiro), FOLLOW_UP_SECOND_CONFIG: JSON.stringify(segundo) };
  assert.deepEqual(instanciasConfiguradas(settings), ["principal", "segundo", "levaelava"]);
  assert.deepEqual(followupDaInstancia(settings, "levaelava"), terceiro);
  assert.equal(campoFollowup(settings, "levaelava"), "FOLLOW_UP_THIRD_CONFIG");
  assert.deepEqual(settingsDaInstancia(settings, "levaelava"), { EVOLUTION_INSTANCE_NAME: "levaelava" });
  assert.deepEqual(settingsDaInstancia({ ...settings, FOLLOW_UP_THIRD_CONFIG: "alterado" }, "principal"),
    settingsDaInstancia(settings, "principal"));
  assert.equal(followupDaInstancia({ ...settings, EVOLUTION_THIRD_INSTANCE_NAME: "novo" }, "novo").enabled, false);
  assert.deepEqual(followupDaInstancia(settings, "principal"), primeiro);
  assert.deepEqual(followupDaInstancia(settings, "segundo"), segundo);
  assert.equal(campoFollowup(settings, "estranho"), null);
  assert.equal(settingsDaInstancia(settings, "estranho"), null);
  assert.equal(settingsDaInstancia(settings, "segundo")?.EVOLUTION_INSTANCE_NAME, "segundo");
  assert.equal(followupDaInstancia({ ...settings, EVOLUTION_SECOND_INSTANCE_NAME: "novo" }, "novo").enabled, false);
  const job: FollowupJob = { instance: "principal", conversation: "c", identity: "i", number: "5511999999999",
    started: 0, due: 0, index: 0, revision: primeiro.revision, status: "aguardando" };
  assert.equal(configuracaoPermiteFollowup(job, primeiro), true);
  assert.equal(configuracaoPermiteFollowup(job, { ...segundo, revision: primeiro.revision }), false);
  assert.equal(configuracaoPermiteFollowup(job, followupDaInstancia({ ...settings,
    FOLLOW_UP_SECOND_CONFIG: JSON.stringify({ ...segundo, revision: randomUUID() }) }, "principal")), true);
});

test("mesmo cliente e ID de mensagem não compartilham histórico, deduplicação ou pausa entre chips", () => {
  const evento = (instance: string): EvolutionEvent => ({ event: "messages.upsert", instance,
    data: { key: { id: "mesmo-id", fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" },
      messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Olá" } } });
  const a = incomingMessage(evento("principal"), "principal")!;
  const b = incomingMessage(evento("segundo"), "segundo")!;
  assert.notEqual(a.identity, b.identity);
  assert.notEqual(a.conversation, b.conversation);
  const manual = evento("principal");
  manual.data = { ...manual.data, key: { id: "manual", fromMe: true, remoteJid: "5511999999999@s.whatsapp.net" } };
  assert.equal(pausaManualParaEvento(manual)?.conversation, a.conversation);
  assert.notEqual(pausaManualParaEvento(manual)?.conversation, b.conversation);
});
