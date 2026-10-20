import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { ErroDeNegocio } from "../acao";
import type { AgentConfig } from "../agent/config";
import type { IncomingMessage } from "../agent/message";
import type { Turn, RespostaGerada } from "../agent/providers";
import { consultarProdutos, type Produto } from "./catalogo";
import { criarPedido, executarPedido } from "./pedidos";
import { listarPedidos } from "./consultas";
import { createHash } from "node:crypto";
import { intencaoSchema, interpretarIntencao, type ContextoFarmacia } from "./interpretar";
import { personaDoAgente } from "../agent/nome";
const sistema={sistema:true} as const;
export function respostaProduto(produtos:Produto[],total:number) {
  if(!produtos.length)return "Não encontrei esse produto no catálogo. Informe o nome, a concentração ou o código de barras. Posso encaminhar a consulta à equipe.";
  const lista=produtos.slice(0,8).map((p,i)=>`${i+1}. ${p.nome} ${p.concentracao} — ${p.apresentacao}, ${p.embalagem} por embalagem.\nR$ ${(p.promocional??p.preco).replace(".",",")} por embalagem · ${p.disponivel>0 ? `${p.disponivel} embalagens disponíveis.` : "Indisponível para venda neste momento."}${p.receita||p.controle ? "\nExige conferência humana de receita pelo farmacêutico antes da liberação." : ""}`);
  const proximo=produtos.slice(0,8).some(p=>p.disponivel>0)
    ? total>1 ? "Qual apresentação você deseja?" : "Deseja registrar um pedido?"
    : "Deseja falar com a equipe da farmácia sobre a possibilidade de reposição?";
  return `${lista.join("\n\n")}\n\n${proximo} Valores e saldo consultados agora; disponibilidade sujeita à reserva.`;
}
async function contextoDaConversa(banco:BancoSql,instancia:string,m:IncomingMessage):Promise<ContextoFarmacia> {
  const [c]=linhas<{id:string;contato_id:string}>(await banco.execute(sql`SELECT c.id,c.contact_id contato_id FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
    WHERE ch.instance_name=${instancia} AND ch.is_deleted=false AND c.remote_jid=${`${m.number}@s.whatsapp.net`} AND c.status<>'closed' AND c.is_deleted=false`));
  if(!c)throw new ErroDeNegocio("Conversa indisponível.");
  const produtos=linhas<ContextoFarmacia["produtos"][number]>(await banco.execute(sql`SELECT DISTINCT p.id,p.nome,p.concentracao,p.apresentacao FROM atendeia_produtos_consultas q
    JOIN atendeia_produtos p ON p.id=q.produto_id WHERE q.conversa_id=${c.id} AND q.created_at>now()-interval '24 hours' AND q.is_deleted=false AND p.is_deleted=false LIMIT 40`));
  const pedidos=linhas<ContextoFarmacia["pedidos"][number]>(await banco.execute(sql`SELECT id,numero,status FROM atendeia_pedidos WHERE conversa_id=${c.id} AND is_deleted=false ORDER BY created_at DESC LIMIT 10`));
  return {conversaId:c.id,contatoId:c.contato_id,produtos,pedidos};
}
export async function atenderIntencao(banco:BancoSql,contexto:ContextoFarmacia,intencao:unknown,identidade:string):Promise<RespostaGerada> {
  const a=intencaoSchema.parse(intencao);
  if(a.acao==="humano")return {transferir:true};
  if(a.acao==="saudacao")return "Olá! Sou a assistente virtual do Atende Aí Pharma. Qual medicamento ou produto você procura?";
  if(a.acao==="esclarecer")return {
    produto:"Qual medicamento ou produto você procura?",concentracao:"Qual concentração você procura?",
    apresentacao:"Qual apresentação você procura?",quantidade:"Quantas embalagens você deseja?",
    escolha:"Qual das apresentações consultadas você deseja?",
    "":"Informe o produto, a concentração, a apresentação e quantas embalagens deseja. Para dúvidas sobre tratamento ou receita, nossa equipe farmacêutica pode ajudar.",
  }[a.campo];
  if(a.acao==="buscar") {
    if(a.termo.trim().length<2)return "Qual medicamento ou produto você deseja consultar?";
    const r=await consultarProdutos(banco,sistema,{termo:a.termo});
    await banco.transaction(async tx=>{
      for(const produto of r.produtos.slice(0,8).length ? r.produtos.slice(0,8) : [null]) await tx.execute(sql`INSERT INTO atendeia_produtos_consultas(conversa_id,produto_id,termo,chave,modified_by)
        VALUES (${contexto.conversaId},${produto?.id??null},${a.termo},${`${identidade}:${produto?.id??"sem_resultado"}`},${systemUserId}) ON CONFLICT DO NOTHING`);
    });
    return respostaProduto(r.produtos,r.total);
  }
  if(a.acao==="criar_pedido") {
    if(!a.itens.length||a.itens.some(i=>!contexto.produtos.some(p=>p.id===i.produtoId)))return "Consulte primeiro os produtos e escolha a apresentação desejada.";
    const id=await criarPedido(banco,sistema,{contatoId:contexto.contatoId,conversaId:contexto.conversaId,chave:`ia:${identidade}`,itens:a.itens});
    const [p]=(await listarPedidos(banco,sistema,{id})).pedidos;
    return `Pedido ${p.numero} registrado:\n${p.itens.map(i=>`${i.quantidade} × ${i.descricao} — R$ ${i.preco.replace(".",",")} cada`).join("\n")}\nTotal: R$ ${p.total.replace(".",",")}.\nConfirma esses itens para reservar temporariamente? A venda e o pagamento ainda não foram confirmados.${p.itens.some(i=>i.receita) ? " A liberação exige conferência do farmacêutico." : ""}`;
  }
  if(!contexto.pedidos.some(p=>p.id===a.pedidoId))return "Não encontrei esse pedido neste atendimento. Nossa equipe pode ajudar.";
  if(a.acao==="reservar") {
    const hash=createHash("sha256").update(`reserva:${identidade}`).digest("hex");
    const chave=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
    await executarPedido(banco,sistema,{id:a.pedidoId,acao:"reservar",chave,referencia:"Itens confirmados no WhatsApp"});
  }
  const [p]=(await listarPedidos(banco,sistema,{id:a.pedidoId})).pedidos;
  return `Pedido ${p.numero}: ${p.status.split("_").join(" ")}. Total: R$ ${p.total.replace(".",",")}.${p.expira ? ` Reserva válida até ${new Date(p.expira).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (Brasília).` : ""}${p.status==="aguardando_pagamento" ? " A equipe precisa conferir o pagamento antes de confirmar a venda." : ""}`;
}
export function geradorFarmacia(banco:BancoSql,instancia:string,m:IncomingMessage,request=fetch) {
  return async(config:AgentConfig,historico:Turn[],texto:string):Promise<RespostaGerada>=>{
    try {
      const contexto=await contextoDaConversa(banco,instancia,m);
      const intencao=await interpretarIntencao(config,historico,texto,contexto,request);
      if(intencao.acao==="saudacao") {
        const persona=personaDoAgente(config.AI_SYSTEM_PROMPT);
        return persona ? `Olá! Sou ${persona}, assistente virtual do Atende Aí Pharma. Qual medicamento ou produto você procura?` : await atenderIntencao(banco,contexto,intencao,m.identity);
      }
      if(intencao.acao==="humano"&&config.atendimento?.transferHuman===false)return "Essa solicitação precisa da avaliação da equipe da farmácia. O encaminhamento automático está indisponível neste canal; procure o atendimento da farmácia para continuar.";
      return await atenderIntencao(banco,contexto,intencao,m.identity);
    }catch(e){
      if(e instanceof ErroDeNegocio)return `${e.message} Nossa equipe pode ajudar a concluir o atendimento.`;
      return "Não consegui consultar o sistema agora. Não posso confirmar preço, disponibilidade ou pedido. Tente novamente ou solicite atendimento humano.";
    }
  };
}
