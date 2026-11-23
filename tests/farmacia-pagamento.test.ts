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
import { estadoPagamento, registrarEtapaPedido, respostaPagamento } from "../src/lib/farmacia/pagamento";
import { listarPedidos } from "../src/lib/farmacia/consultas";
import { receberOperacao } from "../src/lib/operacao/receber";

async function verificar(banco:BancoSql) {
  await applyMigrations(banco);
  const admin={userId:randomUUID(),papel:"admin" as const},contato=randomUUID(),canal=randomUUID(),conversa=randomUUID();
  const sku=randomUUID();
  const telefone=`+5571${BigInt(`0x${contato.slice(0,8)}`)%900000000n+100000000n}`;
  const jid=`${telefone.slice(1)}@s.whatsapp.net`;
  await banco.execute(sql`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES (${admin.userId},'Teste pagamento','admin',true,${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_contacts(id,name,phone,modified_by) VALUES (${contato},'Cliente teste',${telefone},${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_channels(id,name,instance_name,modified_by) VALUES (${canal},'Teste',${canal},${systemUserId})`);
  await banco.execute(sql`INSERT INTO atendeia_conversations(id,contact_id,channel_id,remote_jid,modified_by) VALUES (${conversa},${contato},${canal},${jid},${systemUserId})`);
  const produtoId=await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...produtoVazio,nome:'Produto de teste',sku,apresentacao:'caixa',preco:'11.90'},estoqueInicial:{codigo:'TESTE',quantidade:10,validade:'2099-12-31',chave:randomUUID()}});
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
  assert.equal((await consultarProdutos(banco,admin,{termo:sku})).produtos[0]?.disponivel,10);
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
  assert.equal((await consultarProdutos(banco,admin,{termo:sku})).produtos[0]?.reservado,2,'Falha de acréscimo preserva reserva anterior.');
  await banco.execute(sql`UPDATE atendeia_pedidos_reservas SET expira_em=now()-interval '1 minute' WHERE pedido_id=${id} AND is_deleted=false`);
  await assert.rejects(registro('pagamento',{forma:'pix'}),/reconfirmar a disponibilidade/);

  const carregar=async(pedidoId=id)=>(await listarPedidos(banco,admin,{id:pedidoId})).pedidos[0];
  const comando=async(acao:string,pedidoId=id)=>({id:pedidoId,acao,chave:randomUUID(),referencia:'Conferência de teste 12345',atualizadoEm:(await carregar(pedidoId)).atualizadoEm});
  await executarPedido(banco,admin,{id,acao:'reservar',chave:randomUUID()});
  await registro('pagamento',{forma:'pix'});
  assert.deepEqual((await carregar()).pagamento,{forma:'pix',estado:'pendente'});
  await assert.rejects(executarPedido(banco,admin,await comando('entregar')),/Aguarde o comprovante Pix/);
  await assert.rejects(executarPedido(banco,admin,await comando('confirmar')),/fluxo de pagamento e entrega/);
  const versaoSemComprovante=await comando('entregar');
  const anexo=(messageTimestamp=Math.floor(Date.now()/1000),fromMe=false)=>({event:'messages.upsert' as const,instance:canal,data:{
    key:{id:randomUUID(),remoteJid:jid,fromMe},messageTimestamp,message:{documentMessage:{}}}});
  await receberOperacao(banco,anexo(Math.floor(Date.now()/1000)-60));
  await receberOperacao(banco,anexo(Math.floor(Date.now()/1000),true));
  assert.equal((await carregar()).pagamento.estado,'pendente');
  const comprovante=anexo();
  await Promise.all([receberOperacao(banco,comprovante),receberOperacao(banco,comprovante)]);
  const recebido=await carregar();
  assert.deepEqual(recebido.pagamento,{forma:'pix',estado:'pago'});
  assert.equal(recebido.status,'aguardando_pagamento');
  assert.equal(recebido.eventos.filter(e=>e.tipo==='comprovante_pix').length,1);
  assert.equal(recebido.eventos.filter(e=>e.tipo==='pix_conferido').length,0);
  await assert.rejects(executarPedido(banco,admin,versaoSemComprovante),/pedido foi atualizado/);
  await assert.rejects(registro('pagamento',{forma:'cartao'}),/já está registrado como pago/i);
  await assert.rejects(criarPedido(banco,{sistema:true},{...entrada,chave:randomUUID()},id),/já está registrado como pago/i);
  const saldoAtual=async()=>(await consultarProdutos(banco,admin,{termo:sku})).produtos[0].fisico;
  assert.equal(await saldoAtual(),10);
  await banco.execute(sql`UPDATE atendeia_pedidos_reservas SET expira_em=now()-interval '1 minute' WHERE pedido_id=${id} AND is_deleted=false`);
  const entregar={...await comando('entregar'),referencia:''};
  await assert.rejects(executarPedido(banco,{sistema:true},entregar),/atendente autorizado/);
  assert.deepEqual(await Promise.all([executarPedido(banco,admin,entregar),executarPedido(banco,admin,entregar)]),[id,id]);
  assert.equal((await carregar()).status,'concluido');assert.equal(await saldoAtual(),8);

  for(const forma of ['cartao','dinheiro']) {
    const novo=await criarPedido(banco,{sistema:true},{...entrada,chave:randomUUID()});
    await executarPedido(banco,{sistema:true},{id:novo,acao:'reservar',chave:randomUUID()});
    const fase={id:novo,conversaId:conversa};
    await registrarEtapaPedido(banco,{...fase,chave:randomUUID(),etapa:'finalizar'});
    await registrarEtapaPedido(banco,{...fase,chave:randomUUID(),etapa:'pagamento',pagamento:{forma}});
    assert.deepEqual((await carregar(novo)).pagamento,{forma,estado:'na_entrega'});
    const antes=await saldoAtual();
    const entrega=await comando('entregar',novo);
    await assert.rejects(executarPedido(banco,admin,{...entrega,referencia:''}),/pagamento recebido na entrega/);
    await executarPedido(banco,admin,entrega);
    const entregue=await carregar(novo);
    assert.equal(entregue.status,'concluido');assert.deepEqual(entregue.pagamento,{forma,estado:'pago'});
    assert.equal(await saldoAtual(),antes-1);
  }
}

test('comprovante marca Pix pago sem confirmação manual e só a entrega baixa estoque',async()=>{
  const cliente=new PGlite();try{await verificar(drizzle(cliente));}finally{await cliente.close();}
});
test('comprovantes anteriores continuam válidos somente para a forma e etapa registradas',()=>{
  const pix={tipo:'pagamento',detalhe:'{"forma":"pix"}'};
  const comprovante={tipo:'comprovante_pix',detalhe:'Anexo recebido via WhatsApp. Confira o comprovante e o pagamento.'};
  const cartao={tipo:'pagamento',detalhe:'{"forma":"cartao"}'};
  assert.deepEqual(estadoPagamento('aguardando_pagamento',false,[pix,comprovante]),{forma:'pix',estado:'pago'});
  assert.deepEqual(estadoPagamento('aguardando_pagamento',false,[pix,comprovante,cartao]),{forma:'cartao',estado:'na_entrega'});
  assert.deepEqual(estadoPagamento('aguardando_pagamento',false,[pix,comprovante,cartao,pix]),{forma:'pix',estado:'pendente'});
});
test('PostgreSQL 16 real mantém pedido e histórico de pagamento idempotentes',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/atendefarma_test');
  const cliente=postgres(url.toString(),{max:2,onnotice:()=>{}});
  try{assert.match((await cliente`SHOW server_version`)[0].server_version,/^16\./);await verificar(drizzlePostgres(cliente));}finally{await cliente.end();}
});
test('Pix diferencia a chave configurada da demonstração e dinheiro diferencia necessidade de troco',()=>{
  const anterior=process.env.FARMACIA_PIX_CHAVE;
  try {
    delete process.env.FARMACIA_PIX_CHAVE;
    const teste=respostaPagamento({forma:'pix',troco:'pendente',valor:'0.00'},'19.00').mensagens;
    assert.equal(teste.length,3);assert.match(teste[0],/99999999.*Não faça transferência/);
    assert.match(teste[1],/Aguardando pagamento simulado/);assert.match(teste[2],/comprovante de teste/);
    process.env.FARMACIA_PIX_CHAVE=`${randomUUID()}@example.invalid`;
    const {mensagens}=respostaPagamento({forma:'pix',troco:'pendente',valor:'0.00'},'19.00');
    assert.equal(mensagens[0],process.env.FARMACIA_PIX_CHAVE);
    assert.match(mensagens[1],/Pagamento por Pix registrado.*Valor do pedido: R\$ 19,00.*Aguardando pagamento/);
    assert.equal(mensagens.length,3);assert.match(mensagens[2],/envie o comprovante/);
    assert.match(respostaPagamento({forma:'dinheiro',troco:'nao',valor:'0.00'},'19.00').mensagens[0],/sem troco/);
    assert.match(respostaPagamento({forma:'dinheiro',troco:'sim',valor:'0.00'},'19.00').mensagens[0],/qual valor/);
  }finally{if(anterior===undefined)delete process.env.FARMACIA_PIX_CHAVE;else process.env.FARMACIA_PIX_CHAVE=anterior;}
});
