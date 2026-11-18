"use server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { effectiveSettings } from "../settings/repository";
import { db } from "../db/client";
import { agentRedis } from "../agent/redis";
import { digest } from "../agent/message";
import { listarFilaSql, modificarFilaSql } from "../agendamentos/fila-repository";
import { listarFilaFollowups, modificarFilaFollowup } from "../agendamentos/fila-followups";
import { operacaoFila, type MensagemFila } from "../agendamentos/fila-schema";
import { exigirGestorCampanha } from "../farmacia/campanhas/acesso";
import { aplicarLoteFila } from "../agendamentos/fila-lote";
export async function carregarFilaMensagens(){
 return executar(async()=>{
  const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");
  const config=await effectiveSettings();const itens=await listarFilaSql(db());const avisos:string[]=[];
  if(config.REDIS_URL){const client=agentRedis(config.REDIS_URL);try{await client.connect();itens.push(...await listarFilaFollowups(client,config));}catch{avisos.push("Não foi possível consultar os follow-ups no Redis. A lista está parcial; atualize antes de alterar todos os envios.");}finally{client.disconnect();}}
  else avisos.push("Redis não configurado: os follow-ups não puderam ser consultados.");
  return {itens:itens.sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id)),avisos,ativo:process.env.ATENDEIA_WORKER_ENABLED==="true"};
 });
}
export async function alterarFilaMensagens(entrada:unknown){
 return executar(async()=>{
  const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");const dados=operacaoFila.parse(entrada);
  const config=await effectiveSettings();let client:ReturnType<typeof agentRedis>|undefined;let followups:MensagemFila[]=[];let erroRedis="";
  if(dados.alvos.some(a=>a.origem==="followup")){
   if(!config.REDIS_URL)erroRedis="Redis indisponível: o follow-up não foi alterado.";
   else {client=agentRedis(config.REDIS_URL);try{await client.connect();followups=await listarFilaFollowups(client,config);}catch{client.disconnect();erroRedis="Não foi possível validar os follow-ups. Atualize a lista.";}}
  }
  let resultado:Awaited<ReturnType<typeof aplicarLoteFila>>;
  try{resultado=await aplicarLoteFila(dados.alvos,async alvo=>{
   if(alvo.origem!=="followup")await modificarFilaSql(db(),alvo,dados.acao,sessao.userId);
   else{
    const item=followups.find(i=>i.id===alvo.id&&i.versao===alvo.versao);if(!item||!client)throw new ErroDeNegocio(erroRedis||"Follow-up alterado. Atualize a lista.");
    const hash=digest(alvo.id);const auditId=hash.slice(0,8)+"-"+hash.slice(8,12)+"-4"+hash.slice(13,16)+"-8"+hash.slice(17,20)+"-"+hash.slice(20,32);
    await db().transaction(async tx=>{await exigirGestorCampanha(tx,sessao.userId);await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${"fila_followup_"+dados.acao+"_solicitado"},'followup',${auditId},'["fila"]'::jsonb,${sessao.userId})`);});
    await modificarFilaFollowup(client,alvo,dados.acao,item,sessao.userId);
   }
  });}
  finally{client?.disconnect();}
  revalidatePath("/");return resultado;
 });
}
