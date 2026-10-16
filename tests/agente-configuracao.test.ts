import test from "node:test";
import assert from "node:assert/strict";
import { configurarAgente } from "../src/lib/agent/config";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { processMessage, type DeliveryState, type ProcessingPort } from "../src/lib/agent/processor";
import { generateReply, type Turn } from "../src/lib/agent/providers";
import { incomingMessage } from "../src/lib/agent/message";

const base = { AI_ENABLED: "true", OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "gpt-4.1-mini",
  EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste", EVOLUTION_INSTANCE_NAME: "chip-a", REDIS_URL: "redis://localhost:6379" };
const bot = { ...chatbotExample, persona: "Derek", gender: "Masculino" as const, context: "Atenda como Derek.", transferNotice: "Vou encaminhar para nossa equipe.", destination: "Suporte" as const };
const config = configurarAgente(base, bot).data!;
const mensagem = { identity: "id", conversation: "conversa", number: "5511999999999", text: "Qual seu nome?", timestamp: Date.now() / 1000 };
function portas() {
  let estado: DeliveryState | null = null;
  const historico: Turn[] = [{ role: "user", content: "Quero informações" }, { role: "assistant", content: "Eu sou a Thaís." }];
  const saidas: string[] = [];
  const destinos: string[] = [];
  const port: ProcessingPort = { read: async () => estado, write: async valor => { estado = valor; },
    history: async () => historico, enabled: async () => true, contactName: async () => "Allan",
    generate: async () => "Eu sou Derek.", transferir: async destino => { destinos.push(destino); },
    send: async (_config, _numero, texto) => { saidas.push(texto); return "saida"; },
    complete: async (valor, turnos) => { estado = valor; historico.push(...turnos); } };
  return { port, historico, saidas, destinos, estado: () => estado, nova: () => { estado = null; } };
}

test("persona e tom atuais prevalecem; roteiro antigo fica fora do contexto sem apagar histórico", async () => {
  const f = portas();
  f.port.generate = async (atual, historico) => {
    assert.match(atual.AI_SYSTEM_PROMPT, /Seu nome é Derek/);
    assert.match(atual.AI_SYSTEM_PROMPT, /Vendedor, Direto ao ponto, Profissional/);
    assert.deepEqual(historico, [{ role: "user", content: "Quero informações" }]);
    return "Eu sou Derek.";
  };
  assert.equal(await processMessage(mensagem, config, f.port), "enviada");
  assert.ok(f.historico.some(turno => turno.content === "Eu sou a Thaís."));
  f.nova();
  f.port.generate = async (_atual, historico) => {
    assert.ok(historico.some(turno => turno.content === "Eu sou Derek.")); return "Olá, Allan.";
  };
  await processMessage(mensagem, config, f.port);
  f.nova();
  const novaConfig = configurarAgente(base, { ...bot, persona: "Ana", context: "Atenda como Ana." }).data!;
  f.port.generate = async (atual, historico) => {
    assert.match(atual.AI_SYSTEM_PROMPT, /Seu nome é Ana/);
    assert.ok(historico.every(turno => turno.role === "user")); return "Eu sou Ana.";
  };
  await processMessage(mensagem, novaConfig, f.port);
});

test("transferência usa aviso literal e destino cadastrado, sem nome ou saudação acrescentados", async () => {
  const f = portas(); f.port.generate = async () => ({ transferir: true });
  await processMessage(mensagem, config, f.port);
  assert.deepEqual(f.destinos, ["Suporte"]);
  assert.deepEqual(f.saidas, [bot.transferNotice]);
  assert.equal(f.estado()?.transferencia, true);
  await processMessage(mensagem, config, f.port);
  assert.equal(f.saidas.length, 1);
});

test("transferência desligada ou falha no encaminhamento nunca envia confirmação falsa", async () => {
  const f = portas(); f.port.generate = async () => ({ transferir: true });
  const desligada = configurarAgente(base, { ...bot, transferHuman: false }).data!;
  assert.equal(await processMessage(mensagem, desligada, f.port), "repetir");
  assert.equal(f.saidas.length, 0); assert.equal(f.destinos.length, 0);
  f.nova(); f.port.transferir = async () => { throw new Error("Falha simulada"); };
  await assert.rejects(processMessage(mensagem, config, f.port));
  assert.equal(f.saidas.length, 0);
  assert.equal(await processMessage(mensagem, config, f.port), "incerta");
});

test("imagens transferem somente quando habilitadas e dispensam geração", async () => {
  const evento = { event: "messages.upsert" as const, instance: "chip-a", data: { key: { id: "imagem", fromMe: false,
    remoteJid: "5511999999999@s.whatsapp.net" }, messageTimestamp: Math.floor(Date.now() / 1000), message: { imageMessage: {} } } };
  assert.equal(incomingMessage(evento, "chip-a"), null);
  const midia = incomingMessage(evento, "chip-a", Date.now(), true)!;
  const f = portas(); f.port.generate = async () => { throw new Error("Não gerar para imagem"); };
  const configuracao = configurarAgente(base, { ...bot, transferMedia: true, transferHuman: false }).data!;
  assert.equal(await processMessage(midia, configuracao, f.port), "enviada");
  assert.deepEqual(f.destinos, ["Suporte"]);
});

test("provedor oferece ação apenas se habilitada e não envia metadados internos no histórico", async () => {
  const request: typeof fetch = async (_url, init) => {
    const corpo = JSON.parse(String(init?.body));
    assert.equal(corpo.tools[0].name, "transferir_para_humano");
    assert.equal(corpo.tools[0].strict, true);
    assert.equal(corpo.input[0].revisao, undefined);
    return Response.json({ status: "completed", output: [{ type: "function_call", name: "transferir_para_humano", arguments: "{}" }] });
  };
  assert.deepEqual(await generateReply(config, [{ role: "user", content: "Olá", revisao: "interna" }], "Quero um atendente", request), { transferir: true });
  const desativada = configurarAgente(base, { ...bot, transferHuman: false }).data!;
  await assert.rejects(generateReply(desativada, [], "Oi", async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).tools, undefined);
    return Response.json({ status: "completed", output: [{ type: "function_call", name: "transferir_para_humano", arguments: "{}" }] });
  }), /openai_acao_invalida/);
});
