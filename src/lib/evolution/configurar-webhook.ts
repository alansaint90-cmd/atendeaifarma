import { z } from "zod";
import { settingsSchema } from "../settings/schema";
import { instanciasConfiguradas } from "./instancias";

const configuracaoSchema = z.object({
  EVOLUTION_API_URL: settingsSchema.shape.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: settingsSchema.shape.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE_NAME: settingsSchema.shape.EVOLUTION_INSTANCE_NAME,
  EVOLUTION_WEBHOOK_SECRET: settingsSchema.shape.EVOLUTION_WEBHOOK_SECRET,
}).required();
const rotulosConfiguracao: Record<keyof z.infer<typeof configuracaoSchema>, string> = {
  EVOLUTION_API_URL: "URL base da Evolution",
  EVOLUTION_API_KEY: "chave de API da Evolution",
  EVOLUTION_INSTANCE_NAME: "nome exato da instância",
  EVOLUTION_WEBHOOK_SECRET: "segredo do webhook",
};
const webhookSchema = z.object({
  url: z.string(),
  events: z.array(z.string().regex(/^[A-Z_]+$/)).max(100),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
  webhookByEvents: z.boolean().optional(),
  webhookBase64: z.boolean().optional(),
});
type Webhook = z.infer<typeof webhookSchema>;
const eventosNecessarios = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];
export class ErroWebhookEvolution extends Error {}

export async function sincronizarWebhooksConfigurados(values: unknown, origin: string, request: typeof fetch = fetch) {
  const configuracao = settingsSchema.safeParse(values);
  if (!configuracao.success) throw new ErroWebhookEvolution("Confira as configurações salvas da Evolution.");
  const instancias = instanciasConfiguradas(configuracao.data);
  if (!configuracao.data.EVOLUTION_INSTANCE_NAME) { await sincronizarWebhookEvolution(values, origin, request); return; }
  for (const instancia of instancias) {
    try {
      await sincronizarWebhookEvolution({ ...configuracao.data, EVOLUTION_INSTANCE_NAME: instancia }, origin, request);
    } catch (erro) {
      const mensagem = erro instanceof ErroWebhookEvolution ? erro.message : "Falha de conexão com a Evolution.";
      throw new ErroWebhookEvolution(`Instância ${instancia}: ${mensagem} A sincronização de todos os chips ainda não foi concluída.`);
    }
  }
}

function extrairWebhook(value: unknown): Webhook {
  const envelope = z.object({ webhook: z.unknown() }).safeParse(value);
  return webhookSchema.parse(envelope.success ? envelope.data.webhook : value);
}

async function consultar(url: string, key: string, request: typeof fetch): Promise<Webhook> {
  const response = await request(url, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(10000), headers: { apikey: key },
  });
  if (!response.ok) throw new ErroWebhookEvolution("A Evolution não permitiu consultar o webhook da instância.");
  try { return extrairWebhook(await response.json()); }
  catch { throw new ErroWebhookEvolution("A Evolution retornou uma configuração de webhook inválida."); }
}

export async function sincronizarWebhookEvolution(values: unknown, origin: string, request: typeof fetch = fetch): Promise<void> {
  const parsed = configuracaoSchema.safeParse(values);
  if (!parsed.success) {
    const campos = [...new Set(parsed.error.issues.map(issue =>
      rotulosConfiguracao[issue.path[0] as keyof typeof rotulosConfiguracao] ?? "configuração da Evolution"))];
    throw new ErroWebhookEvolution(`Confira em Configurações: ${campos.join(", ")}. Salve antes de sincronizar.`);
  }
  const config = parsed.data;
  let app: URL;
  try { app = new URL(origin); }
  catch { throw new ErroWebhookEvolution("Configure AUTH_ORIGIN com a origem HTTPS do Atende AI."); }
  if (app.origin !== origin || (process.env.NODE_ENV === "production" && app.protocol !== "https:")) {
    throw new ErroWebhookEvolution("Configure AUTH_ORIGIN com a origem HTTPS do Atende AI.");
  }
  const api = `${config.EVOLUTION_API_URL.replace(/\/$/, "")}/webhook`;
  const endpoint = `${api}/set/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`;
  const consulta = `${api}/find/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`;
  const atual = await consultar(consulta, config.EVOLUTION_API_KEY, request);
  const headers = Object.fromEntries(Object.entries(atual.headers ?? {})
    .filter(([name]) => name.toLowerCase() !== "x-webhook-secret"));
  headers["x-webhook-secret"] = config.EVOLUTION_WEBHOOK_SECRET;
  const url = `${origin}/api/webhooks/evolution`;
  const events = [...new Set([...atual.events, ...eventosNecessarios])];
  let response: Response;
  try {
    response = await request(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { apikey: config.EVOLUTION_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ webhook: { enabled: true, url, headers, byEvents: false, base64: false, events } }),
    });
  } catch { throw new ErroWebhookEvolution("Não foi possível atualizar o webhook na Evolution."); }
  if (!response.ok) throw new ErroWebhookEvolution(`A Evolution recusou a configuração do webhook (HTTP ${response.status}).`);
  const confirmado = await consultar(consulta, config.EVOLUTION_API_KEY, request);
  const segredo = Object.entries(confirmado.headers ?? {}).find(([name]) => name.toLowerCase() === "x-webhook-secret")?.[1];
  if (confirmado.url !== url || segredo !== config.EVOLUTION_WEBHOOK_SECRET
    || confirmado.enabled === false || confirmado.webhookByEvents === true || confirmado.webhookBase64 === true
    || !eventosNecessarios.every(evento => confirmado.events.includes(evento))) {
    throw new ErroWebhookEvolution("A Evolution não confirmou a URL, os eventos e o cabeçalho do webhook.");
  }
}
