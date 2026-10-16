import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas,type BancoSql } from "../db/porta";
import { autorizar,auditar } from "./comum";
import type { SessaoAtiva } from "../auth/permissoes";
import { ErroDeNegocio } from "../acao";
import { effectiveSettings } from "../settings/repository";
import { sendReply } from "../agent/providers";
import { settingsDaInstancia } from "../evolution/instancias";
import { agentBaseConfigSchema } from "../agent/config";

export async function atendimentoHumanoAtivo(banco:BancoSql,instancia:string,numero:string) {
  return linhas(await banco.execute(sql`SELECT c.id FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
    WHERE ch.instance_name=${instancia} AND c.remote_jid=${`${numero}@s.whatsapp.net`} AND c.human_takeover=true AND c.is_deleted=false AND ch.is_deleted=false AND c.status<>'closed'`)).length>0;
}
export async function assumirConversa(banco:BancoSql,ator:SessaoAtiva,entrada:unknown) {
  const v=z.strictObject({id:z.uuid(),assumir:z.boolean()}).parse(entrada);
  return banco.transaction(async tx=>{
    const autor=await autorizar(tx,ator);
    const rows=linhas(await tx.execute(sql`UPDATE atendeia_conversations SET human_takeover=${v.assumir},assigned_to=${v.assumir?autor:null},status='open',
      updated_at=clock_timestamp(),version=version+1,modified_by=${autor} WHERE id=${v.id} AND is_deleted=false AND status<>'closed' RETURNING id`));
    if(!rows.length)throw new ErroDeNegocio("Conversa indisponível.");await auditar(tx,autor,v.id,v.assumir?"conversa_assumida":"conversa_devolvida_ia");
  });
}
export async function enviarManual(banco:BancoSql,ator:SessaoAtiva,entrada:unknown,dependencias={settings:effectiveSettings,send:sendReply}) {
  const v=z.strictObject({id:z.uuid(),texto:z.string().trim().min(1).max(4000),chave:z.uuid()}).parse(entrada);
  const settings=await dependencias.settings();
  const envio=await banco.transaction(async tx=>{
    const autor=await autorizar(tx,ator);
    const [c]=linhas<{id:string;instancia:string;numero:string;assigned_to:string|null;human_takeover:boolean}>(await tx.execute(sql`SELECT c.id,ch.instance_name instancia,p.phone numero,c.assigned_to,c.human_takeover
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id
      WHERE c.id=${v.id} AND c.is_deleted=false AND c.status<>'closed' AND ch.is_deleted=false AND p.is_deleted=false FOR UPDATE OF c`));
    if(!c||!c.human_takeover||c.assigned_to!==autor)throw new ErroDeNegocio("Assuma a conversa antes de enviar.");
    const config=agentBaseConfigSchema.omit({AI_ENABLED:true,OPENAI_API_KEY:true,OPENAI_MODEL:true,REDIS_URL:true}).safeParse(settingsDaInstancia(settings,c.instancia));
    if(!config.success||!c.numero)throw new ErroDeNegocio("Canal não configurado para envio.");
    const [anterior]=linhas<{status:string}>(await tx.execute(sql`SELECT status FROM atendeia_atendimento_envios WHERE chave=${v.chave} AND is_deleted=false`));
    if(anterior)throw new ErroDeNegocio(anterior.status==="enviado"?"Esta mensagem já foi enviada. Atualize o histórico.":"Entrega pendente ou incerta. Confira o WhatsApp antes de reenviar.");
    const [novo]=linhas<{id:string}>(await tx.execute(sql`INSERT INTO atendeia_atendimento_envios(conversa_id,chave,modified_by) VALUES (${c.id},${v.chave},${autor}) RETURNING id`));
    await auditar(tx,autor,novo.id,"mensagem_manual_reservada");return {id:novo.id,config:config.data,numero:c.numero.replace(/^\+/,""),autor};
  });
  let provedorId:string;
  try{provedorId=await dependencias.send(envio.config,envio.numero,v.texto);}
  catch{
    await banco.transaction(async tx=>{await tx.execute(sql`UPDATE atendeia_atendimento_envios SET status='incerto',updated_at=clock_timestamp(),modified_by=${envio.autor} WHERE id=${envio.id} AND is_deleted=false`);await auditar(tx,envio.autor,envio.id,"mensagem_manual_incerta");});
    throw new ErroDeNegocio("Entrega incerta. Confira o WhatsApp antes de reenviar.");
  }
  await banco.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO atendeia_messages(conversation_id,provider_message_id,direction,sender_type,content,message_type,delivery_status,modified_by)
      VALUES (${v.id},${provedorId},'outbound','agent',${v.texto},'text','sent',${envio.autor})
      ON CONFLICT (conversation_id,provider_message_id) DO UPDATE SET sender_type='agent',modified_by=${envio.autor},updated_at=clock_timestamp(),version=atendeia_messages.version+1 WHERE atendeia_messages.is_deleted=false`);
    await tx.execute(sql`UPDATE atendeia_atendimento_envios SET status='enviado',provedor_id=${provedorId},updated_at=clock_timestamp(),modified_by=${envio.autor} WHERE id=${envio.id} AND is_deleted=false`);
    await tx.execute(sql`UPDATE atendeia_conversations SET last_message_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1,modified_by=${envio.autor} WHERE id=${v.id} AND is_deleted=false`);
    await auditar(tx,envio.autor,envio.id,"mensagem_manual_enviada");
  });
}
