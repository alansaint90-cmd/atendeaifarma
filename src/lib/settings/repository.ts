import { sql, type SQL } from "drizzle-orm";
import { seal, unseal } from "./security";
import { settingsSchema, settingNames, type IntegrationSettings } from "./schema";
import { db } from "../db/client";
import { ensureDatabase } from "../db/migrate";
import { agentBaseConfigSchema } from "../agent/config";
import { defaultFollowup } from "../followups/schema";
import { camposInstancias } from "../evolution/instancias";

interface SettingsTransaction { execute(query: SQL): PromiseLike<unknown> }
interface SettingsDatabase extends SettingsTransaction { transaction<T>(work: (tx: SettingsTransaction) => Promise<T>): Promise<T> }
function rows<T>(result: unknown): T[] { return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[]; }
// A configuração legada tem id textual; a trilha geral exige um UUID estável por entidade.
const integrationsAuditId = "00000000-0000-4000-8000-000000000020";

async function initialize(database: SettingsDatabase, prepare: () => Promise<void>) {
  await prepare();
  await database.execute(sql`INSERT INTO atendeia_integration_settings (id, encrypted_payload, modified_by)
    VALUES ('integrations', ${seal({})}, 'bootstrap-admin') ON CONFLICT DO NOTHING`);
}
export function environmentSettings(): IntegrationSettings {
  return Object.fromEntries(settingNames.filter(name => process.env[name]).map(name => [name, process.env[name]]));
}

export async function readSettings(database: SettingsDatabase = db(), prepare: () => Promise<void> = ensureDatabase) {
  await initialize(database, prepare);
  const current = rows<{ encrypted_payload: string; version: number }>(await database.execute(sql`SELECT encrypted_payload, version FROM atendeia_integration_settings
    WHERE id = 'integrations' AND is_deleted = false`));
  if (!current[0]) throw new Error("Settings unavailable");
  return { values: settingsSchema.parse(unseal(String(current[0].encrypted_payload))), version: Number(current[0].version) };
}

export class SettingsConflict extends Error {}
export class AgentSettingsIncomplete extends Error {}
export class InstanciasDuplicadas extends Error {}
export async function saveSettings(values: IntegrationSettings, version: number, usuario: string,
  database: SettingsDatabase = db(), prepare: () => Promise<void> = ensureDatabase) {
  const current = await readSettings(database, prepare);
  if (current.version !== version) throw new SettingsConflict();
  const merged = settingsSchema.parse({ ...current.values, ...values });
  const effective = { ...environmentSettings(), ...merged };
  const instancias = camposInstancias.map(([nome]) => effective[nome]).filter(Boolean);
  if (new Set(instancias).size !== instancias.length) {
    throw new InstanciasDuplicadas();
  }
  if (effective.AI_ENABLED === "true" && !agentBaseConfigSchema.safeParse(effective).success) {
    throw new AgentSettingsIncomplete();
  }
  const alterados = new Set(Object.keys(values));
  const anterior = { ...environmentSettings(), ...current.values };
  for (const [nome, campo] of camposInstancias) {
    if (values[nome] !== undefined && values[nome] !== anterior[nome] && anterior[campo]) {
      merged[campo] = JSON.stringify({ ...defaultFollowup, instance: values[nome] });
      alterados.add(campo);
    }
  }
  await database.transaction(async tx => {
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields)
      VALUES (${usuario},'integracoes_alteradas','integracoes',${integrationsAuditId},${JSON.stringify([...alterados])}::jsonb)`);
    const actor = rows<{ id: string }>(await tx.execute(sql`SELECT id FROM atendeia_settings_actors
      WHERE id = 'bootstrap-admin' AND role = 'super_admin' AND is_deleted = false`));
    if (!actor.length) throw new Error("Admin unavailable");
    const updated = rows<{ version: number }>(await tx.execute(sql`UPDATE atendeia_integration_settings
      SET encrypted_payload = ${seal(merged)}, version = version + 1, updated_at = now(), modified_by = 'bootstrap-admin'
      WHERE id = 'integrations' AND version = ${version} AND is_deleted = false RETURNING version`));
    if (!updated.length) throw new SettingsConflict();
    await tx.execute(sql`INSERT INTO atendeia_settings_audit (settings_id, version, changed_fields, modified_by)
      VALUES ('integrations', ${version + 1}, ${[...alterados].join(",")}, 'bootstrap-admin')`);
  });
  return { values: merged, version: version + 1 };
}

export async function effectiveSettings() {
  const environment = environmentSettings();
  // Existing environment-only deployments continue to work until persistence is enabled.
  if (!process.env.SETTINGS_ENCRYPTION_KEY) return environment;
  return { ...environment, ...(await readSettings()).values };
}
