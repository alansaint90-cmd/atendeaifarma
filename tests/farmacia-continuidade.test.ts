import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { continuidadeDaConsulta } from "../src/lib/farmacia/continuidade";
import type { ContextoFarmacia } from "../src/lib/farmacia/interpretar";
import { salvarProduto, consultarProdutos } from "../src/lib/farmacia/catalogo";
import { criarPedido, executarPedido } from "../src/lib/farmacia/pedidos";
import { atenderIntencao, consultaEstoqueFarmacia } from "../src/lib/farmacia/agente";

test("continuidade usa somente oferta reconhecida ou pedido aberto, sem escolher produto arbitrário",()=>{
  const produto={id:randomUUID(),nome:"Dipirona",concentracao:"500 mg",apresentacao:"caixa com 30 comprimidos"};
  const contexto:ContextoFarmacia={conversaId:randomUUID(),contatoId:randomUUID(),produtos:[produto],pedidos:[]};
  assert.equal(continuidadeDaConsulta(contexto,[]),undefined);
  assert.equal(continuidadeDaConsulta(contexto,[{role:"user",content:"Temos sim Dipirona — 500 mg — caixa com 30 comprimidos, por R$ 8,90."}]),undefined);
  assert.deepEqual(continuidadeDaConsulta(contexto,[{role:"assistant",content:"Um momento...\nTemos sim Dipirona — 500 mg — caixa com 30 comprimidos, por R$ 8,90.\nGostaria de fazer o pedido?"}]),{produtoIds:[produto.id]});
  assert.equal(continuidadeDaConsulta(contexto,[{role:"assistant",content:"Temos sim outro produto, por R$ 8,90."}]),undefined);
  const pedido={id:randomUUID(),numero:"interno",status:"aguardando_pagamento"};
  assert.deepEqual(continuidadeDaConsulta({...contexto,pedidos:[pedido]},[]),{produtoIds:[],pedidoId:pedido.id});
  assert.equal(continuidadeDaConsulta({...contexto,pedidos:[{...pedido,status:"concluido"}]},[]),undefined);
  assert.equal(continuidadeDaConsulta({...contexto,pedidos:[pedido,{...pedido,id:randomUUID()}]},[]),undefined);
  const encerrado={...pedido,status:"concluido",atualizadoEm:"2026-11-20T12:00:00Z"};
  const oferta=[{role:"assistant" as const,content:"Temos sim Dipirona — 500 mg — caixa com 30 comprimidos, por R$ 8,90."}];
  assert.equal(continuidadeDaConsulta({...contexto,produtos:[{...produto,consultadoEm:"2026-11-20T11:00:00Z"}],pedidos:[encerrado]},oferta),undefined);
  assert.deepEqual(continuidadeDaConsulta({...contexto,produtos:[{...produto,consultadoEm:"2026-11-20T13:00:00Z"}],pedidos:[encerrado]},oferta),{produtoIds:[produto.id]});
});

test("consulta adicional usa pergunta genérica mesmo com oferta anterior e pedido reservado",async()=>{
  const cliente=new PGlite(),banco=drizzle(cliente),autor=randomUUID(),instancia=`continuidade-${randomUUID()}`;
  try {
    await applyMigrations(banco);
    await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Gestor fictício','admin',true,$2)",[autor,systemUserId]);
    const numero="5511999990001";
    await receberOperacao(banco,{instance:instancia,event:"messages.upsert",data:{
      key:{id:randomUUID(),fromMe:false,remoteJid:`${numero}@s.whatsapp.net`},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Consulta fictícia"}}});
    const conversas=(await cliente.query<{id:string;contato_id:string}>("SELECT c.id,c.contact_id contato_id FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id WHERE ch.instance_name=$1 ORDER BY c.remote_jid",[instancia])).rows;
    const produto=await salvarProduto(banco,{userId:autor,papel:"admin"},{id:null,atualizadoEm:null,produto:{nome:"Dipirona",sku:randomUUID(),apresentacao:"caixa com 30 comprimidos",preco:"8.90",receita:false,ativo:true,
      principio:"",generico:"",fabricante:"",categoria:"Medicamentos",concentracao:"",embalagem:1,ean:null,promocional:null,minimo:0,controle:"",medicamento:true,observacoes:"",aliases:""},
      estoqueInicial:{codigo:"LOTE",validade:"2099-12-31",quantidade:1,chave:randomUUID()}});
    const contexto:ContextoFarmacia={conversaId:conversas[0].id,contatoId:conversas[0].contato_id,produtos:[],pedidos:[]};
    await atenderIntencao(banco,contexto,{acao:"buscar",termo:"Dipirona",pedidoId:"",itens:[]},randomUUID());
    const oferta={produtoIds:[produto]};
    const consultar=consultaEstoqueFarmacia(banco,instancia,{identity:randomUUID(),conversation:"teste",number:numero,text:"Metronidazol",timestamp:Math.floor(Date.now()/1000)});
    const esperado={mensagens:["No momento não temos esse produto disponível.","Gostaria de consultar outro produto?"]};
    assert.deepEqual(await consultar("Metronidazol",oferta),esperado);
    assert.equal((await cliente.query("SELECT id FROM atendeia_pedidos")).rows.length,0);
    const pedido=await criarPedido(banco,{sistema:true},{contatoId:contexto.contatoId,conversaId:contexto.conversaId,chave:randomUUID(),itens:[{produtoId:produto,quantidade:1}]});
    await executarPedido(banco,{sistema:true},{id:pedido,acao:"reservar",chave:randomUUID(),referencia:"Confirmação fictícia"});
    assert.equal((await consultarProdutos(banco,{sistema:true},{termo:"Dipirona"})).produtos[0].disponivel,0);
    const continuidade={produtoIds:[],pedidoId:pedido};
    const antes=(await cliente.query("SELECT * FROM atendeia_pedidos WHERE id=$1",[pedido])).rows;
    assert.deepEqual(await consultar("Metronidazol",continuidade),esperado);
    assert.deepEqual((await cliente.query("SELECT * FROM atendeia_pedidos WHERE id=$1",[pedido])).rows,antes);
  } finally {await cliente.close();}
});
