import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID,randomInt } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { criarCampanha,contatosElegiveis,alterarCampanha,reservarEnvio,concluirEnvio,envioPermitido } from "../src/lib/farmacia/campanhas/repository";
import { listarFilaSql,modificarFilaSql } from "../src/lib/agendamentos/fila-repository";

test("PostgreSQL 16: dois processadores não duplicam destinatário e a central não interrompe reserva iniciada",{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
 const a=postgres(url.toString(),{max:1,onnotice:()=>{}}),b=postgres(url.toString(),{max:1,onnotice:()=>{}}),dbA=drizzle(a),dbB=drizzle(b);
 const instancia="teste-"+randomUUID(),autor=randomUUID();
 try{
  assert.match((await a`SHOW server_version`)[0].server_version,/^16\./);await applyMigrations(dbA);
  await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${autor},'Gestor fictício','admin',true,${systemUserId})`;
  for(let i=0;i<2;i++)await receberOperacao(dbA,{event:"messages.upsert",instance:instancia,data:{key:{id:randomUUID(),fromMe:false,remoteJid:`5511${randomInt(100000000,999999999)}@s.whatsapp.net`},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Teste fictício"}}});
  const contatos=await contatosElegiveis(dbA,instancia),id=randomUUID();assert.equal(contatos.length,2);
  await criarCampanha(dbA,{id,nome:"Concorrência fictícia",instancia,mensagem:"Não enviar a provedores reais",arquivo:null,contatos:contatos.map(c=>c.id)},autor);
  assert.equal((await listarFilaSql(dbA)).filter(i=>i.origem==="campanha"&&i.instancia===instancia).length,0);
  await alterarCampanha(dbA,{id,version:0},"iniciar",autor);
  const iniciada=(await listarFilaSql(dbA)).filter(i=>i.origem==="campanha"&&i.instancia===instancia);
  assert.equal(iniciada.length,2);
  assert.ok(iniciada.every(i=>i.origemNome==="Concorrência fictícia"&&i.status==="pendente"&&i.previsao));
  const reservas=await Promise.all([reservarEnvio(dbA,instancia),reservarEnvio(dbB,instancia)]),job=reservas.find(Boolean)!;
  assert.equal(reservas.filter(Boolean).length,1);assert.ok(job);
  const fila=(await listarFilaSql(dbA)).filter(i=>i.origem==="campanha"&&i.instancia===instancia);
  const emEnvio=fila.find(i=>i.id===job.id)!,pendente=fila.find(i=>i.id!==job.id)!;
  await assert.rejects(modificarFilaSql(dbB,emEnvio,"lixeira",autor),/já começou/);
  await modificarFilaSql(dbB,pendente,"cancelar",autor);
  assert.equal((await listarFilaSql(dbA)).find(i=>i.id===job.id)?.status,"enviando");
  await alterarCampanha(dbB,{id,version:1},"cancelar",autor);assert.equal(await envioPermitido(dbA,job),true);
  await concluirEnvio(dbA,job,"enviado",null,"confirmacao-ficticia");await assert.rejects(concluirEnvio(dbB,job,"enviado",null,"duplicada"));
  const atual=(await listarFilaSql(dbA)).find(i=>i.id===pendente.id)!;await modificarFilaSql(dbA,atual,"lixeira",autor);
  const lixeira=(await listarFilaSql(dbA)).find(i=>i.id===pendente.id)!;await modificarFilaSql(dbA,lixeira,"restaurar",autor);
  assert.equal(await reservarEnvio(dbA,instancia),null);
  await a`UPDATE atendeia_users SET enabled=false WHERE id=${autor}`;
  await assert.rejects(criarCampanha(dbA,{id:randomUUID(),nome:"Negada",instancia,mensagem:"Teste",arquivo:null,contatos:[contatos[0].id]},autor),/Sem permissão/);
 }finally{await a.end();await b.end();}
});
