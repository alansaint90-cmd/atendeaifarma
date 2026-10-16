import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultFollowup, followupSchema } from "../src/lib/followups/schema";
import { inWindow, nextDue } from "../src/lib/followups/schedule";
import { configuracaoPermiteFollowup, processFollowup, type FollowupJob, type FollowupPort } from "../src/lib/followups/processor";
import { activity } from "../src/lib/followups/queue";
import { exigirAdmin } from "../src/lib/settings/access";

function fixture() {
  const config = structuredClone(defaultFollowup);
  config.enabled = true; config.instance = "teste"; config.revision = randomUUID();
  config.steps[0].enabled = true;
  const now = Date.parse("2026-09-16T15:00:00Z");
  const job: FollowupJob = { conversation: "conversa", identity: "mensagem", number: "5511999999999", started: now - 3600000,
    index: 0, due: now, revision: config.revision, status: "aguardando" };
  const writes: FollowupJob[] = []; const results: string[] = []; const sends: string[] = [];
  const port: FollowupPort = { save: async value => { writes.push(value); }, finish: async result => { results.push(result); },
    enabled: async () => true, send: async (_number, text) => { sends.push(text); return "id"; }, delivered: async () => {} };
  return { config, now, job, port, writes, results, sends };
}
test("follow-up exige janela válida, mensagem, chip e no máximo três etapas", () => {
  const { config } = fixture();
  assert.ok(followupSchema.safeParse(config).success);
  for (const invalid of [{ ...config, endHour: 8 }, { ...config, days: [] }, { ...config, instance: "" },
    { ...config, steps: [...config.steps, config.steps[0]] },
    { ...config, steps: [{ ...config.steps[0], text: " " }, ...config.steps.slice(1)] }]) {
    assert.equal(followupSchema.safeParse(invalid).success, false);
  }
});
test("agenda respeita fuso, fim exclusivo e dias úteis", () => {
  const { config } = fixture(); config.days = [1, 2, 3, 4, 5];
  assert.equal(inWindow(config, Date.parse("2026-09-18T23:00:00Z")), false);
  assert.equal(nextDue(config, Date.parse("2026-09-18T22:00:00Z"), 0), Date.parse("2026-09-21T11:00:00Z"));
  config.timezone = "America/Manaus";
  assert.equal(inWindow(config, Date.parse("2026-09-21T11:00:00Z")), false);
});
test("envia uma etapa e encerra após a última mensagem habilitada", async () => {
  const f = fixture(); await processFollowup(f.job, f.config, f.port, f.now);
  assert.equal(f.sends.length, 1); assert.equal(f.writes[0].status, "enviando"); assert.deepEqual(f.results, ["concluido"]);
});
test("configuração alterada ou desligada cancela sem enviar", async () => {
  for (const changed of ["revision", "enabled"]) {
    const f = fixture(); if (changed === "revision") f.config.revision = randomUUID(); else f.config.enabled = false;
    await processFollowup(f.job, f.config, f.port, f.now);
    assert.equal(f.sends.length, 0); assert.deepEqual(f.results, ["cancelado"]);
  }
});
test("revalidação antes do envio recusa revisão desatualizada ou desligada", async () => {
  const f = fixture();
  let atual = structuredClone(f.config);
  f.port.enabled = async () => configuracaoPermiteFollowup(f.job, atual);
  atual = { ...atual, revision: randomUUID() };
  await processFollowup(f.job, f.config, f.port, f.now);
  assert.equal(f.sends.length, 0);
  atual = { ...f.config, enabled: false };
  await processFollowup(f.job, f.config, f.port, f.now);
  assert.equal(f.sends.length, 0);
  atual = f.config;
  await processFollowup(f.job, f.config, f.port, f.now);
  assert.equal(f.sends.length, 1);
});
test("não repete envio incerto, não antecipa e respeita pausa antes do envio", async () => {
  for (const scenario of ["incerto", "futuro", "pausado"]) {
    const f = fixture();
    if (scenario === "incerto") f.job.status = "enviando";
    if (scenario === "futuro") f.job.due += 1000;
    if (scenario === "pausado") f.port.enabled = async () => false;
    await processFollowup(f.job, f.config, f.port, f.now); assert.equal(f.sends.length, 0);
  }
  const f = fixture(); f.port.send = async () => { throw new Error("timeout"); };
  await processFollowup(f.job, f.config, f.port, f.now); assert.deepEqual(f.results, ["incerto"]);
});
test("fora de horário reagenda sem enviar e sem reaplicar o intervalo", async () => {
  const f = fixture(); const night = Date.parse("2026-09-16T23:00:00Z");
  await processFollowup(f.job, f.config, f.port, night);
  assert.equal(f.sends.length, 0); assert.equal(f.writes[0].due, Date.parse("2026-09-17T11:00:00Z"));
});
test("atividade de mídia e atendimento humano pode cancelar; grupos não", () => {
  const event = { event: "messages.upsert" as const, instance: "teste", data: { key: { id: "id", fromMe: true,
    remoteJid: "123@lid", remoteJidAlt: "5511999999999@s.whatsapp.net" }, messageTimestamp: Date.now() / 1000 } };
  assert.ok(activity(event, "teste")); assert.equal(activity(event, "outra"), null);
  event.data.key.remoteJid = "grupo@g.us"; assert.equal(activity(event, "teste"), null);
});
test("acesso administrativo exige sessão individual", async () => {
  await assert.rejects(exigirAdmin(), /Sessao expirada/);
});
