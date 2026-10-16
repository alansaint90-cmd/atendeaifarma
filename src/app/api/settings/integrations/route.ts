import { administradorHttp } from "@/lib/auth/acesso-http";
import { environmentSettings, readSettings, saveSettings, SettingsConflict, AgentSettingsIncomplete, InstanciasDuplicadas } from "@/lib/settings/repository";
import { saveSettingsSchema, settingsStatus } from "@/lib/settings/schema";
import { origemHttpPermitida } from "@/lib/auth/origem-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function unavailable() {
  return json({ error: "Não foi possível acessar as configurações. Confira DATABASE_URL, SETTINGS_ENCRYPTION_KEY e a conexão/permissão do PostgreSQL no servidor." }, 503);
}

export async function GET() {
  const acesso = await administradorHttp();
  if (acesso.erro) return json({ error: "Acesso não autorizado." }, acesso.erro);
  try {
    const result = await readSettings();
    return json(settingsStatus({ ...environmentSettings(), ...result.values }, result.version));
  } catch { return unavailable(); }
}

export async function PUT(request: Request) {
  const acesso = await administradorHttp();
  if (acesso.erro) return json({ error: "Acesso não autorizado." }, acesso.erro);
  if (!origemHttpPermitida(request)) return json({ error: "Origem não permitida." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Envie JSON." }, 415);
  if (Number(request.headers.get("content-length")) > 1048576) return json({ error: "Conteúdo muito grande." }, 413);
  let input: unknown;
  try {
    if (!request.body) return json({ error: "Corpo vazio." }, 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1048576) { await reader.cancel(); return json({ error: "Conteúdo muito grande." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "JSON inválido." }, 400); }
  const parsed = saveSettingsSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Campos inválidos: " + [...new Set(parsed.error.issues.map(issue => issue.path.join(".")))].join(", ") }, 422);
  try {
    const result = await saveSettings(parsed.data.values, parsed.data.version, acesso.sessao.userId);
    return json(settingsStatus({ ...environmentSettings(), ...result.values }, result.version));
  } catch (error) {
    if (error instanceof InstanciasDuplicadas) return json({ error: "Cada número precisa de um nome de instância diferente na Evolution." }, 422);
    if (error instanceof AgentSettingsIncomplete) return json({ error: "Para ativar, preencha modelo e chave OpenAI, URL/chave/instância Evolution e Redis. Configure também o chatbot em Chatbot IA." }, 422);
    if (error instanceof SettingsConflict) return json({ error: "Outra sessão alterou as configurações. Recarregue antes de salvar." }, 409);
    return unavailable();
  }
}
