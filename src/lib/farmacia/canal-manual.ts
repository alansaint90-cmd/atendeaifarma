import { sql } from "drizzle-orm";
import { settingsSchema, type IntegrationSettings } from "../settings/schema";
import { instanciasConfiguradas } from "../evolution/instancias";
import { ErroDeNegocio } from "../acao";
import { linhas, type BancoSql } from "../db/porta";
import { autorizar } from "./comum";
import type { SessaoAtiva } from "../auth/permissoes";
import { effectiveSettings } from "../settings/repository";
import { z } from "zod";

const envioSchema=settingsSchema.pick({EVOLUTION_API_URL:true,EVOLUTION_API_KEY:true,EVOLUTION_INSTANCE_NAME:true}).required();
/** Envio humano exige apenas Evolution; não depende da ativação ou das credenciais de IA. */
export function configurarCanalManual(settings:IntegrationSettings,instancia:string,telefone:string|null){
  if(!instanciasConfiguradas(settings).includes(instancia))throw new ErroDeNegocio("A instância desta conversa não está configurada. Confira o nome do chip em Configurações.");
  const r=envioSchema.safeParse({EVOLUTION_API_URL:settings.EVOLUTION_API_URL,EVOLUTION_API_KEY:settings.EVOLUTION_API_KEY,EVOLUTION_INSTANCE_NAME:instancia});
  if(!r.success)throw new ErroDeNegocio("Configure a URL e a chave da Evolution em Configurações para enviar mensagens.");
  const numero=telefone?.replace(/^\+/,"");
  if(!numero||! /^[1-9]\d{6,14}$/.test(numero))throw new ErroDeNegocio("O contato não possui telefone válido para envio. Aguarde uma mensagem com o telefone identificado.");
  return {config:r.data,numero};
}
export async function verificarCanalManual(banco:BancoSql,ator:SessaoAtiva,entrada:unknown,dependencias={settings:effectiveSettings,request:fetch}){
  const id=z.uuid().parse(entrada);
  const c=await banco.transaction(async tx=>{await autorizar(tx,ator);return linhas<{instancia:string;numero:string|null}>(await tx.execute(sql`SELECT ch.instance_name instancia,p.phone numero FROM atendeia_conversations c
    JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id
    WHERE c.id=${id} AND c.is_deleted=false AND c.status<>'closed' AND ch.is_deleted=false AND p.is_deleted=false`))[0];});
  if(!c)throw new ErroDeNegocio("Conversa indisponível.");
  const {config}=configurarCanalManual(await dependencias.settings(),c.instancia,c.numero);
  let resposta:Response;
  try{resposta=await dependencias.request(`${config.EVOLUTION_API_URL.replace(/\/$/,"")}/instance/connectionState/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`,{headers:{apikey:config.EVOLUTION_API_KEY},redirect:"error",signal:AbortSignal.timeout(10000),cache:"no-store"});}
  catch{throw new ErroDeNegocio("Não foi possível alcançar a Evolution. Confira a URL e a disponibilidade do serviço.");}
  if(!resposta.ok)throw new ErroDeNegocio(resposta.status===401||resposta.status===403?"A Evolution recusou a chave de API. Confira as configurações.":"A Evolution não confirmou esta instância. Confira o chip e o serviço.");
  const r=z.object({instance:z.object({state:z.string()})}).safeParse(await resposta.json().catch(()=>null));
  if(!r.success||r.data.instance.state!=="open")throw new ErroDeNegocio("WhatsApp desconectado. Reconecte o chip na Evolution antes de enviar.");
  return "Canal conectado à Evolution. Assuma a conversa para enviar.";
}
