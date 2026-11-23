import { z } from "zod";
import { agentBaseConfigSchema } from "../agent/config";
import { digest } from "../agent/message";
import { pausaManualAtiva } from "../agent/pausa";
import { agentKeys, agentRedis } from "../agent/redis";
import { instanciasConfiguradas } from "../evolution/instancias";
import { effectiveSettings } from "../settings/repository";

export type EstadoIaConversa = "ativa" | "pausada" | "humano" | "desativada" | "indisponivel";
export interface OrigemEstadoIa {
  id: string;
  status: string;
  instancia: string;
  jid: string;
  assumida: boolean;
  atribuida: boolean;
}

const heartbeatSchema = z.object({ status: z.string() });
const portasPadrao = { settings: effectiveSettings, redis: agentRedis, pausada: pausaManualAtiva };

export async function consultarEstadosIa(conversas: OrigemEstadoIa[], portas = portasPadrao) {
  const estados = new Map<string, EstadoIaConversa>();
  const candidatas = conversas.filter(conversa => {
    if (conversa.status === "closed") return false;
    if (!conversa.assumida) return true;
    estados.set(conversa.id, conversa.atribuida ? "humano" : "pausada");
    return false;
  });
  if (!candidatas.length) return estados;

  let redis: ReturnType<typeof agentRedis> | undefined;
  try {
    const settings = await portas.settings();
    if (settings.AI_ENABLED !== "true") {
      for (const conversa of candidatas) estados.set(conversa.id, "desativada");
      return estados;
    }
    const instancias = instanciasConfiguradas(settings);
    const config = agentBaseConfigSchema.safeParse(settings);
    if (!config.success) throw new Error("Configuração da IA incompleta.");

    redis = portas.redis(config.data.REDIS_URL);
    await redis.connect();
    const valor = await redis.get(agentKeys.heartbeat);
    const heartbeat = heartbeatSchema.safeParse(JSON.parse(valor ?? "null"));
    if (!heartbeat.success || heartbeat.data.status !== "ativo") throw new Error("Processador da IA indisponível.");

    const client = redis;
    const resultados = await Promise.all(candidatas.map(async (conversa): Promise<[string, EstadoIaConversa]> => {
      if (!instancias.includes(conversa.instancia) || !/^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(conversa.jid)) {
        return [conversa.id, "indisponivel"];
      }
      const pausada = await portas.pausada(client, digest(`${conversa.instancia}:${conversa.jid}`));
      return [conversa.id, pausada ? "pausada" : "ativa"];
    }));
    for (const [id, estado] of resultados) estados.set(id, estado);
  } catch {
    for (const conversa of candidatas) estados.set(conversa.id, "indisponivel");
  } finally { redis?.disconnect(); }
  return estados;
}
