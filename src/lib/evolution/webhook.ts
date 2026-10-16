import { timingSafeEqual } from "node:crypto";
import { instanciasConfiguradas } from "./instancias";
import { evolutionEventSchema, webhookConfigSchema, type EvolutionEvent } from "./schema";

const MAX_BODY_BYTES = 1024 * 1024;
export type Enqueue = (event: EvolutionEvent, redisUrl: string) => Promise<"queued" | "duplicate">;
const json = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request, secret: string): boolean {
  const received = request.headers.get("x-webhook-secret") ?? "";
  const expectedBuffer = Buffer.from(secret);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function receiveEvolutionEvent(request: Request, environment: Record<string, string | undefined>, enqueue: Enqueue,
  persistir: (event: EvolutionEvent) => Promise<void> = async () => {}): Promise<Response> {
  const config = webhookConfigSchema.safeParse(environment);
  if (!config.success) return json({ error: "Webhook não configurado no servidor." }, 503);
  if (!authorized(request, config.data.EVOLUTION_WEBHOOK_SECRET)) return json({ error: "Não autorizado." }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Envie application/json." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "Evento muito grande." }, 413);
  if (!request.body) return json({ error: "Corpo vazio." }, 400);

  let raw: unknown;
  const reader = request.body.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return json({ error: "Evento muito grande." }, 413);
      }
      chunks.push(value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "JSON inválido." }, 400); }
  finally { reader.releaseLock(); }

  const event = evolutionEventSchema.safeParse(raw);
  if (!event.success) return json({ error: "Evento ou conteúdo não suportado." }, 422);
  if (!instanciasConfiguradas(config.data).includes(event.data.instance)) return json({ error: "Instância não autorizada." }, 403);
  try { await persistir(event.data); }
  catch { return json({ error: "Registro das mensagens indisponível. Tente novamente." }, 503); }
  try {
    const result = await enqueue(event.data, config.data.REDIS_URL);
    return json({ received: true, status: result }, result === "queued" ? 202 : 200);
  } catch {
    // Never log the payload, secret, Redis URL or upstream API key.
    return json({ error: "Fila indisponível. Tente novamente." }, 503);
  }
}
