import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { agentRedis, agentKeys } from "../src/lib/agent/redis";
import { messageStore } from "../src/lib/agent/store";
import { runAgentTick } from "../src/lib/agent/worker";
import { incomingMessage, digest } from "../src/lib/agent/message";
import { enqueueEvolutionEventWithClient, streamKey } from "../src/lib/evolution/queue";
import type { AgentConfig } from "../src/lib/agent/config";
import type { EvolutionEvent } from "../src/lib/evolution/schema";
import { defaultFollowup } from "../src/lib/followups/schema";
import { followupStore, followupQueue } from "../src/lib/followups/queue";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { pausaManualAtiva, pausaManualKey, pausaManualParaEvento } from "../src/lib/agent/pausa";
import type { Turn } from "../src/lib/agent/providers";

test("ecos dos dois balões da abertura não pausam a IA", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!; const alvo = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(alvo.hostname) && alvo.pathname === "/15");
  const client = agentRedis(url); await client.connect();
  const instancia = `abertura-${randomUUID()}`; const ids: string[] = [];
  const evento = (id: string, fromMe = false): EvolutionEvent => ({ instance: instancia, event: "messages.upsert", data: {
    key: { id, fromMe, remoteJid: "5511666555555@s.whatsapp.net" }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Oi" } } });
  const mensagem = incomingMessage(evento(randomUUID()), instancia)!;
  try {
    await enqueueEvolutionEventWithClient(client, evento(randomUUID()));
    await runAgentTick({ settings: async () => ({ AI_ENABLED: "true", OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "modelo",
      EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste", EVOLUTION_INSTANCE_NAME: instancia, REDIS_URL: url }),
    chatbot: async () => ({ ...chatbotExample, context: "Prompt", openingMessages: ["Bem-vindo.", "Qual seu nome?"] }),
    registrarEnvio: async () => {}, generate: async () => { throw new Error("Não gerar abertura"); },
    send: async () => { const id = randomUUID(); ids.push(id); return id; } });
    assert.equal(ids.length, 2);
    for (const id of ids) await enqueueEvolutionEventWithClient(client, evento(id, true));
    assert.equal(await pausaManualAtiva(client, mensagem.conversation), false);
  } finally {
    await client.del(streamKey, agentKeys.lock, agentKeys.heartbeat, agentKeys.archive,
      `atendeia:{evolution}:history:${mensagem.conversation}`, pausaManualKey(mensagem.conversation));
    client.disconnect();
  }
});

test("transferência pausa 30 minutos, cancela follow-up e não pausa o outro número", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!; const alvo = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(alvo.hostname) && alvo.pathname === "/15");
  const client = agentRedis(url); await client.connect();
  const sufixo = randomUUID(); const instancia = `transferencia-${sufixo}`;
  const evento = (instance: string, id: string): EvolutionEvent => ({ instance, event: "messages.upsert", data: {
    key: { id, fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Quero uma pessoa" } } });
  const mensagem = incomingMessage(evento(instancia, "1"), instancia)!;
  const outra = incomingMessage(evento(`${instancia}-b`, "1"), `${instancia}-b`)!;
  const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "legado", OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "gpt-4.1-mini",
    EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste", EVOLUTION_INSTANCE_NAME: instancia,
    EVOLUTION_SECOND_INSTANCE_NAME: `${instancia}-b`, REDIS_URL: url };
  const saidas: string[] = []; let transferencias = 0;
  const dependencias = { settings: async () => config, chatbot: async () => ({ ...chatbotExample, context: "Atenda o cliente.", transferNotice: "Nossa equipe continuará o atendimento." }),
    generate: async () => ({ transferir: true as const }), transferir: async () => {
      transferencias++;
      await client.set(`atendeia:{evolution}:followup:${mensagem.conversation}`, "ciclo simulado");
      await client.zadd(followupQueue, Date.now(), mensagem.conversation);
    }, registrarEnvio: async () => {},
    send: async (_config: unknown, _numero: string, texto: string) => { saidas.push(texto); return `envio-${sufixo}`; } };
  try {
    await enqueueEvolutionEventWithClient(client, evento(instancia, "1"));
    await runAgentTick(dependencias);
    const prazo = Number(await client.get(pausaManualKey(mensagem.conversation)));
    assert.ok(prazo > Date.now() + 29 * 60000 && prazo <= Date.now() + 30 * 60000);
    assert.equal(await pausaManualAtiva(client, mensagem.conversation, prazo - 1), true);
    assert.equal(await pausaManualAtiva(client, mensagem.conversation, prazo), false);
    assert.equal(await pausaManualAtiva(client, outra.conversation), false);
    assert.equal(await client.get(`atendeia:{evolution}:followup:${mensagem.conversation}`), null);
    assert.equal(await client.zscore(followupQueue, mensagem.conversation), null);
    await enqueueEvolutionEventWithClient(client, evento(instancia, "2"));
    await runAgentTick(dependencias);
    assert.equal(transferencias, 1); assert.deepEqual(saidas, ["Nossa equipe continuará o atendimento."]);
  } finally {
    await client.del(streamKey, agentKeys.lock, agentKeys.heartbeat, agentKeys.archive, pausaManualKey(mensagem.conversation));
    client.disconnect();
  }
});

test("Redis real: recuperação de pendentes, Lua atômico e exclusão de envio duplicado", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!;
  const target = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/15", "Use apenas Redis descartável local, banco 15.");
  const client = agentRedis(url);
  await client.connect();
  const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "Teste", OPENAI_API_KEY: "sk-test-only",
    OPENAI_MODEL: "modelo-teste", EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste",
    EVOLUTION_INSTANCE_NAME: "teste", REDIS_URL: url };
  const event: EvolutionEvent = { event: "messages.upsert", instance: "teste", data: { key: {
    id: randomUUID(), fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" },
  messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Oi" } } };
  const message = incomingMessage(event, "teste")!;
  let sends = 0;
  let generations = 0;
  const textosEnviados: string[] = [];
  const registros: string[] = [];
  const dependencies = { settings: async () => config,
    chatbot: async () => ({ ...chatbotExample, context: "Atenda o cliente conforme este roteiro de teste." }),
    registrarEnvio: async (instancia: string, id: string) => { registros.push(`${instancia}:${id}`); },
    generate: async () => { generations++; return "Olá"; },
    send: async (_config: Pick<AgentConfig, "EVOLUTION_API_URL" | "EVOLUTION_API_KEY" | "EVOLUTION_INSTANCE_NAME">, _numero: string, texto: string) => {
      sends++; textosEnviados.push(texto); return `enviado-${sends}`;
    } };
  try {
    assert.equal(await client.xlen(streamKey), 0, "Fila de testes deve estar vazia.");
    await client.xgroup("CREATE", streamKey, agentKeys.group, "0", "MKSTREAM").catch(error => {
      if (!String(error).includes("BUSYGROUP")) throw error;
    });
    await client.xadd(streamKey, "*", "payload", JSON.stringify(event));
    // Simular interrupção após reservar evento, antes do processamento.
    await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, ">");
    await runAgentTick(dependencies);
    assert.equal(sends, 1);
    assert.deepEqual(registros, ["teste:enviado-1"]);
    assert.equal(await client.xlen(streamKey), 0);
    assert.equal((await messageStore(client, "sem-posse", message).read())?.status, "enviada");
    assert.equal((await messageStore(client, "sem-posse", message).history()).length, 2);
    await client.xadd(streamKey, "*", "payload", JSON.stringify({ ...event, date_time: "outro-envelope" }));
    await runAgentTick(dependencies);
    assert.equal(sends, 1);
    assert.equal(await client.xlen(streamKey), 0);
    assert.ok(await client.xlen(agentKeys.archive) >= 2);
    const lease = randomUUID();
    await client.set(agentKeys.lock, lease, "PX", 120000);
    await messageStore(client, lease, message).rememberName("Alan");
    assert.equal(await messageStore(client, "sem-posse", message).contactName(), "Alan");
    const followups = followupStore(client, lease);
    const schedule = structuredClone(defaultFollowup);
    schedule.enabled = true; schedule.instance = "teste"; schedule.revision = randomUUID(); schedule.steps[0].enabled = true;
    await followups.schedule(message, schedule);
    const jobKey = `atendeia:{evolution}:followup:${message.conversation}`;
    const original = await client.get(jobKey);
    assert.ok(original);
    await followups.schedule(message, schedule);
    assert.equal(await client.get(jobKey), original, "Duplicata não reinicia o prazo.");
    await followups.outgoing("teste", "eco-teste");
    await followups.observe({ ...event, data: { ...event.data, key: { id: "eco-teste", fromMe: true, remoteJid: "5511999999999@s.whatsapp.net" } } }, "teste");
    assert.equal(await client.get(jobKey), original, "Eco do agente preserva a sequência.");
    const job = JSON.parse(original);
    await followups.save({ ...job, due: Date.now() - 1 });
    assert.equal((await followups.due())?.identity, message.identity);
    await followups.observe({ ...event, data: { ...event.data, message: { imageMessage: {} },
      key: { id: "nova-atividade", fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" } } }, "teste");
    assert.equal(await client.get(jobKey), null, "Nova atividade cancela inclusive mídia.");
    assert.equal(await client.zscore(followupQueue, message.conversation), null);
    // Simular o painel salvo: o worker deve enviar literalmente as três etapas.
    const painel = structuredClone(schedule);
    painel.startHour = 0; painel.endHour = 24;
    painel.steps.forEach((etapa, indice) => {
      etapa.enabled = true; etapa.delay = 1; etapa.unit = "minutes";
      etapa.text = `Mensagem ${indice + 1} do painel 😊\nTexto exclusivo, sem reescrita pela IA.`;
    });
    Object.assign(config, { FOLLOW_UP_CONFIG: JSON.stringify(painel) });
    await followups.schedule({ ...message, identity: randomUUID() }, painel);
    for (let indice = 0; indice < 3; indice++) {
      const pendente = JSON.parse((await client.get(jobKey))!);
      assert.equal(pendente.index, indice);
      await followups.save({ ...pendente, due: Date.now() - 1 });
      await client.del(agentKeys.lock);
      await runAgentTick(dependencies);
      assert.equal(textosEnviados.at(-1), painel.steps[indice].text);
      assert.equal(generations, 1, "Follow-up não chama a geração de IA.");
      await client.set(agentKeys.lock, lease, "PX", 120000);
    }
    assert.equal(await client.get(jobKey), null, "Última etapa encerra a sequência.");
    assert.equal(await client.zscore(followupQueue, message.conversation), null);
    assert.equal(sends, 4);
    await client.set(agentKeys.lock, "outro-processo", "PX", 120000);
    await assert.rejects(messageStore(client, "posse-antiga", message).write({ status: "enviando", attempts: 1 }));
    await runAgentTick(dependencies);
    assert.equal(sends, 4);
  } finally {
    await client.del(streamKey, agentKeys.lock, agentKeys.heartbeat, agentKeys.archive,
      `atendeia:{evolution}:reply:${message.identity}`, `atendeia:{evolution}:history:${message.conversation}`,
      `atendeia:{evolution}:name:${message.conversation}`);
    client.disconnect();
  }
});

test("mensagem humana pausa a IA por 30 minutos da última saída; eco da IA não pausa", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!;
  const target = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/15");
  const client = agentRedis(url);
  await client.connect();
  const telefone = "5511888777666@s.whatsapp.net";
  const base = Math.floor(Date.now() / 1000);
  const evento = (id: string, fromMe: boolean, timestamp = base): EvolutionEvent => ({
    event: "messages.upsert", instance: "teste", data: { key: { id, fromMe, remoteJid: telefone },
      messageTimestamp: timestamp, message: { conversation: "Teste de pausa" } },
  });
  const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "Teste", OPENAI_API_KEY: "sk-test-only",
    OPENAI_MODEL: "modelo-teste", EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste",
    EVOLUTION_INSTANCE_NAME: "teste", REDIS_URL: url };
  const chatbot = async () => ({ ...chatbotExample, context: "Atenda o cliente." });
  let gera = 0;
  let envia = 0;
  const dependencies = { settings: async () => config, chatbot,
    registrarEnvio: async () => {}, generate: async () => { gera++; return "Resposta da IA"; },
    send: async () => { envia++; return `envio-${envia}`; } };
  const primeira = evento(randomUUID(), true);
  const pausa = pausaManualParaEvento(primeira);
  assert.ok(pausa);
  try {
    assert.equal(await enqueueEvolutionEventWithClient(client, primeira), "queued");
    assert.equal(await client.get(pausaManualKey(pausa.conversation)), String(pausa.ate));
    assert.equal(await enqueueEvolutionEventWithClient(client, primeira), "duplicate");
    await enqueueEvolutionEventWithClient(client, evento(randomUUID(), true, base + 1));
    assert.equal(await client.get(pausaManualKey(pausa.conversation)), String(pausa.ate + 1000));
    await enqueueEvolutionEventWithClient(client, evento(randomUUID(), true, base - 60));
    assert.equal(await client.get(pausaManualKey(pausa.conversation)), String(pausa.ate + 1000));
    await enqueueEvolutionEventWithClient(client, evento(randomUUID(), false));
    for (let i = 0; i < 4; i++) await runAgentTick(dependencies);
    assert.equal(gera, 0); assert.equal(envia, 0);
    assert.equal(await client.xlen(streamKey), 0);
    assert.equal(await pausaManualAtiva(client, pausa.conversation, pausa.ate + 1000), false);
    await client.del(pausaManualKey(pausa.conversation));
    await enqueueEvolutionEventWithClient(client, evento(randomUUID(), false));
    await runAgentTick(dependencies);
    assert.equal(gera, 1); assert.equal(envia, 1);
    const eco = evento("envio-1", true);
    assert.equal(await enqueueEvolutionEventWithClient(client, eco), "queued");
    assert.equal(await client.get(pausaManualKey(pausa.conversation)), null, "Eco do agente não pausa.");
  } finally {
    await client.del(streamKey, agentKeys.lock, agentKeys.heartbeat, agentKeys.archive, pausaManualKey(pausa.conversation));
    client.disconnect();
  }
});

test("três números: prompts próprios, histórico, pausa e follow-ups isolados", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!;
  const target = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/15");
  const client = agentRedis(url); await client.connect();
  const sufixo = randomUUID();
  const principal = `principal-${sufixo}`, segundo = `segundo-${sufixo}`, terceiro = `levaelava-${sufixo}`;
  const evento = (instance: string, id: string, fromMe = false): EvolutionEvent => ({ event: "messages.upsert", instance,
    data: { key: { id, fromMe, remoteJid: "5511777666555@s.whatsapp.net" }, messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: `Mensagem recebida em ${instance}` } } });
  const painel = (instance: string) => {
    const config = structuredClone(defaultFollowup);
    config.enabled = true; config.instance = instance; config.revision = randomUUID(); config.startHour = 0; config.endHour = 24;
    config.steps[0] = { enabled: true, text: `Follow-up do chip ${instance}`, delay: 1, unit: "minutes" };
    return config;
  };
  const a = painel(principal), b = painel(segundo), c = painel(terceiro);
  const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "legado ignorado", OPENAI_API_KEY: "sk-test-only",
    OPENAI_MODEL: "modelo-teste", EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste",
    EVOLUTION_INSTANCE_NAME: principal, EVOLUTION_SECOND_INSTANCE_NAME: segundo, EVOLUTION_THIRD_INSTANCE_NAME: terceiro, REDIS_URL: url,
    FOLLOW_UP_CONFIG: JSON.stringify(a), FOLLOW_UP_SECOND_CONFIG: JSON.stringify(b), FOLLOW_UP_THIRD_CONFIG: JSON.stringify(c) };
  const saidas: { instancia: string; texto: string }[] = [];
  const geracoes: { instancia: string; prompt: string; historico: Turn[] }[] = [];
  const consultas: string[] = [];
  let prompt = "Mesmo roteiro aprovado para os três chips.";
  const dependencies = { settings: async () => config,
    chatbot: async (instancia: string) => { consultas.push(instancia); return { ...chatbotExample, context: `${prompt} Variante ${instancia}` }; },
    registrarEnvio: async () => {},
    generate: async (atual: AgentConfig, historico: Turn[]) => {
      geracoes.push({ instancia: atual.EVOLUTION_INSTANCE_NAME, prompt: atual.AI_SYSTEM_PROMPT, historico });
      return "Resposta de teste";
    },
    send: async (atual: Pick<AgentConfig, "EVOLUTION_API_URL" | "EVOLUTION_API_KEY" | "EVOLUTION_INSTANCE_NAME">, _numero: string, texto: string) => {
      saidas.push({ instancia: atual.EVOLUTION_INSTANCE_NAME, texto }); return `envio-${sufixo}-${saidas.length}`;
    } };
  const eventos = [evento(principal, "mesmo-id"), evento(segundo, "mesmo-id"), evento(terceiro, "mesmo-id")];
  const mensagens = eventos.map(e => incomingMessage(e, e.instance)!);
  const jobKey = (indice: number) => `atendeia:{evolution}:followup:${mensagens[indice].conversation}`;
  try {
    for (const e of eventos) await enqueueEvolutionEventWithClient(client, e);
    for (let i = 0; i < 3; i++) await runAgentTick(dependencies);
    assert.deepEqual(saidas.map(s => s.instancia), [principal, segundo, terceiro]);
    assert.notEqual(geracoes[0].prompt, geracoes[1].prompt);
    assert.ok(geracoes[0].prompt.includes(`Variante ${principal}`));
    assert.ok(geracoes[1].prompt.includes(`Variante ${segundo}`));
    assert.ok(geracoes[2].prompt.includes(`Variante ${terceiro}`));
    assert.deepEqual(geracoes.map(g => g.historico.length), [0, 0, 0]);
    const lease = randomUUID(); await client.set(agentKeys.lock, lease, "PX", 120000);
    await messageStore(client, lease, mensagens[0]).rememberName("Carlos");
    assert.equal(await messageStore(client, lease, mensagens[1]).contactName(), null);
    assert.equal(await messageStore(client, lease, mensagens[2]).contactName(), null);
    for (let i = 0; i < 3; i++) {
      const job = JSON.parse((await client.get(jobKey(i)))!);
      assert.equal(job.instance, eventos[i].instance);
      await followupStore(client, lease).save({ ...job, due: Date.now() - 1 });
    }
    await client.del(agentKeys.lock);
    for (let i = 0; i < 3; i++) await runAgentTick(dependencies);
    assert.deepEqual(saidas.slice(3).map(s => s.texto).sort(), [a.steps[0].text, b.steps[0].text, c.steps[0].text].sort());
    assert.equal(geracoes.length, 3, "Follow-ups usam o painel, sem geração.");
    await enqueueEvolutionEventWithClient(client, evento(principal, randomUUID(), true));
    await enqueueEvolutionEventWithClient(client, evento(principal, randomUUID()));
    prompt = "Roteiro atualizado no painel.";
    await enqueueEvolutionEventWithClient(client, evento(segundo, randomUUID()));
    await enqueueEvolutionEventWithClient(client, evento(terceiro, randomUUID()));
    for (let i = 0; i < 4; i++) await runAgentTick(dependencies);
    assert.equal(saidas.length, 8, "A pausa do primeiro chip não bloqueia os demais.");
    assert.equal(saidas.at(-1)?.instancia, terceiro);
    assert.ok(geracoes.at(-1)?.prompt.includes(prompt));
    assert.ok(geracoes.at(-1)?.historico.every(t => !t.content.includes(principal)));
    assert.ok([principal, segundo, terceiro].every(instancia => consultas.includes(instancia)), "Consulta o chatbot de cada número.");
    assert.equal(await pausaManualAtiva(client, mensagens[0].conversation), true);
    assert.equal(await pausaManualAtiva(client, mensagens[1].conversation), false);
    assert.equal(await pausaManualAtiva(client, mensagens[2].conversation), false);
    assert.equal(await client.get(jobKey(0)), null);
    assert.ok(await client.get(jobKey(1)), "Segundo chip mantém seu próprio ciclo.");
    assert.ok(await client.get(jobKey(2)), "Terceiro chip mantém seu próprio ciclo.");
  } finally {
    await client.del(streamKey, agentKeys.lock, agentKeys.heartbeat, agentKeys.archive);
    for (const mensagem of mensagens) {
      await client.del(`atendeia:{evolution}:followup:${mensagem.conversation}`, pausaManualKey(mensagem.conversation),
        `atendeia:{evolution}:history:${mensagem.conversation}`, `atendeia:{evolution}:name:${mensagem.conversation}`);
      await client.zrem(followupQueue, mensagem.conversation);
    }
    client.disconnect();
  }
});

test("saída manual em lote somente com LID pausa o telefone associado e cancela follow-up", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const url = process.env.TEST_REDIS_URL!;
  const target = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/15");
  const client = agentRedis(url); await client.connect();
  const instance = `lid-${randomUUID()}`, telefone = "5511666555444@s.whatsapp.net", lid = "987654321@lid";
  const conversation = digest(`${instance}:${telefone}`), conversaLid = digest(`${instance}:${lid}`);
  const timestamp = Math.floor(Date.now() / 1000);
  const recebido: EvolutionEvent = { event: "messages.upsert", instance, data: {
    key: { id: randomUUID(), fromMe: false, remoteJid: lid, remoteJidAlt: telefone },
    messageTimestamp: timestamp, message: { conversation: "Olá" } } };
  const ciclo = `atendeia:{evolution}:followup:${conversation}`;
  try {
    await enqueueEvolutionEventWithClient(client, recebido);
    await client.set(ciclo, JSON.stringify({ started: timestamp * 1000 - 1000 }));
    await client.zadd(followupQueue, Date.now(), conversation);
    const manual: EvolutionEvent = { event: "messages.upsert", instance, data: [{
      key: { id: randomUUID(), fromMe: true, remoteJid: lid }, messageTimestamp: timestamp,
      message: { conversation: "Atendente assumiu" } }] };
    await enqueueEvolutionEventWithClient(client, manual);
    assert.equal(await pausaManualAtiva(client, conversation), true);
    assert.equal(await pausaManualAtiva(client, conversaLid), true);
    assert.equal(await pausaManualAtiva(client, digest(`outro:${telefone}`)), false);
    assert.equal(await client.get(ciclo), null);
    assert.equal(await client.zscore(followupQueue, conversation), null);
    assert.equal(await pausaManualAtiva(client, conversation, timestamp * 1000 + 1800000), false);
  } finally {
    await client.del(streamKey, ciclo, pausaManualKey(conversation), pausaManualKey(conversaLid),
      `atendeia:{evolution}:contact-alias:${conversation}`, `atendeia:{evolution}:contact-alias:${conversaLid}`);
    await client.zrem(followupQueue, conversation); client.disconnect();
  }
});
