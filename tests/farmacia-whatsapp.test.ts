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
import { configurarAgente } from "../src/lib/agent/config";
import { processMessage, type DeliveryState } from "../src/lib/agent/processor";
import { sendReply, type Turn } from "../src/lib/agent/providers";
import { salvarChatbotServidor, chatbotDaInstancia } from "../src/lib/chatbots/server-repository";
import { criarChatbotFarmacia, promptAtendimentoFarmacia } from "../src/lib/farmacia/prompt";
import { geradorFarmacia } from "../src/lib/farmacia/agente";
import { salvarProduto, entradaEstoque, consultarProdutos } from "../src/lib/farmacia/catalogo";
import { assumirConversa, atendimentoHumanoAtivo } from "../src/lib/farmacia/atendimento";
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

    async function atender(texto:string,acao:object,configuracao=config) {
      const inicioSaidas=saidas.length;
      const evento={event:"messages.upsert" as const,instance:instancia,data:{key:{id:randomUUID(),fromMe:false,remoteJid:`${numero}@s.whatsapp.net`},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:texto}}};
      let enfileirado=false;
      const resposta=await receiveEvolutionEvent(new Request("https://farmacia.example.invalid/api/webhooks/evolution",{
        method:"POST",headers:{"Content-Type":"application/json","x-webhook-secret":settings.EVOLUTION_WEBHOOK_SECRET},body:JSON.stringify(evento)}),
      settings,async()=>{enfileirado=true;return "queued";},evento=>receberOperacao(banco,evento));
      assert.equal(resposta.status,202);assert.equal(enfileirado,true);
      const mensagem=incomingMessage(evento,instancia)!;assert.ok(mensagem);
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
      const porta={read:async()=>estados.get(mensagem.identity)??null,write:async(estado:DeliveryState)=>{estados.set(mensagem.identity,estado);},
        history:async()=>historico,enabled:async()=>!await atendimentoHumanoAtivo(banco,instancia,numero),
        generate:geradorFarmacia(banco,instancia,mensagem,requisicao),
        send:(_config:typeof config,destino:string,texto:string)=>sendReply(config,destino,texto,requisicao),
        transferir:async()=>{transferencias++;},
        complete:async(estado:DeliveryState,turnos:Turn[])=>{estados.set(mensagem.identity,estado);historico.push(...turnos);}};
      const resultado=await processMessage(mensagem,configuracao,porta);
      const quantidade=saidas.length;
      await processMessage(mensagem,configuracao,porta);
      assert.equal(saidas.length,quantidade,"Reentrega não pode repetir a resposta.");
      const mensagens=saidas.slice(inicioSaidas).map(s=>s.texto);
      return {resultado,texto:mensagens.join("\n\n"),mensagens};
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
    await t.test("distingue esgotado, lote vencido, lote bloqueado e produto ausente",async()=>{
      for(const nome of ["Esgotado","Vencido","Bloqueado"]) {
        const produtoId=await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,nome,sku:randomUUID()},
          estoqueInicial:nome==="Vencido"?{codigo:"LOTE-VENCIDO",quantidade:4,validade:"2020-01-01",chave:randomUUID()}:null});
        if(nome==="Bloqueado")await entradaEstoque(banco,admin,{produtoId,codigo:"QUARENTENA",quantidade:4,validade:"2099-12-31",bloqueado:true,chave:randomUUID()});
        const r=await atender(`Tem ${nome}?`,{acao:"buscar",termo:nome});
        assert.match(r.texto,/não temos.*disponível/i);assert.doesNotMatch(r.texto,/4 embalagens disponíveis|Não encontrei|Gostaria de fazer/);
      }
      const r=await atender("Tem produto inexistente?",{acao:"buscar",termo:"Produto inexistente"});
      assert.match(r.texto,/Não encontrei esse produto no catálogo/);
    });
    await t.test("busca ampla só oferece o produto disponível e não troca apresentação específica",async()=>{
      assert.equal((await consultarProdutos(banco,admin,{termo:"DIP-30-TESTE"})).produtos[0].id,id);
      await salvarProduto(banco,admin,{id:null,atualizadoEm:null,produto:{...cadastro,apresentacao:"caixa com 30 comprimidos",preco:"5.00",sku:randomUUID()}});
      const r=await atender("Tem dipirona?",{acao:"buscar",termo:"Dipirona"});
      assert.match(r.mensagens[0],/R\$ 9,50/);assert.doesNotMatch(r.texto,/5,00|30 comprimidos|não temos/i);
      const exata=await atender("Tem dipirona caixa com 30 comprimidos?",{acao:"buscar",termo:"Dipirona 30 comprimidos"});
      assert.match(exata.texto,/não temos.*disponível/i);assert.doesNotMatch(exata.texto,/9,50|Gostaria de fazer/);
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
    });
    await t.test("atendente humano pausa a resposta automática antes de consultar a IA",async()=>{
      const conversa=(await cliente.query<{id:string}>("SELECT id FROM atendeia_conversations WHERE remote_jid=$1",[`${numero}@s.whatsapp.net`])).rows[0].id;
      await assumirConversa(banco,admin,{id:conversa,assumir:true});
      const antes=saidas.length;
      const r=await atender("Tem dipirona?",{acao:"buscar",termo:"Dipirona"});
      assert.equal(r.resultado,"pausada");assert.equal(saidas.length,antes);
      await assumirConversa(banco,admin,{id:conversa,assumir:false});
    });
    await t.test("dúvida clínica segue encaminhamento humano sem recomendar medicamento",async()=>{
      const r=await atender("Qual remédio devo tomar?",{acao:"humano"});
      assert.equal(r.texto,bot.transferNotice);assert.equal(transferencias,1);
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
  } finally {await cliente.close();}
});
