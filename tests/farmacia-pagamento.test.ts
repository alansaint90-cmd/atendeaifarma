import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import type { BancoSql } from "../src/lib/db/porta";
import { linhas } from "../src/lib/db/porta";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { produtoVazio } from "../src/lib/farmacia/cadastro";
import { salvarProduto, consultarProdutos } from "../src/lib/farmacia/catalogo";
import { criarPedido, executarPedido } from "../src/lib/farmacia/pedidos";
import { registrarEtapaPedido, respostaPagamento } from "../src/lib/farmacia/pagamento";
import { listarPedidos } from "../src/lib/farmacia/consultas";

async function verificar(banco:BancoSql) {
  await applyMigrations(banco);
  const admin={userId:randomUUID(),papel:"admin" as const},contato=randomUUID(),canal=randomUUID(),conversa=randomUUID();
  await banco.execute(sql`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES (${admin.userId},'Teste pagamento','admin',true,${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_contacts(id,name,modified_by) VALUES (${contato},'Cliente teste',${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_channels(id,name,instance_name,modified_by) VALUES (${canal},'Teste',${canal},${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_conversations(id,contact_id,channel_id,remote_jid,modified_by) VALUES (${conversa},${contato},${canal},'teste@s.whatsapp.net',${systemUserId})`);
  const produtoId=await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...produtoVazio,nome:'Produto de teste',sku:randomUUID(),apresentacao:'caixa',preco:'11.90'},estoqueInicial:{codigo:'TESTE',quantidade:10,validade:'2099-12-31',chave:randomUUID()}});
  const entrada={contatoId:contato,conversaId:conversa,chave:randomUUID(),itens:[{produtoId,quantidade:1}]};
  const id=await criarPedido(banco,{sistema:true},entrada);
  const registro=(etapa:string,pagamento?:object,chave=randomUUID())=>registrarEtapaPedido(banco,{id,conversaId:conversa,chave,etapa,...(pagamento?{pagamento}: {})});
  await assert.rejects(registro('pagamento',{forma:'pix'}),/Confirme primeiro/);
  await executarPedido(banco,{sistema:true},{id,acao:'reservar',chave:randomUUID()});
  await assert.rejects(registro('pagamento',{forma:'pix'}),/Conclua/);
  await assert.rejects(registrarEtapaPedido(banco,{id,conversaId:randomUUID(),chave:randomUUID(),etapa:'finalizar'}),/Confirme/);
  await registro('adicionar');
  const adicional={...entrada,chave:randomUUID()};
  assert.deepEqual(await Promise.all([criarPedido(banco,{sistema:true},adicional,id),criarPedido(banco,{sistema:true},adicional,id)]),[id,id]);
  await assert.rejects(criarPedido(banco,{sistema:true},{...adicional,itens:[{produtoId,quantidade:2}]},id),/outros itens/);
  let p=(await listarPedidos(banco,admin,{id})).pedidos[0];
  assert.equal(p.itens[0].quantidade,2);assert.equal(p.total,'23.80');assert.equal(p.status,'aguardando_confirmacao');
  const [oportunidade]=linhas<{valor:string}>(await banco.execute(sql`SELECT valor::text FROM atendeia_funis_oportunidades WHERE id=(SELECT oportunidade_id FROM atendeia_pedidos WHERE id=${id} AND is_deleted=false) AND is_deleted=false`));
  assert.equal(oportunidade.valor,p.total,'O valor do CRM acompanha os acréscimos ao mesmo pedido.');
  assert.equal((await consultarProdutos(banco,admin,{termo:'Produto de teste'})).produtos.find(p=>p.id===produtoId)?.disponivel,10);
  await executarPedido(banco,{sistema:true},{id,acao:'reservar',chave:randomUUID()});
  await registro('finalizar');
  const chave=randomUUID();await Promise.all([registro('pagamento',{forma:'pix'},chave),registro('pagamento',{forma:'pix'},chave)]);
  await assert.rejects(registro('pagamento',{forma:'cartao'},chave),/outros dados/);
  await assert.rejects(registro('pagamento',{forma:'dinheiro',troco:'sim',valor:'10.00'}),/cobrir o total/);
  await assert.rejects(registro('pagamento',{forma:'cartao',troco:'sim',valor:'50.00'}),/Troco só/);
  await registro('pagamento',{forma:'dinheiro',troco:'nao'});
  await registro('pagamento',{forma:'dinheiro',troco:'sim',valor:'50.00'});
  p=(await listarPedidos(banco,admin,{id})).pedidos[0];
  assert.equal(p.status,'aguardando_pagamento');assert.ok(p.eventos.some(e=>e.detalhe.includes('troco para R$ 50,00')));
  assert.equal(p.eventos.filter(e=>e.tipo==='pagamento').length,3);
  const [saldo]=linhas<{quantidade:number}>(await banco.execute(sql`SELECT quantidade FROM atendeia_produtos_lotes WHERE produto_id=${produtoId} AND is_deleted=false`));
  assert.equal(saldo.quantidade,10);
  await assert.rejects(criarPedido(banco,{sistema:true},{...entrada,contatoId:randomUUID(),chave:randomUUID()},id),/indisponível/);
  await assert.rejects(criarPedido(banco,{sistema:true},{...entrada,chave:randomUUID(),itens:[{produtoId,quantidade:100}]},id),/Quantidade indisponível/);
  assert.equal((await listarPedidos(banco,admin,{id})).pedidos[0].itens[0].quantidade,2);
  assert.equal((await consultarProdutos(banco,admin,{termo:'Produto de teste'})).produtos.find(p=>p.id===produtoId)?.reservado,2,'Falha de acréscimo preserva reserva anterior.');
  await banco.execute(sql`UPDATE atendeia_pedidos_reservas SET expira_em=now()-interval '1 minute' WHERE pedido_id=${id} AND is_deleted=false`);
  await assert.rejects(registro('pagamento',{forma:'pix'}),/reconfirmar a disponibilidade/);
}

test('pedido persiste preferências e troco sem confirmar pagamento ou duplicar acréscimos',async()=>{
  const cliente=new PGlite();try{await verificar(drizzle(cliente));}finally{await cliente.close();}
});
test('PostgreSQL 16 real mantém pedido e histórico de pagamento idempotentes',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/atendefarma_test');
  const cliente=postgres(url.toString(),{max:2,onnotice:()=>{}});
  try{assert.match((await cliente`SHOW server_version`)[0].server_version,/^16\./);await verificar(drizzlePostgres(cliente));}finally{await cliente.end();}
});
test('Pix só informa chave configurada e dinheiro diferencia necessidade de troco',()=>{
  const anterior=process.env.FARMACIA_PIX_CHAVE;
  try {
    delete process.env.FARMACIA_PIX_CHAVE;
    assert.match(respostaPagamento({forma:'pix',troco:'pendente',valor:'0.00'}),/equipe.*informar a chave/);
    process.env.FARMACIA_PIX_CHAVE=`${randomUUID()}@example.invalid`;
    assert.ok(respostaPagamento({forma:'pix',troco:'pendente',valor:'0.00'}).includes(process.env.FARMACIA_PIX_CHAVE));
    assert.match(respostaPagamento({forma:'dinheiro',troco:'nao',valor:'0.00'}),/sem troco/);
    assert.match(respostaPagamento({forma:'dinheiro',troco:'sim',valor:'0.00'}),/qual valor/);
  }finally{if(anterior===undefined)delete process.env.FARMACIA_PIX_CHAVE;else process.env.FARMACIA_PIX_CHAVE=anterior;}
});
