"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { readSettings, saveSettings, environmentSettings, SettingsConflict } from "../settings/repository";
import { followupSchema } from "../followups/schema";
import { campoFollowup, followupDaInstancia, instanciasConfiguradas } from "../evolution/instancias";

export async function carregarFollowups(instancia?: string) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    const current = await readSettings();
    const settings = { ...environmentSettings(), ...current.values };
    const validada = z.string().max(100).regex(/^[\p{L}\p{N}_. -]*$/u).optional().safeParse(instancia);
    if (!validada.success) throw new ErroDeNegocio("Chip inválido.");
    const instance = validada.data ?? settings.EVOLUTION_INSTANCE_NAME ?? "";
    const instances = instanciasConfiguradas(settings);
    if (instance && !instances.includes(instance)) throw new ErroDeNegocio("Selecione um chip configurado no servidor.");
    return { config: followupDaInstancia(settings, instance), version: current.version, instance, instances };
  });
}
export async function salvarFollowups(input: unknown, version: number) {
  return executar(async () => {
    const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin");
    const config = followupSchema.safeParse(input);
    if (!config.success) throw new ErroDeNegocio(config.error.issues[0].message);
    if (!z.number().int().min(0).safeParse(version).success) throw new ErroDeNegocio("Versão inválida. Recarregue os dados.");
    const current = await readSettings();
    const settings = { ...environmentSettings(), ...current.values };
    const instance = config.data.instance;
    const campo = campoFollowup(settings, instance);
    if (!campo) throw new ErroDeNegocio("Selecione a instância Evolution configurada no servidor.");
    try {
      config.data.revision = randomUUID();
      const saved = await saveSettings({ [campo]: JSON.stringify(config.data) }, version, sessao.userId);
      return { config: config.data, version: saved.version, instance: instance ?? "" };
    } catch (error) {
      if (error instanceof SettingsConflict) throw new ErroDeNegocio("Outra sessão alterou os dados. Recarregue antes de salvar.");
      throw error;
    }
  });
}
