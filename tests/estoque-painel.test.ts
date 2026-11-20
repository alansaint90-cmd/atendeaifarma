import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {applyMigrations} from "../src/lib/db/migrate";
import {systemUserId} from "../src/lib/db/bootstrap";
import {consultarMovimentacao} from "../src/lib/farmacia/estoque-painel";
import {salvarProduto,entradaEstoque,ajustarEstoque,historicoProduto} from "../src/lib/farmacia/catalogo";
import {produtoVazio} from "../src/lib/farmacia/cadastro";
test("gráfico de estoque usa movimentos auditados em Brasília e não inventa saldos históricos",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),ator={userId:randomUUID(),papel:"admin" as const};
 try{
  await applyMigrations(banco);await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Teste estoque','admin',true,$2)",[ator.userId,systemUserId]);
  const vazio=await consultarMovimentacao(banco,ator,{dias:7});assert.equal(vazio.movimentos.length,7);assert.ok(vazio.movimentos.every(m=>m.variacao===0));
  const id=await salvarProduto(banco,ator,{id:null,atualizadoEm:null,produto:{...produtoVazio,nome:"Produto teste",sku:randomUUID(),preco:"8.90",apresentacao:"caixa"}});
  const loteId=await entradaEstoque(banco,ator,{produtoId:id,codigo:"PAINEL",validade:"2099-12-31",quantidade:13,bloqueado:false,chave:randomUUID()});
  const lote=(await historicoProduto(banco,ator,id)).lotes[0];await ajustarEstoque(banco,ator,{loteId,quantidade:8,motivo:"Conferência de teste",atualizadoEm:lote.atualizadoEm,chave:randomUUID()});
  const atual=await consultarMovimentacao(banco,ator,{dias:7});assert.deepEqual(atual.movimentos.at(-1),{dia:atual.movimentos.at(-1)!.dia,entradas:13,saidas:5,variacao:8});assert.deepEqual(atual.categorias,["Medicamentos"]);
  const hoje=atual.movimentos.at(-1)!.dia;
  await cliente.query("UPDATE atendeia_produtos_movimentos SET created_at=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') - interval '1 millisecond' WHERE tipo='entrada' AND lote_id=$2",[hoje,loteId]);
  const fronteira=await consultarMovimentacao(banco,ator,{dias:7});assert.equal(fronteira.movimentos.at(-2)!.entradas,13);assert.equal(fronteira.movimentos.at(-1)!.variacao,-5);
  assert.equal((await consultarMovimentacao(banco,ator,{dias:30})).movimentos.length,30);
  await assert.rejects(consultarMovimentacao(banco,ator,{dias:366}));await assert.rejects(consultarMovimentacao(banco,{sistema:true},{dias:7}),/atendente autorizado/);
  await cliente.query("UPDATE atendeia_users SET enabled=false WHERE id=$1",[ator.userId]);await assert.rejects(consultarMovimentacao(banco,ator,{dias:7}),/permissão/);
 }finally{await cliente.close();}
});
