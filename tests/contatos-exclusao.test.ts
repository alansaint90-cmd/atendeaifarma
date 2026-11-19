import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { excluirContatoOperacional } from "../src/lib/operacao/excluir-contato";
import { conversaApagadaAposMensagem } from "../src/lib/operacao/apagar-conversa";
import { contatosElegiveis } from "../src/lib/farmacia/campanhas/repository";
import { listarPedidos } from "../src/lib/farmacia/consultas";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

test("excluir contato exige gestor, versão e auditoria; preserva pedidos e não recria por replay", async t => {
 const cliente=new PGlite(),banco=drizzle(cliente),autor=randomUUID(),sessao={userId:autor,papel:"admin" as const};
 const instante=Math.floor(Date.now()/1000)-20;
 const evento=(id:string,tempo=instante):EvolutionEvent=>({event:"messages.upsert",instance:"contato-ficticio",data:{
  key:{id,fromMe:false,remoteJid:"5511999990001@s.whatsapp.net"},messageTimestamp:tempo,message:{conversation:"Mensagem fictícia"}}});
 try {
  await applyMigrations(banco);
  await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES($1,'Gestor fictício','admin',true,$2)",[autor,systemUserId]);
  await receberOperacao(banco,evento("original"));
  const resumo=await consultarOperacao(banco),contato=resumo.contatos[0],conversa=resumo.conversas[0];
  const entrada={id:contato.id,version:contato.version};
  await cliente.query("INSERT INTO atendeia_pedidos(numero,contato_id,conversa_id,origem,total,chave,modified_by) VALUES($1,$2,$3,'teste','1.00',$4,$5)",[randomUUID(),contato.id,conversa.id,randomUUID(),autor]);
  await t.test("entrada estrita, operador e gestor desativado não excluem",async()=>{
   await assert.rejects(excluirContatoOperacional(banco,sessao,{...entrada,papel:"admin"}),/Dados inválidos/);
   await cliente.query("UPDATE atendeia_users SET role='operador' WHERE id=$1",[autor]);
   await assert.rejects(excluirContatoOperacional(banco,sessao,entrada),/Sem permissão/);
   await cliente.query("UPDATE atendeia_users SET role='admin',enabled=false WHERE id=$1",[autor]);
   await assert.rejects(excluirContatoOperacional(banco,sessao,entrada),/Sem permissão/);
   await cliente.query("UPDATE atendeia_users SET enabled=true WHERE id=$1",[autor]);
  });
  await t.test("versão desatualizada não exclui edição concorrente",async()=>{
   await cliente.query("UPDATE atendeia_contacts SET version=version+1 WHERE id=$1 AND is_deleted=false",[contato.id]);
   await assert.rejects(excluirContatoOperacional(banco,sessao,entrada),/Registro alterado/);entrada.version++;
  });
  await t.test("envio humano iniciado bloqueia exclusão sem alterar contato",async()=>{
   await cliente.query("INSERT INTO atendeia_atendimento_envios(conversa_id,chave,modified_by) VALUES($1,$2,$3)",[conversa.id,randomUUID(),autor]);
   await assert.rejects(excluirContatoOperacional(banco,sessao,entrada),/mensagem em envio/);
   assert.equal((await consultarOperacao(banco)).totalContatos,1);
   await cliente.query("UPDATE atendeia_atendimento_envios SET status='incerto' WHERE conversa_id=$1 AND is_deleted=false",[conversa.id]);
  });
  await t.test("falha na auditoria desfaz contato e arquivamento de conversas",async()=>{
   await cliente.exec("CREATE FUNCTION recusar_contato() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='contato_excluido' THEN RAISE EXCEPTION 'falha fictícia'; END IF; RETURN NEW; END $$; CREATE TRIGGER recusar_contato BEFORE INSERT ON atendeia_audit_logs FOR EACH ROW EXECUTE FUNCTION recusar_contato();");
   await assert.rejects(excluirContatoOperacional(banco,sessao,entrada));
   assert.equal((await consultarOperacao(banco)).conversas.length,1);
   await cliente.exec("DROP TRIGGER recusar_contato ON atendeia_audit_logs; DROP FUNCTION recusar_contato();");
  });
  await excluirContatoOperacional(banco,sessao,entrada);
  assert.equal((await consultarOperacao(banco)).totalContatos,0);assert.equal((await consultarOperacao(banco)).conversas.length,0);
  assert.equal((await listarPedidos(banco,sessao,{})).pedidos.length,1);
  assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE conversation_id=$1 AND is_deleted=false",[conversa.id])).rows.length,1);
  assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE entity_id=$1 AND action='contato_excluido' AND modified_by=$2 AND is_deleted=false",[contato.id,autor])).rows.length,1);
  assert.equal(await conversaApagadaAposMensagem(banco,"contato-ficticio","5511999990001",instante),true);
  assert.deepEqual(await contatosElegiveis(banco,"contato-ficticio"),[]);
  await assert.rejects(excluirContatoOperacional(banco,sessao,entrada),/Registro alterado/);
  await receberOperacao(banco,evento("original"));await receberOperacao(banco,evento("antiga-sem-recibo"));
  assert.equal((await consultarOperacao(banco)).totalContatos,0,"Histórico antigo não recria contato");
  await receberOperacao(banco,evento("nova",Math.floor(Date.now()/1000)+1));
  const novo=await consultarOperacao(banco);assert.equal(novo.totalContatos,1);assert.equal(novo.conversas.length,1);
  assert.notEqual(novo.contatos[0].id,contato.id);assert.notEqual(novo.conversas[0].id,conversa.id);
  assert.equal((await contatosElegiveis(banco,"contato-ficticio"))[0].id,novo.contatos[0].id);
 }finally{await cliente.close();}
});
