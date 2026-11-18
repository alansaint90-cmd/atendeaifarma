import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { agentRedis, agentKeys } from "../src/lib/agent/redis";
import { digest } from "../src/lib/agent/message";
import { followupQueue, followupStore } from "../src/lib/followups/queue";
import { listarFilaFollowups, modificarFilaFollowup } from "../src/lib/agendamentos/fila-followups";
import { defaultFollowup } from "../src/lib/followups/schema";
test("Redis real: central cancela acompanhamento e restauração não o recoloca na fila",{skip:!process.env.TEST_REDIS_URL},async()=>{
 const url=new URL(process.env.TEST_REDIS_URL!);assert.ok(["localhost","127.0.0.1"].includes(url.hostname)&&url.pathname==="/15");url.pathname="/14";
 const client=agentRedis(url.toString());await client.connect();const conversation=digest(randomUUID());const key="atendeia:{evolution}:followup:"+conversation;
 const revision=randomUUID();const config={...structuredClone(defaultFollowup),enabled:true,instance:"teste",revision};config.steps[0]={...config.steps[0],enabled:true,text:"Mensagem follow-up"};
 const settings={EVOLUTION_INSTANCE_NAME:"teste",FOLLOW_UP_CONFIG:JSON.stringify(config)};
 const job={conversation,instance:"teste",identity:digest(randomUUID()),number:"5511999999999",started:Date.now(),due:Date.now()+60000,index:0,revision,status:"aguardando"};
 const arquivo="atendeia:{evolution}:followups-admin-arquivo",auditoria="atendeia:{evolution}:followups-admin-auditoria";
 try{
  await client.set(key,JSON.stringify(job));await client.zadd(followupQueue,job.due,conversation);
  const item=(await listarFilaFollowups(client,settings)).find(i=>i.id===conversation)!;assert.equal(item.mensagem,"Mensagem follow-up");assert.equal(item.origemNome,"Follow-up · etapa 1");
  await client.set(agentKeys.lock,"worker-ativo","PX",30000);await assert.rejects(modificarFilaFollowup(client,item,"cancelar",item),/concluindo/);assert.ok(await client.get(key));await client.del(agentKeys.lock);
  assert.equal((await listarFilaFollowups(client,settings)).filter(i=>i.id===conversation).length,1,"Só a etapa realmente enfileirada aparece");
  await modificarFilaFollowup(client,item,"cancelar",item,"gestor-ficticio");assert.equal(await client.get(key),null);assert.equal(await client.zscore(followupQueue,conversation),null);
  assert.equal(await client.xlen(auditoria),1);assert.match(JSON.stringify(await client.xrange(auditoria,"-","+")),/gestor-ficticio/);
  let snapshot=(await listarFilaFollowups(client,settings)).find(i=>i.id.startsWith("arquivo:"))!;assert.equal(snapshot.status,"cancelado");await modificarFilaFollowup(client,snapshot,"lixeira",snapshot);
  snapshot=(await listarFilaFollowups(client,settings)).find(i=>i.id===snapshot.id)!;assert.equal(snapshot.lixeira,true);await modificarFilaFollowup(client,snapshot,"restaurar",snapshot);
  assert.equal((await listarFilaFollowups(client,settings)).find(i=>i.id===snapshot.id)?.lixeira,false);assert.equal(await client.get(key),null);
  await client.set(agentKeys.lock,"worker","PX",30000);assert.equal(await followupStore(client,"worker").due(),null);await client.del(agentKeys.lock);
  await client.set(key,JSON.stringify({...job,status:"enviando"}));await client.zadd(followupQueue,job.due,conversation);const enviando=(await listarFilaFollowups(client,settings)).find(i=>i.id===conversation)!;await assert.rejects(modificarFilaFollowup(client,enviando,"lixeira",enviando),/já está em envio/);
  assert.equal(await client.xlen(auditoria),3,"Cancelar, lixeira e restaurar auditam atomicamente");
 }finally{await client.del(key,followupQueue,arquivo,auditoria,agentKeys.lock);client.disconnect();}
});
