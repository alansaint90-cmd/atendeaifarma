import { db } from "../db/client";
import { ensureDatabase } from "../db/migrate";
import { effectiveSettings } from "../settings/repository";
import { settingsSchema, type IntegrationSettings } from "../settings/schema";
import { instanciasConfiguradas, settingsDaInstancia } from "../evolution/instancias";
import { sendReply, ProviderError } from "../agent/providers";
import { reservarAgendamento, concluirAgendamento, type BancoAgendamentos } from "./repository";

const configuracaoEnvio = settingsSchema.pick({ EVOLUTION_API_URL: true, EVOLUTION_API_KEY: true, EVOLUTION_INSTANCE_NAME: true }).required();
export async function processarAgendamento(banco: BancoAgendamentos, configuracoes: () => Promise<IntegrationSettings>, enviar = sendReply) {
  const settings = await configuracoes();
  // Um envio por chip a cada ciclo evita que a fila principal impeça os demais.
  for (const instancia of instanciasConfiguradas(settings)) {
    await processarChip(banco, settings, instancia, configuracoes, enviar);
  }
}
async function processarChip(banco: BancoAgendamentos, settings: IntegrationSettings, instancia: string,
  configuracoes: () => Promise<IntegrationSettings>, enviar: typeof sendReply) {
  const inicial = configuracaoEnvio.safeParse(settingsDaInstancia(settings, instancia));
  if (!inicial.success) return;
  const item = await reservarAgendamento(banco, inicial.data.EVOLUTION_INSTANCE_NAME);
  if (!item) return;
  const atual = configuracaoEnvio.safeParse(settingsDaInstancia(await configuracoes(), instancia));
  if (!atual.success || JSON.stringify(atual.data) !== JSON.stringify(inicial.data)) {
    await concluirAgendamento(banco, item, "erro", "configuracao_alterada", null); return;
  }
  let provedor: string;
  try { provedor = await enviar(atual.data, item.telefone.slice(1), item.mensagem); }
  catch (error) {
    await concluirAgendamento(banco, item, "incerto", error instanceof ProviderError ? error.code : "envio_incerto", null); return;
  }
  // Se a confirmação no banco falhar, a reserva nunca retorna para pendente.
  await concluirAgendamento(banco, item, "enviado", null, provedor);
}
export async function executarAgendamentos() {
  if (!process.env.DATABASE_URL) return;
  await ensureDatabase();
  await processarAgendamento(db(), effectiveSettings);
}
