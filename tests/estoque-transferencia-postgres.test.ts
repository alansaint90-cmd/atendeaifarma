import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { transferirAtendimento } from "../src/lib/operacao/transferir";
import { assumirConversa, atendimentoHumanoAtivo } from "../src/lib/farmacia/atendimento";
import { consultarOperacao } from "../src/lib/operacao/consultas";

test("PostgreSQL 16: encaminhamento por estoque notifica uma vez e preserva conversa assumida",{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
  const a=postgres(url.toString(),{max:1,onnotice:()=>{}}),b=postgres(url.toString(),{max:1,onnotice:()=>{}});
  const bancoA=drizzle(a),bancoB=drizzle(b),instancia=`estoque-${randomUUID()}`,numero=`5511${randomInt(100000000,999999999)}`,autor=randomUUID();
  try {
    assert.match((await a`SHOW server_version`)[0].server_version,/^16\./);await applyMigrations(bancoA);
    await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${autor},'Atendente fictício','operador',true,${systemUserId})`;
    await receberOperacao(bancoA,{event:"messages.upsert",instance:instancia,data:{key:{id:randomUUID(),fromMe:false,remoteJid:`${numero}@s.whatsapp.net`},
      messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Consulta fictícia de estoque"}}});
    const [conversa]=await a`SELECT c.id FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE ch.instance_name=${instancia} AND c.is_deleted=false AND ch.is_deleted=false`;
    await Promise.all([transferirAtendimento(bancoA,instancia,numero,"Suporte","estoque_indisponivel"),transferirAtendimento(bancoB,instancia,numero,"Suporte","estoque_indisponivel")]);
    const [notificacao]=await a`SELECT count(*)::int total FROM atendeia_audit_logs WHERE entity_id=${conversa.id} AND action='estoque_indisponivel_equipe_notificada' AND is_deleted=false`;
    assert.equal(notificacao.total,1);
    await assumirConversa(bancoA,{userId:autor,papel:"operador"},{id:String(conversa.id),assumir:true});
    await assert.rejects(transferirAtendimento(bancoB,instancia,numero,"Suporte","estoque_indisponivel"),/já assumida/);
    const [atual]=await a`SELECT assigned_to,human_takeover,status FROM atendeia_conversations WHERE id=${conversa.id} AND is_deleted=false`;
    assert.equal(atual.assigned_to,autor);assert.equal(atual.human_takeover,true);assert.equal(atual.status,"open");
    await assumirConversa(bancoA,{userId:autor,papel:"operador"},{id:String(conversa.id),assumir:false});
    assert.equal(await atendimentoHumanoAtivo(bancoA,instancia,numero),false);
    assert.equal((await consultarOperacao(bancoA)).conversas.find(c=>c.id===String(conversa.id))?.aguardaHumano,false);
  } finally {await a.end();await b.end();}
});
