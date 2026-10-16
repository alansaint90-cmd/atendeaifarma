import { administradorHttp } from "@/lib/auth/acesso-http";
import { effectiveSettings } from "@/lib/settings/repository";
import { agentRedis, agentKeys } from "@/lib/agent/redis";
import { streamKey } from "@/lib/evolution/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const acesso = await administradorHttp();
  if (acesso.erro) return json({ error: "Acesso não autorizado." }, acesso.erro);
  let client: ReturnType<typeof agentRedis> | undefined;
  try {
    const settings = await effectiveSettings();
    if (!settings.REDIS_URL) return json({ error: "REDIS_URL não configurada." }, 503);
    client = agentRedis(settings.REDIS_URL);
    await client.connect();
    const heartbeat = await client.get(agentKeys.heartbeat);
    return json({ workerEnabled: process.env.ATENDEIA_WORKER_ENABLED === "true", enabled: settings.AI_ENABLED === "true",
      queued: await client.xlen(streamKey), worker: heartbeat ? JSON.parse(heartbeat) : null });
  } catch { return json({ error: "Não foi possível consultar o agente. Confira Redis e configurações do servidor." }, 503); }
  finally { client?.disconnect(); }
}
