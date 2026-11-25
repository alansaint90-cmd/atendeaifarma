import { beforeEach, expect, test, vi } from "vitest";
import { consultarEstadosIa, type OrigemEstadoIa } from "@/lib/operacao/estado-ia";
import { digest } from "@/lib/agent/message";

const portas = vi.hoisted(() => ({
  settings: vi.fn(), pausada: vi.fn(),
  redis: { connect: vi.fn(), get: vi.fn(), disconnect: vi.fn() },
}));
vi.mock("@/lib/settings/repository", () => ({ effectiveSettings: portas.settings }));
vi.mock("@/lib/agent/redis", () => ({ agentRedis: () => portas.redis, agentKeys: { heartbeat: "status-agente" } }));
vi.mock("@/lib/agent/pausa", () => ({ pausaManualAtiva: portas.pausada }));

const base: OrigemEstadoIa = { id: "a", status: "open", instancia: "chip-principal", jid: "5511999990001@s.whatsapp.net", assumida: false, atribuida: false };
const configuracao = {
  AI_ENABLED: "true", OPENAI_API_KEY: "sk-ficticio", OPENAI_MODEL: "modelo-teste", REDIS_URL: "redis://localhost:6379",
  EVOLUTION_API_URL: "https://example.invalid", EVOLUTION_API_KEY: "chave-ficticia",
  EVOLUTION_INSTANCE_NAME: "chip-principal", EVOLUTION_SECOND_INSTANCE_NAME: "chip-secundario",
};

beforeEach(() => {
  vi.resetAllMocks();
  portas.settings.mockResolvedValue(configuracao);
  portas.redis.get.mockResolvedValue('{"status":"ativo"}');
  portas.pausada.mockImplementation(async (_cliente, chave: string) => chave === digest(`chip-secundario:${base.jid}`));
});

test("usa a instância correta, a pausa do processador e o atendimento registrado", async () => {
  const estados = await consultarEstadosIa([
    base, { ...base, id: "b", instancia: "chip-secundario" }, { ...base, id: "c", assumida: true, atribuida: true },
    { ...base, id: "d", assumida: true }, { ...base, id: "e", instancia: "outro" }, { ...base, id: "f", status: "closed" },
    { ...base, id: "g", pausaPainel: true },
  ]);
  expect(Object.fromEntries(estados)).toEqual({ a: "ativa", b: "pausada", c: "humano", d: "pausada", e: "indisponivel", g: "pausada" });
  expect(portas.pausada).toHaveBeenCalledTimes(2);
  expect(portas.pausada).toHaveBeenCalledWith(portas.redis, digest(`${base.instancia}:${base.jid}`), expect.any(Number), undefined);
  expect(portas.redis.disconnect).toHaveBeenCalledOnce();
});

test("sem sinal do processador ou sem Redis não indica IA ativa", async () => {
  portas.redis.get.mockResolvedValueOnce(null);
  expect((await consultarEstadosIa([base])).get("a")).toBe("indisponivel");
  portas.redis.connect.mockRejectedValueOnce(new Error("Redis indisponível"));
  expect((await consultarEstadosIa([base])).get("a")).toBe("indisponivel");
  portas.settings.mockResolvedValueOnce({ ...configuracao, AI_ENABLED: "false" });
  expect((await consultarEstadosIa([base])).get("a")).toBe("desativada");
  expect(portas.pausada).not.toHaveBeenCalled();
});

test("modo teste exibe IA desativada para outras conversas", async () => {
  portas.settings.mockResolvedValue({ ...configuracao, AI_TEST_MODE: "true", AI_TEST_WHATSAPP_NUMBER: "+55 (11) 99999-0001" });
  const estados = await consultarEstadosIa([
    base, { ...base, id: "outra", jid: "5511999990002@s.whatsapp.net" },
    { ...base, id: "humana", jid: "5511999990002@s.whatsapp.net", assumida: true, atribuida: true },
  ]);
  expect(Object.fromEntries(estados)).toEqual({ a: "ativa", outra: "desativada", humana: "humano" });
  expect(portas.pausada).toHaveBeenCalledOnce();
});
