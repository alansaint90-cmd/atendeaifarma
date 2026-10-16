import { administradorHttp } from "@/lib/auth/acesso-http";
import { origemHttpPermitida } from "@/lib/auth/origem-http";
import { effectiveSettings } from "@/lib/settings/repository";
import { ErroWebhookEvolution, sincronizarWebhooksConfigurados } from "@/lib/evolution/configurar-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const acesso = await administradorHttp();
  if (acesso.erro) return json({ error: "Acesso não autorizado." }, acesso.erro);
  if (!origemHttpPermitida(request)) return json({ error: "Origem não permitida." }, 403);
  try {
    await sincronizarWebhooksConfigurados(await effectiveSettings(), process.env.AUTH_ORIGIN ?? "");
    return json({ ok: true }, 200);
  } catch (error) {
    const mensagem = error instanceof ErroWebhookEvolution ? error.message : "Não foi possível sincronizar o webhook. Confira a conexão com a Evolution.";
    return json({ error: mensagem }, 503);
  }
}
