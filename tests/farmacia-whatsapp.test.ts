import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receiveEvolutionEvent } from "../src/lib/evolution/webhook";
import { receberOperacao } from "../src/lib/operacao/receber";
import { incomingMessage } from "../src/lib/agent/message";
import { configurarAgenteFarmacia as configurarAgente } from "../src/lib/farmacia/configuracao-agente";
import { processMessage, type DeliveryState } from "../src/lib/agent/processor";
import { sendReply, type Turn } from "../src/lib/agent/providers";
import { salvarChatbotServidor, chatbotDaInstancia } from "../src/lib/chatbots/server-repository";
import { criarChatbotFarmacia, promptAtendimentoFarmacia } from "../src/lib/farmacia/prompt";
import { consultaEstoqueFarmacia, geradorFarmacia, responderComprovanteFarmacia } from "../src/lib/farmacia/agente";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { salvarProduto, entradaEstoque, consultarProdutos } from "../src/lib/farmacia/catalogo";
import { alterarPausaIa, assumirConversa, estadoPausaIa } from "../src/lib/farmacia/atendimento";
import type { ProdutoEntrada } from "../src/lib/farmacia/validacao";

test("WhatsApp da farmácia integra mensagem, prompt salvo, consulta real e resposta sem chamadas externas",async t=>{
  const cliente=new PGlite();const banco=drizzle(cliente);
  const admin={userId:randomUUID(),papel:"admin" as const};
  const instancia="farmacia-integracao",numero="5571999990001";
  const settings={AI_ENABLED:"true",OPENAI_API_KEY:"sk-teste-integracao",OPENAI_MODEL:"modelo-de-teste",
    EVOLUTION_API_URL:"https://evolution.example.invalid",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:instancia,
    EVOLUTION_WEBHOOK_SECRET:randomBytes(32).toString("hex"),REDIS_URL:"redis://localhost:6379"};
  const cadastro:ProdutoEntrada={nome:"Dipirona",principio:"Dipirona",generico:"",fabricante:"Laboratório",categoria:"Medicamentos",concentracao:"500 mg",apresentacao:"comprimidos",embalagem:10,ean:null,sku:"DIP-30-TESTE",preco:"8.90",promocional:null,minimo:3,receita:false,controle:"",ativo:true,medicamento:true,observacoes:"",aliases:""};
  const estados=new Map<string,DeliveryState>();const historico:Turn[]=[];
  const saidas:{numero:string;texto:string}[]=[];let transferencias=0;
  try {
    await applyMigrations(banco);
    await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Gerente','admin',true,$2)",[admin.userId,systemUserId]);
    await cliente.query("INSERT INTO atendeia_channels(name,instance_name,modified_by) VALUES ('Farmácia',$1,$2)",[instancia,admin.userId]);
    const bot=criarChatbotFarmacia(randomUUID(),instancia);
    await salvarChatbotServidor(banco,{id:null,versao:null,configuracao:bot,instancia,usuario:admin.userId});
    const registrado=await chatbotDaInstancia(banco,instancia);
    assert.equal(registrado?.context,promptAtendimentoFarmacia);
    const config=configurarAgente(settings,registrado).data!;
    assert.ok(config);
    const id=await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:cadastro,
      estoqueInicial:{codigo:"LOTE-VALIDO",quantidade:25,validade:"2099-12-31",chave:randomUUID()}});

    async function atender(texto:string,acao:object,configuracao=config,anexo=false) {
      const inicioSaidas=saidas.length;
      const evento={event:"messages.upsert" as const,instance:instancia,data:{key:{id:randomUUID(),fromMe:false,remoteJid:`${numero}@s.whatsapp.net`},messageTimestamp:Math.floor(Date.now()/1000),message:anexo?{imageMessage:{}}:{conversation:texto}}};
      let enfileirado=false;
      const resposta=await receiveEvolutionEvent(new Request("https://farmacia.example.invalid/api/webhooks/evolution",{
        method:"POST",headers:{"Content-Type":"application/json","x-webhook-secret":settings.EVOLUTION_WEBHOOK_SECRET},body:JSON.stringify(evento)}),
      settings,async()=>{enfileirado=true;return "queued";},evento=>receberOperacao(banco,evento));
      assert.equal(resposta.status,202);assert.equal(enfileirado,true);
      const mensagem=incomingMessage(evento,instancia,Date.now(),true)!;assert.ok(mensagem);
      const requisicao:typeof fetch=async(url,inicio)=>{
        if(String(url)==="https://api.openai.com/v1/responses") {
          const corpo=JSON.parse(String(inicio?.body));
          assert.ok(corpo.instructions.includes(promptAtendimentoFarmacia));
          assert.match(corpo.instructions,/CONTRATO OBRIGATÓRIO/);
          assert.equal(corpo.parallel_tool_calls,false);
          assert.equal(corpo.store,false);
          assert.deepEqual(corpo.tool_choice,{type:"function",name:"atender_farmacia"});
          assert.equal(corpo.tools[0].strict,true);
          if("falhaProvedor" in acao)return Response.json({}, {status:503});
          return Response.json({status:"completed",output:[{type:"function_call",name:"atender_farmacia",arguments:JSON.stringify({termo:"",pedidoId:"",campo:"",itens:[],...acao})}]});
        }
        assert.equal(String(url),`${settings.EVOLUTION_API_URL}/message/sendText/${instancia}`);
        const corpo=JSON.parse(String(inicio?.body));saidas.push({numero:corpo.number,texto:corpo.text});
        return Response.json({key:{id:randomUUID()}});
      };
      let agora=Date.now(),adicional=false;
      const gerar=geradorFarmacia(banco,instancia,mensagem,requisicao);
      const porta={agora:()=>agora,consultarEstoque:consultaEstoqueFarmacia(banco,instancia,mensagem),read:async()=>estados.get(mensagem.identity)??null,write:async(estado:DeliveryState)=>{estados.set(mensagem.identity,estado);},
        history:async()=>historico,enabled:async()=>!(await estadoPausaIa(banco,instancia,numero))?.bloqueada,
        receberMidia:()=>responderComprovanteFarmacia(banco,instancia,mensagem),
        generate:async(...args:Parameters<typeof gerar>)=>{const r=await gerar(...args);adicional=typeof r!=="string"&&"consultarEstoque" in r&&!!r.continuidade;return r;},
        send:(_config:typeof config,destino:string,texto:string)=>sendReply(config,destino,texto,requisicao),
        transferir:async()=>{transferencias++;},
        complete:async(estado:DeliveryState,turnos:Turn[])=>{estados.set(mensagem.identity,estado);historico.push(...turnos);}};
      let resultado=await processMessage(mensagem,configuracao,porta);
      if(resultado==="aguardando_estoque"){agora+=15000;resultado=await processMessage(mensagem,configuracao,porta);}
      const consulta=!!estados.get(mensagem.identity)?.estoque;
      const quantidade=saidas.length;
      await processMessage(mensagem,configuracao,porta);
      assert.equal(saidas.length,quantidade,"Reentrega não pode repetir a resposta.");
      const todas=saidas.slice(inicioSaidas).map(s=>s.texto);
      const prefixo=adicional?["Consultando…"]:["Um momento, vou consultar o estoque.","Consultando…"];
      if(consulta)assert.deepEqual(todas.slice(0,prefixo.length),prefixo);
      const mensagens=consulta?todas.slice(prefixo.length):todas;
      return {resultado,texto:mensagens.join("\n\n"),mensagens,todas};
    }

    await t.test("responde apresentação e preço em um balão e CTA em outro sem baixar estoque",async()=>{
      const r=await atender("Tem dipirona 500 mg?",{acao:"buscar",termo:"Dipirona 500"});
      assert.equal(r.resultado,"enviada");assert.equal(saidas.at(-1)?.numero,numero);
      assert.match(r.mensagens[0],/Temos sim.*Dipirona.*R\$ 8,90/s);assert.doesNotMatch(r.texto,/25 embalagens disponíveis/);
      assert.equal(r.mensagens.length,2);assert.equal(r.mensagens[1],"Gostaria de fazer o seu pedido ou acrescentar mais alguma coisa?");
      assert.equal((await consultarProdutos(banco,admin,{termo:"Dipirona"})).produtos[0].fisico,25);
    });
    await t.test("consulta novamente o preço e o saldo após alteração do cadastro",async()=>{
      const produto=(await consultarProdutos(banco,admin,{termo:"Dipirona"})).produtos[0];
      await salvarProduto(banco,admin,{id,atualizadoEm:produto.atualizadoEm,produto:{...cadastro,preco:"9.50"}});
      await entradaEstoque(banco,admin,{produtoId:id,codigo:"REPOSICAO",quantidade:3,validade:"2099-12-31",bloqueado:false,chave:randomUUID()});
      const r=await atender("E agora, quanto custa?",{acao:"buscar",termo:"Dipirona 500"});
      assert.match(r.texto,/R\$ 9,50/);assert.doesNotMatch(r.texto,/28 embalagens disponíveis|R\$ 8,90/);
      assert.equal((await consultarProdutos(banco,admin,{termo:"Dipirona"})).produtos[0].disponivel,28);
    });
    await t.test("esgotado, lote vencido, bloqueado e produto ausente aguardam resposta humana",async()=>{
      const anteriores=historico.splice(0);
      try {
      for(const nome of ["Esgotado","Vencido","Bloqueado"]) {
        const produtoId=await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,nome,sku:randomUUID()},
          estoqueInicial:nome==="Vencido"?{codigo:"LOTE-VENCIDO",quantidade:4,validade:"2020-01-01",chave:randomUUID()}:null});
        if(nome==="Bloqueado")await entradaEstoque(banco,admin,{produtoId,codigo:"QUARENTENA",quantidade:4,validade:"2099-12-31",bloqueado:true,chave:randomUUID()});
        const antes=transferencias;const r=await atender(`Tem ${nome}?`,{acao:"buscar",termo:nome});
        assert.deepEqual(r.mensagens,[]);assert.equal(transferencias,antes+1);
      }
      const r=await atender("Tem produto inexistente?",{acao:"buscar",termo:"Produto inexistente"});
      assert.deepEqual(r.mensagens,[]);
      } finally {historico.splice(0,historico.length,...anteriores);}
    });
    await t.test("busca ampla só oferece o produto disponível e não troca apresentação específica",async()=>{
      assert.equal((await consultarProdutos(banco,admin,{termo:"DIP-30-TESTE"})).produtos[0].id,id);
      await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,apresentacao:"caixa com 30 comprimidos",preco:"5.00",sku:randomUUID()}});
      const r=await atender("Tem dipirona?",{acao:"buscar",termo:"Dipirona"});
      assert.match(r.mensagens[0],/R\$ 9,50/);assert.doesNotMatch(r.texto,/5,00|30 comprimidos|não temos/i);
      const antes=transferencias;
      const exata=await atender("Quero acrescentar dipirona caixa com 30 comprimidos",{acao:"buscar",termo:"Dipirona 30 comprimidos"});
      assert.equal(exata.todas[0],"Consultando…");assert.equal(exata.todas.length,3);
      assert.equal(exata.mensagens[0],"No momento não temos esse produto disponível.");
      assert.match(exata.mensagens[1],/Gostaria de finalizar.*Dipirona.*500 mg.*comprimidos/s);
      assert.doesNotMatch(exata.mensagens[1],/30 comprimidos/);assert.equal(transferencias,antes);
      assert.equal((await cliente.query("SELECT id FROM atendeia_pedidos")).rows.length,0,"Oferta anterior não cria pedido nem assume quantidade.");
      assert.equal((await atender("Sim",{acao:"esclarecer",campo:"quantidade"})).texto,"Quantas embalagens você deseja?");
      const consultas=await cliente.query<{nome:string;apresentacao:string}>("SELECT p.nome,p.apresentacao FROM atendeia_produtos_consultas q JOIN atendeia_produtos p ON p.id=q.produto_id WHERE p.apresentacao='caixa com 30 comprimidos'");
      assert.equal(consultas.rows.length,0,"Opção indisponível não deve entrar no contexto de oferta.");
    });
    await t.test("encontra disponível mesmo depois de mais de 40 cadastros sem saldo",async()=>{
      for(let i=0;i<41;i++)await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,nome:`Busca extensa ${String(i).padStart(2,"0")}`,sku:randomUUID()}});
      await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,nome:"Busca extensa Z disponível",sku:randomUUID()},estoqueInicial:{codigo:"EXTENSA",quantidade:2,validade:"2099-12-31",chave:randomUUID()}});
      const r=await atender("Tem Busca extensa?",{acao:"buscar",termo:"Busca extensa"});
      assert.match(r.texto,/Temos sim.*Busca extensa Z disponível/s);assert.doesNotMatch(r.texto,/não temos|Busca extensa 00/i);
    });
    await t.test("faz apenas a pergunta necessária e usa a persona cadastrada",async()=>{
      const r=await atender("Quero outro produto",{acao:"esclarecer",campo:"concentracao"});
      assert.equal(r.texto,"Qual concentração você procura?");
      const saudacao=await atender("Oi",{acao:"saudacao"});
      assert.match(saudacao.texto,/Assistente Atende Aí, assistente virtual/);
      assert.match(saudacao.texto,/Farmácia WE/);assert.doesNotMatch(saudacao.texto,/qual.*seu nome/i);
    });
    await t.test("atendente humano pausa a resposta automática antes de consultar a IA",async()=>{
      const conversa=(await cliente.query<{id:string}>("SELECT id FROM atendeia_conversations WHERE remote_jid=$1",[`${numero}@s.whatsapp.net`])).rows[0].id;
      await assumirConversa(banco,admin,{id:conversa,assumir:true});
      const antes=saidas.length;
      const r=await atender("Tem dipirona?",{acao:"buscar",termo:"Dipirona"});
      assert.equal(r.resultado,"pausada");assert.equal(saidas.length,antes);
      await assumirConversa(banco,admin,{id:conversa,assumir:false});
    });
    await t.test("pausa do painel é persistente, auditada e independente do atendimento humano",async()=>{
      const [c]=(await cliente.query<{id:string;version:number}>("SELECT id,version FROM atendeia_conversations WHERE remote_jid=$1",[`${numero}@s.whatsapp.net`])).rows;
      await alterarPausaIa(banco,admin,{...c,pausar:true});
      assert.equal((await estadoPausaIa(banco,instancia,numero))?.bloqueada,true);
      assert.equal((await atender("Kd a chave pix ?",{falhaProvedor:true})).resultado,"pausada");
      await assert.rejects(alterarPausaIa(banco,admin,{...c,pausar:false}),/mudou/);
      const [atual]=(await cliente.query<{version:number}>("SELECT version FROM atendeia_conversations WHERE id=$1 AND is_deleted=false",[c.id])).rows;
      const retomada=await alterarPausaIa(banco,admin,{id:c.id,version:atual.version,pausar:false});
      const estado=await estadoPausaIa(banco,instancia,numero);
      assert.equal(estado?.bloqueada,false);assert.ok(Number(estado?.retomadaEm)>0);
      await assumirConversa(banco,admin,{id:c.id,assumir:true});
      await alterarPausaIa(banco,admin,{id:c.id,version:retomada.version+1,pausar:false});
      assert.equal((await estadoPausaIa(banco,instancia,numero))?.bloqueada,true);
      await assumirConversa(banco,admin,{id:c.id,assumir:false});
      const anterior=process.env.FARMACIA_PIX_CHAVE;
      try {
        delete process.env.FARMACIA_PIX_CHAVE;
        assert.match((await atender("Kd a chave pix ?",{falhaProvedor:true})).mensagens[0],/99999999.*Não faça uma transferência/);
        process.env.FARMACIA_PIX_CHAVE="pagamento@example.invalid";
        const semPedido=await atender("Kd a chave pix ?",{falhaProvedor:true});
        assert.match(semPedido.texto,/Confirme os itens/);assert.doesNotMatch(semPedido.texto,/example.invalid/);
      } finally {
        if(anterior===undefined)delete process.env.FARMACIA_PIX_CHAVE;
        else process.env.FARMACIA_PIX_CHAVE=anterior;
      }
      const auditorias=await cliente.query("SELECT id FROM atendeia_audit_logs WHERE entity_id=$1 AND action IN ('ia_pausada_no_painel','ia_despausada_no_painel') AND is_deleted=false",[c.id]);
      assert.equal(auditorias.rows.length,3);
    });
    await t.test("dúvida clínica segue encaminhamento humano sem recomendar medicamento",async()=>{
      const antes=transferencias;
      const r=await atender("Qual remédio devo tomar?",{acao:"humano"});
      assert.equal(r.texto,bot.transferNotice);assert.equal(transferencias,antes+1);
      assert.equal((await cliente.query("SELECT id FROM atendeia_pedidos")).rows.length,0);
    });
    await t.test("falha do provedor não é anunciada como produto esgotado",async()=>{
      const r=await atender("Tem dipirona?",{falhaProvedor:true});
      assert.match(r.texto,/Não consegui consultar o sistema agora/);
      assert.doesNotMatch(r.texto,/não temos.*disponível|R\$|embalagens disponíveis/i);
    });
    await t.test("sem transferência habilitada não promete encaminhamento nem recomenda tratamento",async()=>{
      const desligado=configurarAgente(settings,{...registrado!,transferHuman:false}).data!;
      const antes=transferencias;
      const r=await atender("Preciso falar com o farmacêutico",{acao:"humano"},desligado);
      assert.match(r.texto,/encaminhamento automático está indisponível/);
      assert.equal(transferencias,antes);
    });
    await t.test("pedido confirma, acrescenta no mesmo registro e pergunta pagamento sem expor códigos",async()=>{
      const r=await atender("Quero uma embalagem de dipirona",{acao:"criar_pedido",itens:[{produtoId:id,quantidade:1}]});
      assert.equal(r.mensagens.length,2);assert.match(r.mensagens[0],/Pedido registrado:.*Dipirona.*R\$ 9,50/s);
      assert.equal(r.mensagens[1],"Confirma os itens para fazer a compra?");
      assert.doesNotMatch(r.texto,/F-[A-Z0-9-]+|válida até|temporariamente/);
      const p=(await cliente.query<{id:string;numero:string}>("SELECT id,numero FROM atendeia_pedidos")).rows[0];
      assert.equal((await atender("Sim",{acao:"reservar",pedidoId:p.id})).texto,"Itens confirmados. Deseja acrescentar mais alguma coisa?");
      assert.equal((await atender("Sim",{acao:"adicionar",pedidoId:p.id})).texto,"Qual produto você deseja acrescentar ao pedido?");
      const antes=transferencias;
      const indisponivel=await atender("Quero acrescentar produto inexistente",{acao:"buscar",termo:"Produto inexistente"});
      assert.equal(indisponivel.todas.length,3);assert.equal(indisponivel.todas[0],"Consultando…");
      assert.match(indisponivel.mensagens[1],/finalizar.*Dipirona/s);assert.equal(transferencias,antes);
      assert.equal((await cliente.query("SELECT id FROM atendeia_pedidos")).rows.length,1);
      assert.deepEqual((await atender("Sim",{acao:"finalizar",pedidoId:p.id})).mensagens,
        ["Pedido registrado, aguardando pagamento.","Qual forma de pagamento você prefere: Pix, dinheiro ou cartão?"]);
      const acrescimo=await atender("Mais uma dipirona",{acao:"criar_pedido",itens:[{produtoId:id,quantidade:1}]});
      assert.match(acrescimo.texto,/2 ×.*Total: R\$ 19,00/s);
      assert.equal((await cliente.query("SELECT id FROM atendeia_pedidos")).rows.length,1);
      const acaoErrada={acao:"criar_pedido",itens:[{produtoId:id,quantidade:1}]};
      const paracetamol=await atender("Tem paracetamol?",acaoErrada);
      assert.match(paracetamol.texto,/não temos esse produto disponível/);
      assert.equal((await cliente.query<{total:string}>("SELECT total::text FROM atendeia_pedidos WHERE id=$1",[p.id])).rows[0].total,"19.00");
      const recusa=await atender("Não",{acao:"reservar",pedidoId:p.id});
      assert.match(recusa.texto,/Qual produto e quantidade/);
      assert.match((await atender("Sim",{acao:"reservar",pedidoId:p.id})).texto,/corrigir antes de confirmar/);
      assert.match((await atender("Eu quero uma dipirona só",acaoErrada)).texto,/1 ×.*Total: R\$ 9,50/s);
      assert.match((await atender("Uma dipirona só",acaoErrada)).texto,/1 ×.*Total: R\$ 9,50/s);
      assert.match((await atender("Mais uma dipirona",acaoErrada)).texto,/2 ×.*Total: R\$ 19,00/s);
      await atender("Sim",{acao:"reservar",pedidoId:p.id});
      const fim=await atender("Não, só isso",{acao:"finalizar",pedidoId:p.id});
      assert.deepEqual(fim.mensagens,["Pedido registrado, aguardando pagamento.","Qual forma de pagamento você prefere: Pix, dinheiro ou cartão?"]);
      const dinheiro=await atender("Dinheiro",{acao:"pagamento",pedidoId:p.id,pagamento:{forma:"dinheiro",troco:"pendente",valor:"0.00"}});
      assert.match(dinheiro.texto,/na entrega.*precisar de troco/s);
      assert.match((await atender("Sim",{acao:"pagamento",pedidoId:p.id,pagamento:{forma:"dinheiro",troco:"sim",valor:"0.00"}})).texto,/qual valor/);
      assert.match((await consultarOperacao(banco)).conversas[0].avisoEntrega??"",/precisa de troco/);
      assert.match((await atender("Para 50 reais",{acao:"pagamento",pedidoId:p.id,pagamento:{forma:"dinheiro",troco:"sim",valor:"50.00"}})).texto,/Troco para R\$ 50,00/);
      assert.match((await consultarOperacao(banco)).conversas[0].avisoEntrega??"",/Preparar troco para R\$ 50,00/);
      const cartao=await atender("Prefiro cartão", {falhaProvedor:true});
      assert.equal(cartao.mensagens.length,3);assert.match(cartao.mensagens[0],/maquininha/);
      assert.match(cartao.mensagens[1],/sendo preparado/);assert.match(cartao.mensagens[2],/endereço/);
      assert.match((await atender("Rua Teste, 12, Centro",{falhaProvedor:true})).texto,/Endereço registrado/);
      const chaveAnterior=process.env.FARMACIA_PIX_CHAVE;
      try {
        process.env.FARMACIA_PIX_CHAVE="pagamento@example.invalid";
        const pix=await atender("Pix",{acao:"pagamento",pedidoId:p.id,pagamento:{forma:"pix",troco:"sim",valor:"50.00"}});
        assert.equal(pix.mensagens[0],"pagamento@example.invalid");
        assert.match(pix.mensagens[1],/Valor do pedido: R\$ 19,00/);
        assert.match(pix.mensagens[2],/envie o comprovante/);
        assert.deepEqual((await atender("kd a chave pix",{falhaProvedor:true})).mensagens,pix.mensagens);
        delete process.env.FARMACIA_PIX_CHAVE;
        const teste=await atender("Cadê a chave do Pix?",{falhaProvedor:true});
        assert.match(teste.mensagens[0],/99999999.*Não faça uma transferência/);
        assert.match(teste.mensagens[2],/comprovante de teste/);
        process.env.FARMACIA_PIX_CHAVE="pagamento@example.invalid";
        assert.doesNotMatch((await atender("Já paguei",{falhaProvedor:true})).texto,/endereço/);
        const recibo=await atender("",{falhaProvedor:true},config,true);
        assert.match(recibo.mensagens[0],/conferir o comprovante/);assert.match(recibo.mensagens[1],/endereço/);
        assert.match((await consultarOperacao(banco)).conversas[0].avisoEntrega??"",/Comprovante Pix/);
        assert.match((await atender("Rua Teste, 30, Centro",{falhaProvedor:true})).texto,/Endereço registrado/);
        const enderecos=await cliente.query<{detalhe:string}>("SELECT detalhe FROM atendeia_pedidos_eventos WHERE pedido_id=$1 AND tipo='endereco_entrega' AND is_deleted=false",[p.id]);
        assert.ok(enderecos.rows.some(e=>e.detalhe==="Rua Teste, 30, Centro"));
      } finally {
        if(chaveAnterior===undefined)delete process.env.FARMACIA_PIX_CHAVE;
        else process.env.FARMACIA_PIX_CHAVE=chaveAnterior;
      }
      await atender("Dinheiro",{falhaProvedor:true});
      const semTroco=await atender("Não",{falhaProvedor:true});
      assert.match(semTroco.mensagens[0],/sem troco/);assert.match(semTroco.mensagens[1],/endereço/);
      assert.equal((await consultarOperacao(banco)).conversas[0].avisoEntrega,null);
      assert.doesNotMatch((await atender("Como está meu pedido?",{acao:"consultar_pedido",pedidoId:p.id})).texto,new RegExp(`${p.numero}|válida até`));
      assert.equal((await consultarProdutos(banco,admin,{termo:"DIP-30-TESTE"})).produtos[0].fisico,28);
      assert.equal((await cliente.query<{status:string}>("SELECT status FROM atendeia_pedidos WHERE id=$1",[p.id])).rows[0].status,"aguardando_pagamento");
    });
  } finally {await cliente.close();}
});
