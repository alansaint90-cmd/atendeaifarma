import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {applyMigrations} from "../src/lib/db/migrate";
import {systemUserId} from "../src/lib/db/bootstrap";
import {salvarProduto,entradaEstoque,consultarProdutos,historicoProduto,ajustarEstoque} from "../src/lib/farmacia/catalogo";
import {criarPedido,executarPedido,habilitarFarmaceutico} from "../src/lib/farmacia/pedidos";
import {painelFarmacia,listarPedidos} from "../src/lib/farmacia/consultas";
import {atenderIntencao} from "../src/lib/farmacia/agente";
import {interpretarIntencao} from "../src/lib/farmacia/interpretar";
import {assumirConversa,atendimentoHumanoAtivo,enviarManual} from "../src/lib/farmacia/atendimento";
import {receberOperacao} from "../src/lib/operacao/receber";
import type {AgentConfig} from "../src/lib/agent/config";
import type {ProdutoEntrada} from "../src/lib/farmacia/validacao";

test("farmácia: catálogo real, transações, receita, idempotência e CRM",async t=>{
  const client=new PGlite();const banco=drizzle(client);const admin={userId:randomUUID(),papel:"admin" as const};const operador={userId:randomUUID(),papel:"operador" as const};
  try{
    await applyMigrations(banco);
    for(const ator of [admin,operador])await client.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Teste',$2,true,$3)",[ator.userId,ator.papel,systemUserId]);
    const contato=randomUUID(),canal=randomUUID(),conversa=randomUUID();
    await client.query("INSERT INTO atendeia_contacts(id,name,phone,modified_by) VALUES ($1,'Cliente','+5571999990001',$2)",[contato,systemUserId]);
    await client.query("INSERT INTO atendeia_channels(id,name,instance_name,modified_by) VALUES ($1,'Teste','farmacia-teste',$2)",[canal,systemUserId]);
    await client.query("INSERT INTO atendeia_conversations(id,channel_id,contact_id,remote_jid,modified_by) VALUES ($1,$2,$3,'5571999990001@s.whatsapp.net',$4)",[conversa,canal,contato,systemUserId]);
    const contexto={conversaId:conversa,contatoId:contato,produtos:[],pedidos:[]};
    const produto=async(dados:Partial<ProdutoEntrada>={})=>salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{nome:"Dipirona",principio:"Dipirona",generico:"Dipirona",fabricante:"Laboratório",categoria:"Medicamentos",concentracao:"500 mg",apresentacao:"comprimidos",embalagem:10,ean:null,sku:randomUUID(),preco:"8.90",promocional:null,minimo:3,receita:false,controle:"",ativo:true,medicamento:true,observacoes:"",aliases:"",...dados}});
    const entrada=async(id:string,qtd:number,validade="2099-12-31")=>entradaEstoque(banco,operador,{produtoId:id,codigo:randomUUID(),validade,quantidade:qtd,bloqueado:false,chave:randomUUID()});
    const pedido=async(id:string,qtd=1)=>criarPedido(banco,operador,{contatoId:contato,conversaId:conversa,chave:randomUUID(),itens:[{produtoId:id,quantidade:qtd}]});
    const acao=(id:string,a:string,autor=admin,chave=randomUUID())=>executarPedido(banco,autor,{id,acao:a,chave,referencia:"Conferência autorizada 12345"});
    const saldo=async(id:string)=>(await client.query<{quantidade:number}>("SELECT coalesce(sum(quantidade),0)::int quantidade FROM atendeia_produtos_lotes WHERE produto_id=$1",[id])).rows[0].quantidade;

    await t.test("Cadastro com estoque é atômico, idempotente e consultado pelo agente",async()=>{
      const dados={id:null,atualizadoEm:null,produto:{nome:"Cadastro integrado",principio:"",generico:"",fabricante:"",categoria:"Medicamentos",concentracao:"500 mg",apresentacao:"comprimidos",embalagem:10,ean:null,sku:randomUUID(),preco:"12.90",promocional:null,minimo:3,receita:false,controle:"",ativo:true,medicamento:true,observacoes:"",aliases:""},estoqueInicial:{quantidade:25,codigo:"LOTE-DEMO",validade:"2099-12-31",chave:randomUUID()}};
      const id=await salvarProduto(banco,admin,dados);
      assert.equal(await salvarProduto(banco,admin,dados),id);
      assert.equal(await saldo(id),25);
      assert.equal((await historicoProduto(banco,admin,id)).movimentos.length,1);
      const resposta=await atenderIntencao(banco,contexto,{acao:"buscar",termo:"Cadastro integrado",pedidoId:"",itens:[]},randomUUID());
      assert.match(String(resposta),/R\$ 12,90/);assert.match(String(resposta),/25 unidade/);
      await assert.rejects(salvarProduto(banco,admin,{...dados,estoqueInicial:{...dados.estoqueInicial,quantidade:26}}),/outros dados/);
      await assert.rejects(salvarProduto(banco,admin,{...dados,estoqueInicial:{...dados.estoqueInicial,validade:null}}),/validade/);
      await client.query("ALTER TABLE atendeia_produtos_lotes ADD CONSTRAINT teste_rollback CHECK (codigo<>'FALHA-TESTE')");
      try {
        await assert.rejects(salvarProduto(banco,admin,{...dados,produto:{...dados.produto,sku:"ROLLBACK-INICIAL"},estoqueInicial:{...dados.estoqueInicial,codigo:"FALHA-TESTE",chave:randomUUID()}}));
        assert.equal((await client.query("SELECT id FROM atendeia_produtos WHERE sku='ROLLBACK-INICIAL'")).rows.length,0);
      } finally {await client.query("ALTER TABLE atendeia_produtos_lotes DROP CONSTRAINT teste_rollback");}
    });

    await t.test("A/C: consulta usa preço cadastrado e não altera saldo",async()=>{
      const id=await produto();await entrada(id,25);
      const resposta=await atenderIntencao(banco,contexto,{acao:"buscar",termo:"Dipirona 500",pedidoId:"",itens:[]},randomUUID());
      assert.match(String(resposta),/R\$ 8,90/);assert.match(String(resposta),/25 unidade/);assert.equal(await saldo(id),25);
      assert.equal((await client.query("SELECT id FROM atendeia_pedidos")).rows.length,0);
    });
    await t.test("B/G: esgotados, vencidos, bloqueados e inativos não ficam disponíveis",async()=>{
      const id=await produto({nome:"Esgotado"});let r=await consultarProdutos(banco,operador,{termo:"Esgotado"});assert.equal(r.produtos[0].disponivel,0);
      await entrada(id,2,"2020-01-01");r=await consultarProdutos(banco,operador,{termo:"Esgotado"});assert.equal(r.produtos[0].disponivel,0);assert.equal(r.produtos[0].vencido,true);
      const resposta=await atenderIntencao(banco,contexto,{acao:"buscar",termo:"Esgotado",pedidoId:"",itens:[]},randomUUID());assert.match(String(resposta),/Indisponível/);
      await assert.rejects(pedido(id),/Quantidade indisponível/);
      const inativo=await produto({nome:"Inativo",ativo:false});await entrada(inativo,3);assert.equal((await consultarProdutos(banco,operador,{termo:"Inativo"})).produtos[0].disponivel,0);
    });
    await t.test("D/I: 25 → 23 somente após confirmação humana; repetição não baixa novamente",async()=>{
      const id=await produto({nome:"Venda"});await entrada(id,25);const p=await pedido(id,2);assert.equal(await saldo(id),25);
      await acao(p,"reservar");assert.equal(await saldo(id),25);
      assert.equal((await consultarProdutos(banco,operador,{termo:"Venda"})).produtos[0].disponivel,23);
      await assert.rejects(executarPedido(banco,{sistema:true},{id:p,acao:"confirmar",chave:randomUUID(),referencia:"Cliente disse paguei"}),/atendente/);
      const chave=randomUUID();await acao(p,"confirmar",admin,chave);await acao(p,"confirmar",admin,chave);await acao(p,"confirmar");
      assert.equal(await saldo(id),23);await acao(p,"separar");await acao(p,"concluir");assert.equal(await saldo(id),23);
      const [o]=(await client.query<{status:string}>("SELECT o.status FROM atendeia_funis_oportunidades o JOIN atendeia_pedidos p ON p.oportunidade_id=o.id WHERE p.id=$1",[p])).rows;assert.equal(o.status,"ganha");
      assert.equal((await client.query("SELECT id FROM atendeia_produtos_movimentos WHERE pedido_id=$1 AND tipo='venda'",[p])).rows.length,1);
    });
    await t.test("E: segunda reserva da última unidade é recusada",async()=>{
      const id=await produto({nome:"Última"});await entrada(id,1);const p1=await pedido(id),p2=await pedido(id);
      const resultados=await Promise.allSettled([acao(p1,"reservar"),acao(p2,"reservar")]);assert.equal(resultados.filter(r=>r.status==="fulfilled").length,1);
      const vencedor=resultados[0].status==="fulfilled"?p1:p2;await acao(vencedor,"confirmar");assert.equal(await saldo(id),0);
    });
    await t.test("F: cancela reserva e estorna venda uma única vez",async()=>{
      const id=await produto({nome:"Cancelamento"});await entrada(id,3);const p=await pedido(id,2);await acao(p,"reservar");await acao(p,"cancelar");
      assert.equal((await consultarProdutos(banco,operador,{termo:"Cancelamento"})).produtos[0].disponivel,3);
      const venda=await pedido(id,2);await acao(venda,"reservar");await acao(venda,"confirmar");await acao(venda,"cancelar");await acao(venda,"cancelar");assert.equal(await saldo(id),3);
    });
    await t.test("H: somente farmacêutico habilitado confere receita",async()=>{
      const id=await produto({nome:"Receita",receita:true});await entrada(id,2);const p=await pedido(id);await acao(p,"reservar");
      await assert.rejects(acao(p,"confirmar"),/farmacêutico/);await assert.rejects(acao(p,"conferir"),/habilitado/);
      await habilitarFarmaceutico(banco,admin,{usuarioId:admin.userId,registro:"CRF TESTE 123",habilitado:true});await acao(p,"conferir");await acao(p,"confirmar");assert.equal(await saldo(id),1);
    });
    await t.test("FEFO e reserva expirada: prioriza lote elegível mais próximo",async()=>{
      const id=await produto({nome:"Lotes"});const depois=await entrada(id,3,"2099-12-31");const antes=await entrada(id,2,"2098-12-31");const p=await pedido(id,3);
      await acao(p,"reservar");await client.query("UPDATE atendeia_pedidos_reservas SET expira_em=now()-interval '1 minute' WHERE pedido_id=$1",[p]);
      await assert.rejects(acao(p,"confirmar"),/expirada/);await acao(p,"reservar");await acao(p,"confirmar");
      const valores=(await client.query<{id:string;quantidade:number}>("SELECT id,quantidade FROM atendeia_produtos_lotes WHERE produto_id=$1",[id])).rows;
      assert.equal(valores.find(l=>l.id===antes)?.quantidade,0);assert.equal(valores.find(l=>l.id===depois)?.quantidade,2);
    });
    await t.test("Ajuste bloqueia estoque reservado, colisão e usuário sem permissão",async()=>{
      const id=await produto({nome:"Inventário"});await entrada(id,5);const p=await pedido(id,4);await acao(p,"reservar");const l=(await historicoProduto(banco,admin,id)).lotes[0];
      const ajuste={loteId:l.id,quantidade:1,motivo:"Contagem física",atualizadoEm:l.atualizadoEm,chave:randomUUID()};
      await assert.rejects(ajustarEstoque(banco,admin,ajuste),/reservadas/);await assert.rejects(ajustarEstoque(banco,operador,ajuste),/permissão/);
      await assert.rejects(ajustarEstoque(banco,admin,{...ajuste,atualizadoEm:"2000-01-01T00:00:00.000Z"}),/alterado/);
    });
    await t.test("J: webhook preserva contato/conversa sem duplicar e humano pausa IA",async()=>{
      const evento={instance:"farmacia-teste",event:"messages.upsert" as const,data:{key:{id:"msg-unica",fromMe:false,remoteJid:"5571999990001@s.whatsapp.net"},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Olá"}}};
      await receberOperacao(banco,evento);await receberOperacao(banco,evento);
      assert.equal((await client.query("SELECT id FROM atendeia_messages WHERE provider_message_id='msg-unica'")).rows.length,1);
      await assumirConversa(banco,operador,{id:conversa,assumir:true});assert.equal(await atendimentoHumanoAtivo(banco,"farmacia-teste","5571999990001"),true);
      await assumirConversa(banco,operador,{id:conversa,assumir:false});assert.equal(await atendimentoHumanoAtivo(banco,"farmacia-teste","5571999990001"),false);
    });
    await t.test("Pedido idempotente recusa reutilização da chave com quantidade diferente",async()=>{
      const id=await produto({nome:"Chave"});await entrada(id,5);const v={contatoId:contato,conversaId:conversa,chave:randomUUID(),itens:[{produtoId:id,quantidade:1}]};
      const p=await criarPedido(banco,operador,v);assert.equal(await criarPedido(banco,operador,v),p);
      await assert.rejects(criarPedido(banco,operador,{...v,itens:[{produtoId:id,quantidade:2}]}),/já utilizado/);
    });
    await t.test("Falha em um item desfaz todas as reservas do pedido",async()=>{
      const ids=[await produto({nome:"Atômico A"}),await produto({nome:"Atômico B"})].sort();
      for(const id of ids)await entrada(id,1);
      const p=await criarPedido(banco,operador,{contatoId:contato,conversaId:conversa,chave:randomUUID(),itens:ids.map(produtoId=>({produtoId,quantidade:1}))});
      const outro=await pedido(ids[1]);await acao(outro,"reservar");await assert.rejects(acao(p,"reservar"),/insuficiente/);
      assert.equal((await client.query("SELECT id FROM atendeia_pedidos_reservas WHERE pedido_id=$1",[p])).rows.length,0);
    });
    await t.test("Devolução após conclusão entra bloqueada sem recuperar disponibilidade",async()=>{
      const id=await produto({nome:"Devolução"});await entrada(id,2);const p=await pedido(id);await acao(p,"reservar");await acao(p,"confirmar");await acao(p,"separar");await acao(p,"concluir");await acao(p,"cancelar");
      const r=await consultarProdutos(banco,operador,{termo:"Devolução"});assert.equal(r.produtos[0].fisico,2);assert.equal(r.produtos[0].disponivel,1);
      assert.equal((await historicoProduto(banco,admin,id)).lotes.filter(l=>l.bloqueado).length,1);
    });
    await t.test("Mensagem manual registra saída uma vez; entrega incerta não é repetida",async()=>{
      await assumirConversa(banco,operador,{id:conversa,assumir:true});let envios=0;
      const settings=async()=>({EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste-local",EVOLUTION_INSTANCE_NAME:"farmacia-teste"});
      const dep={settings,send:async()=>{envios++;return "manual-unica";}};const v={id:conversa,texto:"Atendimento humano de teste",chave:randomUUID()};
      await enviarManual(banco,operador,v,dep);await assert.rejects(enviarManual(banco,operador,v,dep),/já foi enviada/);assert.equal(envios,1);
      const incerto={...v,chave:randomUUID()};const falha={settings,send:async()=>{envios++;throw new Error("timeout");}};
      await assert.rejects(enviarManual(banco,operador,incerto,falha),/incerta/);await assert.rejects(enviarManual(banco,operador,incerto,falha),/incerta/);assert.equal(envios,2);
      await assumirConversa(banco,operador,{id:conversa,assumir:false});
    });
    await t.test("IA não consulta ou reserva pedido de outra conversa",async()=>{
      const resposta=await atenderIntencao(banco,contexto,{acao:"reservar",termo:"",pedidoId:randomUUID(),itens:[]},randomUUID());assert.match(String(resposta),/neste atendimento/);
    });
    await t.test("Dashboard e pedidos consultam valores persistidos",async()=>{
      const painel=await painelFarmacia(banco,admin);assert.ok(painel.estoque.total>0);assert.ok(painel.vendas.confirmados>0);assert.match(painel.vendas.faturamento,/\d+\.\d{2}/);
      assert.ok((await listarPedidos(banco,admin,{})).pedidos[0].eventos.length>0);
    });
  }finally{await client.close();}
});
test("IA rejeita resposta livre e ferramenta de confirmação de pagamento",async()=>{
  const config={OPENAI_API_KEY:"teste",OPENAI_MODEL:"teste"} as AgentConfig;
  const contexto={conversaId:randomUUID(),contatoId:randomUUID(),produtos:[],pedidos:[]};
  const response=async()=>Response.json({status:"completed",output:[{type:"message",content:[]} ]});
  await assert.rejects(interpretarIntencao(config,[],"Tem dipirona?",contexto,response),/farmacia_acao_invalida/);
  const maliciosa=async()=>Response.json({status:"completed",output:[{type:"function_call",name:"confirmar_pagamento",arguments:"{}"}]});
  await assert.rejects(interpretarIntencao(config,[],"Paguei",contexto,maliciosa),/farmacia_acao_invalida/);
});
