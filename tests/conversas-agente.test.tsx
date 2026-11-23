import { beforeEach, expect, test, vi } from "vitest";
import { chatbotExample } from "@/lib/chatbots/defaults";
import { runAgentTick } from "@/lib/agent/worker";

const d = vi.hoisted(() => {
  const valores = new Map<string, string>();
  return { valores, processar: vi.fn(), arquivar: vi.fn(), ler: vi.fn(), apagada: vi.fn(),
    followups: { observe: vi.fn(), due: vi.fn(), outgoing: vi.fn(), schedule: vi.fn(), finish: vi.fn() },
    redis: { status: "ready", connect: vi.fn(), disconnect: vi.fn(), xgroup: vi.fn(), xreadgroup: vi.fn(),
      set: vi.fn(async (chave: string, valor: string) => { valores.set(chave, valor); return "OK"; }),
      get: vi.fn(async (chave: string) => valores.get(chave) ?? null), eval: vi.fn(async () => 1) } };
});
vi.mock("@/lib/agent/redis", () => ({ agentRedis: () => d.redis, owned: "", agentKeys: { lock: "lock", heartbeat: "heartbeat", group: "group", consumer: "consumer" } }));
vi.mock("@/lib/agent/store", () => ({ finishEvent: d.arquivar, messageStore: () => ({ read: d.ler }) }));
vi.mock("@/lib/agent/processor", () => ({ processMessage: d.processar }));
vi.mock("@/lib/followups/queue", () => ({ followupStore: () => d.followups }));

const timestamp = () => Math.floor(Date.now() / 1000);
const dependencias = () => ({ settings: async () => ({ AI_ENABLED: "true", OPENAI_API_KEY: "sk-teste-ficticio", OPENAI_MODEL: "modelo-teste",
  EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "chave-ficticia", EVOLUTION_INSTANCE_NAME: "chip-ficticio", REDIS_URL: "redis://127.0.0.1:6379/15" }),
  chatbot: async () => ({ ...chatbotExample, perguntarNome: false, context: "Teste fictício" }),
  generate: vi.fn(), send: vi.fn(), apagada: d.apagada, registrarEnvio: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks(); d.valores.clear(); d.apagada.mockResolvedValue(false); d.ler.mockResolvedValue(null); d.followups.due.mockResolvedValue(null);
  d.redis.xreadgroup.mockResolvedValue([["fila", [["1-0", ["payload", JSON.stringify({ event: "messages.upsert", instance: "chip-ficticio",
    data: { key: { id: "mensagem-ficticia", fromMe: false, remoteJid: "5511999990001@s.whatsapp.net" }, messageTimestamp: timestamp(), message: { conversation: "Olá" } } })]]]]]);
});
test("agente arquiva evento anterior à exclusão sem gerar, enviar ou agendar follow-up", async () => {
  const portas = dependencias(); d.apagada.mockResolvedValue(true);
  await runAgentTick(portas);
  expect(d.processar).not.toHaveBeenCalled(); expect(portas.send).not.toHaveBeenCalled(); expect(portas.generate).not.toHaveBeenCalled();
  expect(d.followups.schedule).not.toHaveBeenCalled(); expect(d.arquivar.mock.calls[0].at(-1)).toBe("conversa_apagada");
  expect(d.apagada).toHaveBeenCalledWith("chip-ficticio", "5511999990001", expect.any(Number), expect.any(String));
});
test("exclusão entre partes desativa a continuação e libera o evento sem repetição", async () => {
  d.processar.mockImplementationOnce(async (_mensagem, _config, portas: { enabled: () => Promise<boolean> }) => {
    expect(await portas.enabled()).toBe(true);
    d.apagada.mockResolvedValue(true);
    expect(await portas.enabled()).toBe(false);
    return "pausada";
  });
  await runAgentTick(dependencias());
  expect(d.arquivar.mock.calls[0].at(-1)).toBe("conversa_apagada"); expect(d.followups.schedule).not.toHaveBeenCalled();
});

test("worker registra cada balão confirmado com texto e telefone sem pedir o nome", async () => {
  const portas = dependencias();
  portas.chatbot = async () => ({ ...chatbotExample, perguntarNome: true, context: "Teste fictício" });
  d.processar.mockImplementationOnce(async (_mensagem, config, adaptador: { registrarParte: (id: string, texto: string) => Promise<void> }) => {
    expect(config.perguntarNome).toBe(false); expect(config.AI_SYSTEM_PROMPT).toContain("Farmácia WE");
    await adaptador.registrarParte("id-envio", "Resposta fictícia");
    return "enviada";
  });
  await runAgentTick(portas);
  expect(portas.registrarEnvio).toHaveBeenCalledWith("chip-ficticio", "id-envio", { numero: "5511999990001", texto: "Resposta fictícia", origem: { identidade: expect.any(String), instante: expect.any(Number) } });
});
test("job real de follow-up anterior à exclusão é cancelado sem envio", async () => {
  d.redis.xreadgroup.mockResolvedValue([]); d.apagada.mockResolvedValue(true);
  const job = { instance: "chip-ficticio", conversation: "conversa-ficticia", identity: "id-ficticio", number: "5511999990001", started: timestamp() * 1000,
    index: 0, due: Date.now() - 1000, revision: "teste", status: "aguardando" };
  d.followups.due.mockResolvedValue(job); const portas = dependencias();
  await runAgentTick(portas);
  expect(d.followups.finish).toHaveBeenCalledWith(job, "cancelado"); expect(portas.send).not.toHaveBeenCalled();
  expect(d.apagada).toHaveBeenCalledWith("chip-ficticio", job.number, job.started / 1000, job.identity);
});
