import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { excluirContatoOperacional } from "../src/lib/operacao/excluir-contato";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

test("PostgreSQL 16: exclusão concorrente audita uma vez e recebimento não deixa conversa órfã",{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
 const a=postgres(url.toString(),{max:1,onnotice:()=>{}}),b=postgres(url.toString(),{max:1,onnotice:()=>{}}),dbA=drizzle(a),dbB=drizzle(b);
 const autor=randomUUID(),chip="excluir-contato-"+randomUUID(),telefone=`+5511${randomInt(100000000,999999999)}`,sessao={userId:autor,papel:"admin" as const};
 const evento=(tempo:number):EvolutionEvent=>({event:"messages.upsert",instance:chip,data:{key:{id:randomUUID(),fromMe:false,remoteJid:telefone.slice(1)+"@s.whatsapp.net"},messageTimestamp:tempo,message:{conversation:"Mensagem fictícia"}}});
 try{
  assert.match((await a`SHOW server_version`)[0].server_version,/^16\./);await applyMigrations(dbA);
  await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${autor},'Gestor fictício','admin',true,${systemUserId})`;
  await receberOperacao(dbA,evento(Math.floor(Date.now()/1000)-20));
  const [primeiro]=await a`SELECT id,version FROM atendeia_contacts WHERE phone=${telefone} AND is_deleted=false`;
  const entrada={id:String(primeiro.id),version:Number(primeiro.version)};
  const resultados=await Promise.allSettled([excluirContatoOperacional(dbA,sessao,entrada),excluirContatoOperacional(dbB,sessao,entrada)]);
  assert.equal(resultados.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await a`SELECT id FROM atendeia_audit_logs WHERE entity_id=${entrada.id} AND action='contato_excluido' AND is_deleted=false`).length,1);
  await receberOperacao(dbA,evento(Math.floor(Date.now()/1000)+1));
  const [segundo]=await a`SELECT id,version FROM atendeia_contacts WHERE phone=${telefone} AND is_deleted=false`;
  await Promise.all([excluirContatoOperacional(dbA,sessao,{id:String(segundo.id),version:Number(segundo.version)}),receberOperacao(dbB,evento(Math.floor(Date.now()/1000)+2))]);
  const contatos=await a`SELECT id FROM atendeia_contacts WHERE phone=${telefone} AND is_deleted=false`;
  const conversas=await a`SELECT c.id FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id WHERE p.phone=${telefone} AND p.is_deleted=false AND c.is_deleted=false`;
  assert.ok(contatos.length<=1);assert.equal(contatos.length,conversas.length);
  assert.equal((await a`SELECT c.id FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id WHERE p.phone=${telefone} AND p.is_deleted=true AND c.is_deleted=false`).length,0);
  assert.equal((await a`SELECT id FROM atendeia_contacts WHERE id=${segundo.id} AND is_deleted=true`).length,1);
 }finally{await a.end();await b.end();}
});
