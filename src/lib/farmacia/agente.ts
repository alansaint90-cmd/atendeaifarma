import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { ErroDeNegocio } from "../acao";
import type { AgentConfig } from "../agent/config";
import type { IncomingMessage } from "../agent/message";
import type { ContinuidadeEstoque, Turn, RespostaGerada } from "../agent/providers";
import { consultarProdutos, type Produto } from "./catalogo";
import { criarPedido, executarPedido } from "./pedidos";
import { listarPedidos } from "./consultas";
import { createHash } from "node:crypto";
import { intencaoSchema, interpretarIntencao, type ContextoFarmacia } from "./interpretar";
import { personaDoAgente } from "../agent/nome";
import { registrarEtapaPedido, respostaPagamento, respostaPixSemPedido, pagamentoSalvo, formaMencionada, enderecoInformado, destinatarioInformado,
  perguntaEndereco, perguntaDestinatario, comPerguntaEntrega, podeColetarEntrega, valorParaTroco, ReservaDoPedidoInvalida, marcosFinalizacao } from "./pagamento";
import { continuidadeDaConsulta, conviteContinuarPedido, descricaoComercial } from "./continuidade";
import { NOME_FARMACIA } from "./configuracao-agente";
const sistema={sistema:true} as const;
export function respostaProduto(produtos:Produto[],total:number):RespostaGerada {
  const disponiveis=produtos.filter(p=>p.ativo&&p.disponivel>0).slice(0,8);
  if(!disponiveis.length)return {mensagens:[],transferirEstoque:true};
  const lista=disponiveis.map(p=>{
    const embalagem=p.embalagem>1&&!/\d/.test(p.apresentacao)?` (${p.embalagem} unidades por embalagem)`:"";
    const descricao=descricaoComercial(p);
    return `${descricao}${embalagem}, por R$ ${(p.promocional??p.preco).replace(".",",")}.${p.receita||p.controle?" A liberação exige conferência de receita pelo farmacêutico.":""}`;
  });
  const oferta=lista.length===1?`Temos sim ${lista[0]}`:`Temos estas opções disponíveis:\n${lista.map(t=>`• ${t}`).join("\n")}`;
  return {mensagens:[`${oferta}${total>8?"\nHá outras apresentações disponíveis. Informe a concentração ou apresentação que procura.":""}`,
    "Gostaria de fazer o seu pedido ou acrescentar mais alguma coisa?"]};
}
async function contextoDaConversa(banco:BancoSql,instancia:string,m:IncomingMessage):Promise<ContextoFarmacia> {
  const [c]=linhas<{id:string;contato_id:string}>(await banco.execute(sql`SELECT c.id,c.contact_id contato_id FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
    WHERE ch.instance_name=${instancia} AND ch.is_deleted=false AND c.remote_jid=${`${m.number}@s.whatsapp.net`} AND c.status<>'closed' AND c.is_deleted=false`));
  if(!c)throw new ErroDeNegocio("Conversa indisponível.");
  const produtos=linhas<ContextoFarmacia["produtos"][number]>(await banco.execute(sql`SELECT p.id,p.nome,p.concentracao,p.apresentacao,
    to_char(max(q.created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "consultadoEm" FROM atendeia_produtos p
    LEFT JOIN atendeia_produtos_consultas q ON p.id=q.produto_id AND q.conversa_id=${c.id}
      AND q.created_at>now()-interval '24 hours' AND q.is_deleted=false
    WHERE p.is_deleted=false AND (q.id IS NOT NULL OR EXISTS(SELECT 1 FROM atendeia_pedidos_itens i JOIN atendeia_pedidos pedido ON pedido.id=i.pedido_id
      WHERE i.produto_id=p.id AND i.is_deleted=false AND pedido.is_deleted=false AND pedido.conversa_id=${c.id}
        AND pedido.status IN ('aguardando_confirmacao','aguardando_pagamento')))
    GROUP BY p.id,p.nome,p.concentracao,p.apresentacao ORDER BY max(q.created_at) DESC NULLS FIRST,p.id LIMIT 90`));
  const pedidos=linhas<ContextoFarmacia["pedidos"][number]>(await banco.execute(sql`SELECT p.id,p.numero,p.status,
    to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "atualizadoEm",
    (SELECT tipo FROM atendeia_pedidos_eventos e WHERE e.pedido_id=p.id AND e.is_deleted=false
      AND e.tipo NOT IN ('endereco_entrega','destinatario_entrega','adicionar','conferir')
      AND (e.tipo<>'reservar' OR compra.tipo IS DISTINCT FROM 'finalizar')
      ORDER BY e.created_at DESC,e.id DESC LIMIT 1) etapa,
    EXISTS(SELECT 1 FROM atendeia_pedidos_eventos e WHERE e.pedido_id=p.id AND e.tipo='endereco_entrega' AND e.is_deleted=false) "temEndereco",
    EXISTS(SELECT 1 FROM atendeia_pedidos_eventos e WHERE e.pedido_id=p.id AND e.tipo='destinatario_entrega' AND e.is_deleted=false) "temDestinatario",
    EXISTS(SELECT 1 FROM atendeia_pedidos_eventos e WHERE e.pedido_id=p.id AND e.tipo='destinatario_entrega'
      AND e.chave=${`fluxo:${m.identity}`} AND e.is_deleted=false) "destinatarioNestaMensagem",
    (SELECT detalhe FROM atendeia_pedidos_eventos e WHERE e.pedido_id=p.id AND e.tipo='pagamento' AND e.is_deleted=false ORDER BY e.created_at DESC,e.id DESC LIMIT 1) pagamento
    FROM atendeia_pedidos p
    LEFT JOIN LATERAL (SELECT tipo FROM atendeia_pedidos_eventos WHERE pedido_id=p.id AND is_deleted=false
      AND ${marcosFinalizacao} ORDER BY created_at DESC,id DESC LIMIT 1) compra ON true
    WHERE p.conversa_id=${c.id} AND p.is_deleted=false ORDER BY p.created_at DESC,p.id LIMIT 10`));
  return {conversaId:c.id,contatoId:c.contato_id,produtos,pedidos};
}
export async function atenderIntencao(banco:BancoSql,contexto:ContextoFarmacia,intencao:unknown,identidade:string,ajustarQuantidade=false):Promise<RespostaGerada> {
  const a=intencaoSchema.parse(intencao);
  if(a.acao==="humano")return {transferir:true};
  if(a.acao==="saudacao")return `Olá! Sou a assistente virtual da ${NOME_FARMACIA}. Qual medicamento ou produto você procura?`;
  if(a.acao==="esclarecer")return {
    produto:"Qual medicamento ou produto você procura?",concentracao:"Qual concentração você procura?",
    apresentacao:"Qual apresentação você procura?",quantidade:"Quantas embalagens você deseja?",
    escolha:"Qual das apresentações consultadas você deseja?",
    "":"Informe o produto, a concentração, a apresentação e quantas embalagens deseja. Para dúvidas sobre tratamento ou receita, nossa equipe farmacêutica pode ajudar.",
  }[a.campo];
  if(a.acao==="buscar") {
    if(a.termo.trim().length<2)return "Qual medicamento ou produto você deseja consultar?";
    const disponiveis=await consultarProdutos(banco,sistema,{termo:a.termo,disponibilidade:"disponivel"});
    const r=disponiveis.total?disponiveis:await consultarProdutos(banco,sistema,{termo:a.termo});
    const ofertados=r.produtos.filter(p=>p.ativo&&p.disponivel>0).slice(0,8);
    await banco.transaction(async tx=>{
      for(const produto of ofertados.length ? ofertados : [null]) await tx.execute(sql`INSERT INTO atendeia_produtos_consultas(conversa_id,produto_id,termo,chave,modified_by)
        VALUES (${contexto.conversaId},${produto?.id??null},${a.termo},${`${identidade}:${produto?.id??"sem_resultado"}`},${systemUserId}) ON CONFLICT DO NOTHING`);
    });
    return respostaProduto(r.produtos,r.total);
  }
  if(a.acao==="criar_pedido") {
    if(!a.itens.length||a.itens.some(i=>!contexto.produtos.some(p=>p.id===i.produtoId)))return "Consulte primeiro os produtos e escolha a apresentação desejada.";
    const pendente=contexto.pedidos.find(p=>["aguardando_confirmacao","aguardando_pagamento"].includes(p.status)&&(!a.pedidoId||p.id===a.pedidoId));
    if(a.pedidoId&&!pendente)return "Não encontrei esse pedido em andamento neste atendimento. Nossa equipe pode ajudar.";
    const id=await criarPedido(banco,sistema,{contatoId:contexto.contatoId,conversaId:contexto.conversaId,chave:`ia:${identidade}`,itens:a.itens},pendente?.id,ajustarQuantidade);
    const [p]=(await listarPedidos(banco,sistema,{id})).pedidos;
    return {mensagens:[`Pedido registrado:\n${p.itens.map(i=>`${i.quantidade} × ${i.descricao} — R$ ${i.preco.replace(".",",")} cada`).join("\n")}\nTotal: R$ ${p.total.replace(".",",")}.${p.itens.some(i=>i.receita)?" A liberação exige conferência do farmacêutico.":""}`,"Confirma os itens para fazer a compra?"]};
  }
  if(!contexto.pedidos.some(p=>p.id===a.pedidoId))return "Não encontrei esse pedido neste atendimento. Nossa equipe pode ajudar.";
  if(a.acao==="reservar") {
    const hash=createHash("sha256").update(`reserva:${identidade}`).digest("hex");
    const chave=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
    await executarPedido(banco,sistema,{id:a.pedidoId,acao:"reservar",chave,referencia:"Itens confirmados no WhatsApp"});
    return "Itens confirmados. Deseja acrescentar mais alguma coisa?";
  }
  if(a.acao==="adicionar"||a.acao==="finalizar"||a.acao==="pagamento") {
    const pg=a.pagamento&&a.pagamento.forma!=="dinheiro"?{...a.pagamento,troco:"pendente" as const,valor:"0.00"}:a.pagamento;
    const total=await registrarEtapaPedido(banco,{id:a.pedidoId,conversaId:contexto.conversaId,chave:identidade,etapa:a.acao,...(a.acao==="pagamento"?{pagamento:pg}:{} )});
    if(a.acao==="adicionar")return "Qual produto você deseja acrescentar ao pedido?";
    if(a.acao==="pagamento")return respostaPagamento(pg!,total,contexto.pedidos.find(p=>p.id===a.pedidoId));
    return {mensagens:["Pedido registrado, aguardando pagamento.","Qual forma de pagamento você prefere: Pix, dinheiro ou cartão?"]};
  }
  const [p]=(await listarPedidos(banco,sistema,{id:a.pedidoId})).pedidos;
  return `Seu pedido está ${p.status.split("_").join(" ")}. Total: R$ ${p.total.replace(".",",")}.${p.status==="aguardando_pagamento"?" O pagamento será conferido pela equipe.":""}`;
}
function pedidoEmPagamento(contexto:ContextoFarmacia) {
  const pendentes=contexto.pedidos.filter(p=>p.status==="aguardando_pagamento"&&
    ["finalizar","pagamento","comprovante_pix","pix_conferido"].includes(p.etapa??""));
  return pendentes.length===1?pendentes[0]:undefined;
}

const entregaRegistrada="Certo! Os dados de entrega já estão registrados e a equipe vai dar continuidade ao pedido.";
const encerramentoSemAlteracao=/^(?:ok(?:[, ]+(?:obrigad[oa]|valeu))?|okay|certo|beleza|obrigad[oa]|valeu|tudo certo|so (?:isso|esse mesmo|essa mesma|quero esse mesmo|quero essa mesma)|nao(?:[, ]+(?:so isso|so esse mesmo|so essa mesma))?)$/;

export async function responderComprovanteFarmacia(banco:BancoSql,instancia:string,m:IncomingMessage):Promise<RespostaGerada|null> {
  if(!m.midia)return null;
  const contexto=await contextoDaConversa(banco,instancia,m);
  const pedido=pedidoEmPagamento(contexto);
  if(!pedido)return null;
  if(pedido.etapa==="pix_conferido")return comPerguntaEntrega(["A equipe já confirmou o pagamento por Pix."],pedido);
  if(pedido.etapa!=="comprovante_pix")return null;
  const comprovante=linhas(await banco.execute(sql`SELECT id FROM atendeia_pedidos_eventos WHERE pedido_id=${pedido.id}
    AND tipo='comprovante_pix' AND chave=${`fluxo:${m.identity}`} AND is_deleted=false`));
  return comPerguntaEntrega([comprovante.length?"Recebi o anexo. A equipe vai conferir o comprovante.":"A equipe já recebeu um comprovante para conferência."],pedido);
}

export function geradorFarmacia(banco:BancoSql,instancia:string,m:IncomingMessage,request=fetch) {
  return async(config:AgentConfig,historico:Turn[],texto:string):Promise<RespostaGerada>=>{
    try {
      const contexto=await contextoDaConversa(banco,instancia,m);
      const textoNormal=normalizarPedido(texto);
      const pendentes=contexto.pedidos.filter(p=>["aguardando_confirmacao","aguardando_pagamento"].includes(p.status));
      const revisavel=pendentes.length===1&&pendentes[0].status==="aguardando_confirmacao"?pendentes[0]:undefined;
      const corrigir="Certo. Qual produto e quantidade você quer no pedido? Por exemplo: 1 dipirona.";
      if(revisavel&&/^(?:nao|nao esta certo|nao confirmo|esta errado)$/.test(textoNormal)) {
        await registrarEtapaPedido(banco,{id:revisavel.id,conversaId:contexto.conversaId,chave:m.identity,etapa:"revisar"});
        return corrigir;
      }
      const pedido=pedidoEmPagamento(contexto);
      const forma=formaMencionada(texto);
      if(forma==="pix"&&!pedido)return respostaPixSemPedido();
      if(forma==="cartao"&&!pedido)return "O pagamento com cartão pode ser feito na entrega, com maquininha. A equipe pode confirmar essa opção no seu pedido.";
      if(pedido) {
        const pg=pedido.etapa==="finalizar"?undefined:pagamentoSalvo(pedido.pagamento);
        const executarPagamento=(pagamento:unknown)=>atenderIntencao(banco,contexto,
          {acao:"pagamento",pedidoId:pedido.id,termo:"",itens:[],pagamento},m.identity);
        if(forma&&pedido.etapa==="pix_conferido") {
          return comPerguntaEntrega(["A equipe já confirmou o pagamento por Pix."],pedido);
        }
        if(forma==="pix"&&pg?.forma==="pix"&&pedido.etapa==="comprovante_pix") {
          return comPerguntaEntrega(["A equipe já recebeu o comprovante para conferência."],pedido);
        }
        if(forma==="cartao"&&pg?.forma==="cartao") {
          return comPerguntaEntrega(["O pagamento com cartão na entrega já está registrado. O entregador leva a maquininha."],pedido);
        }
        if(forma) {
          try { return await executarPagamento({forma}); }
          catch(erro) {
            if(forma==="pix"&&erro instanceof ErroDeNegocio&&!(erro instanceof ReservaDoPedidoInvalida))return respostaPixSemPedido();
            throw erro;
          }
        }
        if(pg?.forma==="dinheiro"&&pedido.etapa==="pagamento") {
          if(pg.valor==="0.00"&&pg.troco!=="nao") {
            if(/^(?:sim(?:[, ]+(?:preciso|por favor))?|preciso|vou precisar)[\s!.]*$/iu.test(texto.trim()))return await executarPagamento({forma:"dinheiro",troco:"sim"});
            if(/^(?:n[aã]o|sem troco|n[aã]o preciso)[\s!.]*$/iu.test(texto.trim()))return await executarPagamento({forma:"dinheiro",troco:"nao"});
          }
          const valor=valorParaTroco(texto);
          if(pg.troco!=="nao"&&valor)return await executarPagamento({forma:"dinheiro",troco:"sim",valor});
        }
        if(pedido.temEndereco&&pedido.temDestinatario&&encerramentoSemAlteracao.test(textoNormal))return entregaRegistrada;
        const coletarEntrega=podeColetarEntrega(pg,pedido.etapa==="comprovante_pix"||pedido.etapa==="pix_conferido");
        if(coletarEntrega&&enderecoInformado(texto)) {
          await registrarEtapaPedido(banco,{id:pedido.id,conversaId:contexto.conversaId,chave:m.identity,etapa:"endereco_entrega",endereco:texto});
          return comPerguntaEntrega(["Endereço registrado."],{...pedido,temEndereco:true});
        }
        if(coletarEntrega&&pedido.temEndereco&&(!pedido.temDestinatario||pedido.destinatarioNestaMensagem)) {
          const ultimaResposta=historico.findLast(turno=>turno.role==="assistant");
          const destinatario=ultimaResposta?.content.includes(perguntaDestinatario)||pedido.destinatarioNestaMensagem
            ?destinatarioInformado(texto):undefined;
          if(destinatario) {
            await registrarEtapaPedido(banco,{id:pedido.id,conversaId:contexto.conversaId,chave:m.identity,etapa:"destinatario_entrega",destinatario});
            return "Nome de quem vai receber registrado. A equipe vai dar continuidade à entrega.";
          }
          if(/^.{1,6}$/u.test(texto.trim()))return perguntaDestinatario;
        }
        if(coletarEntrega&&!pedido.temEndereco&&(/^.{1,6}$|\b(?:rua|avenida|bairro|cep|endere[cç]o)\b/iu.test(texto.trim())))return perguntaEndereco;
        if(pg?.forma==="pix"&&pedido.etapa==="pagamento"&&/^(?:j[aá]\s+)?(?:paguei|fiz o pix|pagamento (?:feito|conclu[ií]do))[\s!.]*$/iu.test(texto.trim())) {
          return "Envie o comprovante por aqui para a equipe conferir.";
        }
      }
      const consultar=(termo:string):RespostaGerada=>({consultarEstoque:termo.slice(0,120),continuidade:continuidadeDaConsulta(contexto,historico)});
      const escolha=/^(?:nao[, ]+)?(?:eu )?(?:quero|gostaria de|vou levar|pode colocar|coloque|deixe|ajuste para|acrescente|adicione)?\s*(?:(so|apenas|somente|mais)\s+)?(\d{1,4}|um|uma|dois|duas|tres|quatro|cinco)\s+(?:(?:caixas?|embalag(?:em|ens)|unidades?)\s+(?:de\s+)?)?(.+?)(?:\s+(?:so|apenas|somente|por favor))?$/.exec(textoNormal);
      if(escolha) {
        const termo=escolha[3];
        const candidatos=contexto.produtos.filter(p=>[p.nome,`${p.nome} ${p.concentracao}`,`${p.nome} ${p.concentracao} ${p.apresentacao}`].some(n=>normalizarPedido(n)===termo));
        if(!candidatos.length)return consultar(termo);
        if(candidatos.length!==1||pendentes.length>1)return "Qual apresentação e pedido você quer ajustar? Nossa equipe pode ajudar se houver mais de um pedido.";
        const numeros:Record<string,number>={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5};
        const quantidade=Number(escolha[2])||numeros[escolha[2]];
        if(!quantidade)return "Informe uma quantidade maior que zero.";
        const acrescentar=escolha[1]==="mais"||/\b(?:acrescente|adicione)\b/.test(textoNormal);
        return await atenderIntencao(banco,contexto,{acao:"criar_pedido",pedidoId:pendentes[0]?.id??"",termo:"",itens:[{produtoId:candidatos[0].id,quantidade}]},m.identity,!acrescentar&&pendentes.length===1);
      }
      const intencao=await interpretarIntencao(config,historico,texto,contexto,request);
      if(pedido?.temEndereco&&pedido.temDestinatario&&intencao.acao==="pagamento")return entregaRegistrada;
      if(pedido&&(intencao.acao==="adicionar"||intencao.acao==="finalizar")) {
        if(/^(?:(?:eu )?(?:quero|gostaria de|posso) )?(?:adicionar|acrescentar|incluir)(?: (?:algo|mais alguma coisa|mais um item))?$/.test(textoNormal)) {
          return "Qual produto você deseja acrescentar ao pedido?";
        }
        if(pedido.temEndereco&&pedido.temDestinatario)return entregaRegistrada;
        return "O pedido continua registrado. Você quer alterar algum item ou conferir o andamento?";
      }
      if(intencao.acao==="criar_pedido") {
        const pergunta=/^(?:voces? )?(?:tem disponivel|tem|ha|quanto custa|qual (?:e )?o preco d[oa]|consultar)\s+(.+)$/.exec(textoNormal);
        if(pergunta&&pergunta[1].length>=2)return consultar(pergunta[1]);
        if(/^[\p{L}\p{N} .-]{2,60}$/u.test(textoNormal)&&!/\b(?:quero|pedido|acrescentar|adicione|coloque|corrigir|confirmar)\b/.test(textoNormal))return consultar(texto);
        return "Para incluir ou corrigir um item, informe o nome e a quantidade. Por exemplo: 1 dipirona.";
      }
      if(intencao.acao==="reservar"&&(!revisavel||intencao.pedidoId!==revisavel.id||
        !/^(?:sim|confirmo|pode confirmar|pode fechar|esta certo|isso mesmo|correto)(?:[, ]+(?:pode confirmar|por favor|esta certo))?$/.test(textoNormal)))return corrigir;
      if(intencao.acao==="buscar"&&intencao.termo.trim().length>=2)return {
        consultarEstoque:intencao.termo.trim(),continuidade:continuidadeDaConsulta(contexto,historico)};
      if(intencao.acao==="saudacao") {
        const persona=personaDoAgente(config.AI_SYSTEM_PROMPT);
        return persona ? `Olá! Sou ${persona}, assistente virtual da ${NOME_FARMACIA}. Qual medicamento ou produto você procura?` : await atenderIntencao(banco,contexto,intencao,m.identity);
      }
      if(intencao.acao==="humano"&&config.atendimento?.transferHuman===false)return "Essa solicitação precisa da avaliação da equipe da farmácia. O encaminhamento automático está indisponível neste canal; procure o atendimento da farmácia para continuar.";
      return await atenderIntencao(banco,contexto,intencao,m.identity);
    }catch(e){
      if(e instanceof ReservaDoPedidoInvalida)return e.message;
      if(e instanceof ErroDeNegocio)return `${e.message} Nossa equipe pode ajudar a concluir o atendimento.`;
      return "Não consegui consultar o sistema agora. Não posso confirmar preço, disponibilidade ou pedido. Tente novamente ou solicite atendimento humano.";
    }
  };
}

function normalizarPedido(texto:string) {
  return texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim().replace(/[?!.]+$/g,"").replace(/\s+/g," ");
}

export function consultaEstoqueFarmacia(banco:BancoSql,instancia:string,m:IncomingMessage) {
  return async(termo:string,continuidade?:ContinuidadeEstoque):Promise<RespostaGerada>=>{
    const contexto=await contextoDaConversa(banco,instancia,m);
    const resposta=await atenderIntencao(banco,contexto,{acao:"buscar",termo,pedidoId:"",itens:[]},m.identity);
    if(continuidade&&typeof resposta!=="string"&&"mensagens" in resposta&&resposta.transferirEstoque) {
      const convite=await conviteContinuarPedido(banco,contexto.conversaId,continuidade);
      if(convite)return {mensagens:["No momento não temos esse produto disponível.",convite]};
    }
    return resposta;
  };
}
