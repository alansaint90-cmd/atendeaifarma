import test from "node:test";
import assert from "node:assert/strict";
import { processMessage, type DeliveryState, type ProcessingPort } from "../src/lib/agent/processor";
import { configurarAgente } from "../src/lib/agent/config";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { incomingMessage } from "../src/lib/agent/message";
import { extrairNomeInformado, respostaComNome } from "../src/lib/agent/nome";
import type { Turn } from "../src/lib/agent/providers";

const abertura = ["Olá, bem-vindo à LevLava Lavanderia Express em Vilas do Atlântico.",
  "Nós estamos abertos 24 horas. Qual é o seu nome para que eu possa te atender melhor?"];
const config = configurarAgente({ AI_ENABLED: "true", OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "modelo",
  EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "teste", EVOLUTION_INSTANCE_NAME: "levaelava",
  REDIS_URL: "redis://localhost:6379" }, { ...chatbotExample, context: "Prompt do painel", openingMessages: abertura }).data!;
const mensagem = incomingMessage({ instance: "levaelava", event: "messages.upsert", data: {
  key: { id: "teste", fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" },
  messageTimestamp: 1700000000, message: { conversation: "Oi" } } }, "levaelava", 1700000000000)!;
function fixture() {
  let estado: DeliveryState | null = null;
  const envios: string[] = [], registrados: string[] = [], historico: Turn[] = [];
  const port: ProcessingPort = {
    read: async () => estado, write: async valor => { estado = structuredClone(valor); },
    history: async () => historico, enabled: async () => true,
    generate: async () => "Resposta do prompt. Qual seu nome?",
    send: async (_config, _numero, texto) => { envios.push(texto); return `id-${envios.length}`; },
    registrarParte: async id => { registrados.push(id); },
    complete: async (valor, turnos) => { estado = valor; historico.push(...turnos); },
  };
  return { port, envios, registrados, historico, estado: () => estado };
}
test("qual seu nome não recebe pergunta duplicada e reconhece a resposta seguinte", () => {
  for (const pergunta of ["Qual seu nome para eu te atender melhor?", "Qual é o seu nome?", "Como prefere ser chamado?"]) {
    assert.equal(respostaComNome(pergunta, null), pergunta);
    assert.equal(extrairNomeInformado("Alan", [{ role: "assistant", content: pergunta }]), "Alan");
  }
});
test("abertura envia dois balões literais em ordem, registra todos os IDs e não chama a IA", async () => {
  const f = fixture(); f.port.generate = async () => { throw new Error("Não gerar a abertura fixa"); };
  assert.equal(await processMessage(mensagem, config, f.port), "enviada");
  assert.deepEqual(f.envios, abertura); assert.deepEqual(f.registrados, ["id-1", "id-2"]);
  assert.equal(f.historico[1].content, abertura.join("\n\n"));
  assert.equal(await processMessage(mensagem, config, f.port), "enviada");
  assert.equal(f.envios.length, 2);
});
test("pausa humana entre balões interrompe a sequência sem reenviar o primeiro", async () => {
  const f = fixture(); f.port.enabled = async () => f.envios.length === 0;
  assert.equal(await processMessage(mensagem, config, f.port), "pausada");
  assert.deepEqual(f.envios, [abertura[0]]);
  f.port.enabled = async () => true;
  assert.equal(await processMessage(mensagem, config, f.port), "enviada");
  assert.deepEqual(f.envios, abertura);
});
test("falha no segundo balão não repete nenhum envio, nem após reinício", async () => {
  const f = fixture(); const enviar = f.port.send;
  f.port.send = async (...args) => { if (f.envios.length) throw new Error("Timeout"); return enviar(...args); };
  assert.equal(await processMessage(mensagem, config, f.port), "incerta");
  assert.equal(await processMessage(mensagem, config, f.port), "incerta");
  assert.deepEqual(f.envios, [abertura[0]]);
});
test("queda ao persistir o primeiro balão confirmado não permite reenvio", async () => {
  const f = fixture(); const gravar = f.port.write;
  f.port.write = async estado => {
    if (estado.status === "gerada" && estado.providerIds?.length) throw new Error("Redis indisponível");
    await gravar(estado);
  };
  await assert.rejects(processMessage(mensagem, config, f.port));
  f.port.write = gravar;
  assert.equal(await processMessage(mensagem, config, f.port), "incerta");
  assert.deepEqual(f.envios, [abertura[0]]);
});
test("sem abertura, cliente conhecido ou pergunta direta segue o prompt", async () => {
  for (const caso of ["sem abertura", "cliente conhecido", "pergunta direta", "histórico"]) {
    const f = fixture();
    if (caso === "cliente conhecido") f.port.contactName = async () => "Alan";
    if (caso === "histórico") f.historico.push({ role: "user", content: "Anterior" });
    await processMessage(caso === "pergunta direta" ? { ...mensagem, text: "Qual o endereço?" } : mensagem,
      caso === "sem abertura" ? { ...config, openingMessages: undefined } : config, f.port);
    assert.deepEqual(f.envios, ["Resposta do prompt. Qual seu nome?"]);
  }
});
test("mudança de configuração após primeiro balão não reinicia a abertura", async () => {
  const f = fixture(); f.port.enabled = async () => f.envios.length === 0;
  await processMessage(mensagem, config, f.port); f.port.enabled = async () => true;
  assert.equal(await processMessage(mensagem, { ...config, openingMessages: ["Nova abertura"] }, f.port), "falhou");
  assert.deepEqual(f.envios, [abertura[0]]);
});
