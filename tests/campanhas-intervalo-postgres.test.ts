import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { contatosElegiveis, criarCampanha, alterarCampanha, reservarEnvio, listarCampanhas, concluirEnvio } from "../src/lib/farmacia/campanhas/repository";
import { listarFilaSql, modificarFilaSql } from "../src/lib/agendamentos/fila-repository";
import { campanhaSchema } from "../src/lib/farmacia/campanhas/schema";

test("intervalo valida limites e mantém compatibilidade com cadastros anteriores", () => {
 const dados={id:randomUUID(),nome:"Teste",instancia:"Teste",mensagem:"Mensagem fictícia",arquivo:null,contatos:[randomUUID()]};
 assert.equal(campanhaSchema.parse(dados).intervaloSegundos,10);
 for(const valor of [5,10,30,3600])assert.equal(campanhaSchema.parse({...dados,intervaloSegundos:valor}).intervaloSegundos,valor);
 for(const valor of [0,4,5.5,3601,"5",null])assert.equal(campanhaSchema.safeParse({...dados,intervaloSegundos:valor}).success,false);
});

test("PostgreSQL 16: intervalo persiste, prevê horários e bloqueia concorrência entre campanhas do mesmo chip",{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
 const a=postgres(url.toString(),{max:1,onnotice:()=>{}}),b=postgres(url.toString(),{max:1,onnotice:()=>{}}),dbA=drizzle(a),dbB=drizzle(b);
 const chip="intervalo-"+randomUUID(),outroChip=chip+"-outro",autor=randomUUID();
 try{
  assert.match((await a`SHOW server_version`)[0].server_version,/^16\./);await applyMigrations(dbA);
  await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${autor},'Gestor fictício','admin',true,${systemUserId})`;
  for(const instancia of [chip,chip,outroChip])await receberOperacao(dbA,{event:"messages.upsert",instance:instancia,data:{
   key:{id:randomUUID(),fromMe:false,remoteJid:`5511${randomInt(100000000,999999999)}@s.whatsapp.net`},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Teste sem envio externo"}}});
  const contatos=await contatosElegiveis(dbA,chip),outros=await contatosElegiveis(dbA,outroChip);
  const criar=async(instancia:string,ids:string[],intervaloSegundos:number)=>{
   const id=randomUUID();await criarCampanha(dbA,{id,nome:"Intervalo fictício",instancia,contatos:ids,intervaloSegundos,mensagem:"Teste",arquivo:null},autor);
   await alterarCampanha(dbA,{id,version:0},"iniciar",autor);return id;
  };
  const primeira=await criar(chip,contatos.map(c=>c.id),30);
  assert.equal((await listarCampanhas(dbA)).find(c=>c.id===primeira)?.intervaloSegundos,30);
  const fila=(await listarFilaSql(dbA)).filter(i=>i.origem==="campanha"&&i.instancia===chip).sort((x,y)=>Date.parse(x.data)-Date.parse(y.data));
  assert.equal(Date.parse(fila[1].data)-Date.parse(fila[0].data),30000);
  await assert.rejects(a`UPDATE atendeia_campanhas SET intervalo_segundos=4 WHERE id=${primeira}`);
  const reservas=await Promise.all([reservarEnvio(dbA,chip),reservarEnvio(dbB,chip)]);
  assert.equal(reservas.filter(Boolean).length,1);const envio=reservas.find(Boolean)!;
  await a`UPDATE atendeia_campanhas SET proximo_envio=now()+interval '1 hour' WHERE id=${primeira} AND is_deleted=false`;
  const segunda=await criar(chip,[contatos[0].id],5);
  await a`UPDATE atendeia_campanhas_destinatarios SET iniciado_em=now()-interval '10 seconds' WHERE id=${envio.id} AND is_deleted=false`;
  assert.equal(await reservarEnvio(dbB,chip),null,"Intervalo de 30 s não é contornado por outra campanha de 5 s");
  await concluirEnvio(dbA,envio,"enviado",null,"confirmacao-ficticia");
  const registro=(await listarFilaSql(dbA)).find(i=>i.id===envio.id)!;await modificarFilaSql(dbA,registro,"lixeira",autor);
  assert.equal(await reservarEnvio(dbB,chip),null,"Mover envio para a lixeira não contorna o intervalo");
  await criar(outroChip,[outros[0].id],5);assert.ok(await reservarEnvio(dbB,outroChip),"Outro chip não é bloqueado");
  await a`UPDATE atendeia_campanhas_destinatarios SET iniciado_em=now()-interval '31 seconds' WHERE id=${envio.id} AND is_deleted=true`;
  const seguinte=await reservarEnvio(dbB,chip);assert.equal(seguinte?.campanhaId,segunda);
  const [tempo]=await a`SELECT extract(epoch FROM proximo_envio-(SELECT iniciado_em FROM atendeia_campanhas_destinatarios WHERE id=${seguinte!.id}))::int segundos FROM atendeia_campanhas WHERE id=${segunda} AND is_deleted=false`;
  assert.equal(tempo.segundos,5);
 }finally{await a.end();await b.end();}
});
