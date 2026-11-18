import { db } from "../../db/client";
import { effectiveSettings } from "../../settings/repository";
import type { IntegrationSettings } from "../../settings/schema";
import { instanciasConfiguradas } from "../../evolution/instancias";
import { configuracaoEnvio } from "../../evolution/config-envio";
import { reservarEnvio, envioPermitido, concluirEnvio } from "./repository";
import type { BancoSql } from "../../db/porta";
import { enviarCampanha } from "./provider";
export async function processarCampanhas(banco: BancoSql, configuracoes:()=>Promise<IntegrationSettings>, enviar:typeof enviarCampanha=(config,item)=>enviarCampanha(config,item,fetch,()=>envioPermitido(banco,item))) {
 const settings = await configuracoes();
 for (const instancia of instanciasConfiguradas(settings)) {
  const inicial = configuracaoEnvio(settings,instancia); if (!inicial.success) continue;
  const item = await reservarEnvio(banco,instancia); if (!item) continue;
  const atual = configuracaoEnvio(await configuracoes(),instancia);
  if (!atual.success || JSON.stringify(atual.data)!==JSON.stringify(inicial.data) || !await envioPermitido(banco,item)) { await concluirEnvio(banco,item,"bloqueado","destinatario_ou_configuracao_indisponivel",null); continue; }
  let id: string;
  try { id = await enviar(atual.data,item); } catch { await concluirEnvio(banco,item,"incerto","conferir_entrega",null); continue; }
  await concluirEnvio(banco,item,"enviado",null,id);
 }
}
export async function executarCampanhas() { if (process.env.DATABASE_URL) await processarCampanhas(db(),effectiveSettings); }
