import type { IntegrationSettings } from "../settings/schema";
import { parseFollowup } from "../followups/schema";

export const camposInstancias = [
  ["EVOLUTION_INSTANCE_NAME", "FOLLOW_UP_CONFIG"],
  ["EVOLUTION_SECOND_INSTANCE_NAME", "FOLLOW_UP_SECOND_CONFIG"],
  ["EVOLUTION_THIRD_INSTANCE_NAME", "FOLLOW_UP_THIRD_CONFIG"],
] as const;
type Instancias = Pick<IntegrationSettings, typeof camposInstancias[number][0]>;

export function instanciasConfiguradas(settings: Instancias): string[] {
  return [...new Set(camposInstancias.map(([nome]) => settings[nome])
    .filter((nome): nome is string => Boolean(nome)))];
}

export function campoFollowup(settings: Instancias, instancia: string) {
  return camposInstancias.find(([nome]) => instancia && settings[nome] === instancia)?.[1] ?? null;
}

export function followupDaInstancia(settings: IntegrationSettings, instancia: string) {
  const campo = campoFollowup(settings, instancia);
  const config = parseFollowup(campo ? settings[campo] : undefined);
  // Renomear um chip nunca reaproveita os envios habilitados do número anterior.
  if (!campo || (config.instance && config.instance !== instancia)) {
    return { ...parseFollowup(), instance: instancia };
  }
  return { ...config, instance: instancia };
}

export function settingsDaInstancia(settings: IntegrationSettings, instancia: string): IntegrationSettings | null {
  if (!instanciasConfiguradas(settings).includes(instancia)) return null;
  // Configurações de follow-up não mudam o prompt nem o diário de resposta da IA.
  const { FOLLOW_UP_CONFIG: _principal, FOLLOW_UP_SECOND_CONFIG: _segundo,
    FOLLOW_UP_THIRD_CONFIG: _terceiro, EVOLUTION_SECOND_INSTANCE_NAME: _instancia,
    EVOLUTION_THIRD_INSTANCE_NAME: _terceiraInstancia, ...base } = settings;
  void _principal; void _segundo; void _terceiro; void _instancia; void _terceiraInstancia;
  return { ...base, EVOLUTION_INSTANCE_NAME: instancia };
}
