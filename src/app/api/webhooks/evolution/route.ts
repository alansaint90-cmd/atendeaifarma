import { receiveEvolutionEvent } from "@/lib/evolution/webhook";
import { enqueueEvolutionEvent } from "@/lib/evolution/queue";
import { effectiveSettings } from "@/lib/settings/repository";
import { ensureDatabase } from "@/lib/db/migrate";
import { db } from "@/lib/db/client";
import { receberOperacao } from "@/lib/operacao/receber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await receiveEvolutionEvent(request, await effectiveSettings(), enqueueEvolutionEvent, async evento => {
      await ensureDatabase();
      await receberOperacao(db(), evento);
    });
  } catch {
    return Response.json({ error: "Configurações indisponíveis no servidor." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export function GET() {
  return Response.json({ service: "Atende AI Evolution webhook", method: "POST", mode: "queue-worker" }, { headers: { "Cache-Control": "no-store" } });
}
