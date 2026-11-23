import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { autorizar, evento, travarEstoque, reservaAtiva, elegivel } from "./comum";

export const pagamentoSchema=z.strictObject({forma:z.enum(["pix","dinheiro","cartao"]),troco:z.enum(["pendente","nao","sim"]).default("pendente"),valor:z.string().regex(/^\d{1,9}\.\d{2}$/).default("0.00")});
export type Pagamento=z.infer<typeof pagamentoSchema>;
const nomeDestinatarioSchema=z.string().trim().min(2).max(100).regex(/^[\p{L}\p{M}]+(?:[ '’\-][\p{L}\p{M}]+){0,9}$/u);
const registroSchema=z.strictObject({id:z.uuid(),conversaId:z.uuid(),chave:z.string().min(8).max(220),etapa:z.enum(["adicionar","finalizar","pagamento","comprovante_pix","endereco_entrega","destinatario_entrega","revisar"]),pagamento:pagamentoSchema.optional(),endereco:z.string().trim().min(8).max(500).optional(),destinatario:nomeDestinatarioSchema.optional()});
export const perguntaEndereco = "Qual é o endereço da entrega? Envie rua, número, bairro e complemento, se houver.";
export const perguntaDestinatario = "Qual é o nome de quem vai receber o remédio?";

export interface DadosEntrega { temEndereco?:boolean; temDestinatario?:boolean }
// Renovar a reserva do mesmo carrinho não desfaz a finalização dos itens.
export const marcosFinalizacao = sql`tipo IN ('finalizar','itens_acrescentados','itens_corrigidos','revisar')`;
export class ReservaDoPedidoInvalida extends ErroDeNegocio {
  constructor() {
    super("A reserva do seu pedido não está mais válida. A equipe precisa reconfirmar a disponibilidade antes de continuar.");
  }
}

export function comPerguntaEntrega(mensagens:string[],dados:DadosEntrega) {
  const pergunta=dados.temEndereco?(dados.temDestinatario?undefined:perguntaDestinatario):perguntaEndereco;
  return {mensagens:pergunta?[...mensagens,pergunta]:mensagens};
}

export function podeColetarEntrega(pg:Pagamento|undefined,comprovante:boolean) {
  return comprovante||pg?.forma==="cartao"||(pg?.forma==="dinheiro"&&(pg.troco==="nao"||(pg.troco==="sim"&&pg.valor!=="0.00")));
}

const iniciosQueNaoSaoNomes=new Set(["ainda","bem","boa","bom","cade","cartao","como","dinheiro","endereco","entrega","eu","isso","ja","manda","me","meu","minha","nao","obrigado","obrigada","ok","ola","oi","onde","paguei","pagar","pix","pode","preciso","qual","quando","quem","quero","sim","ta","tem","troco","tudo","valor","vou"]);
export function destinatarioInformado(texto:string) {
  const resposta=texto.trim().replace(/^(?:(?:quem vai receber é|vai receber|a entrega é para|o nome é|meu nome é|me chamo|sou)\s+|(?:nome|destinat[aá]rio):\s*)/iu,"").replace(/[.!]+$/u,"").trim().replace(/ +/g," ");
  const inicio=resposta.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().split(" ")[0];
  if(iniciosQueNaoSaoNomes.has(inicio))return undefined;
  return nomeDestinatarioSchema.safeParse(resposta).data;
}

/** Preferência comercial no histórico; nunca comprova pagamento ou baixa estoque. */
export async function registrarEtapaPedido(banco:BancoSql,entrada:unknown) {
  const v=registroSchema.parse(entrada);
  return banco.transaction(async tx=>{
    await travarEstoque(tx);const autor=await autorizar(tx,{sistema:true},"operador",true);
    const [p]=linhas<{status:string;total:string}>(await tx.execute(sql`SELECT status,total::text FROM atendeia_pedidos WHERE id=${v.id} AND conversa_id=${v.conversaId} AND is_deleted=false FOR UPDATE`));
    if(!p||p.status!==(v.etapa==="revisar"?"aguardando_confirmacao":"aguardando_pagamento"))throw new ErroDeNegocio("Confirme primeiro os itens do pedido.");
    const chave=`fluxo:${v.chave}`;
    const [repetido]=linhas<{tipo:string;detalhe:string}>(await tx.execute(sql`SELECT tipo,detalhe FROM atendeia_pedidos_eventos WHERE pedido_id=${v.id} AND chave=${chave} AND is_deleted=false`));
    const detalhe=v.etapa==="pagamento"?JSON.stringify(pagamentoSchema.parse(v.pagamento))
      :v.etapa==="endereco_entrega"?registroSchema.shape.endereco.unwrap().parse(v.endereco)
      :v.etapa==="destinatario_entrega"?nomeDestinatarioSchema.parse(v.destinatario)
      :v.etapa==="comprovante_pix"?"Anexo recebido via WhatsApp. Confira o comprovante e o pagamento."
      :v.etapa==="revisar"?"Cliente recusou o resumo e deseja corrigir o pedido."
      :v.etapa==="adicionar"?"Cliente deseja acrescentar produtos.":"Itens concluídos; aguardando escolha do pagamento.";
    if(repetido){if(repetido.tipo!==v.etapa||repetido.detalhe!==detalhe)throw new ErroDeNegocio("Operação já utilizada com outros dados.");return p.total;}
    if(v.etapa==="finalizar"||v.etapa==="pagamento") {
      const invalidos=linhas(await tx.execute(sql`SELECT i.id FROM atendeia_pedidos_itens i WHERE i.pedido_id=${v.id} AND i.is_deleted=false AND i.quantidade<>(SELECT coalesce(sum(r.quantidade),0) FROM atendeia_pedidos_reservas r JOIN atendeia_produtos_lotes l ON l.id=r.lote_id JOIN atendeia_produtos p ON p.id=l.produto_id WHERE r.pedido_id=i.pedido_id AND p.id=i.produto_id AND ${reservaAtiva} AND ${elegivel})`));
      if(invalidos.length)throw new ReservaDoPedidoInvalida();
    }
    if(v.etapa==="pagamento") {
      const [finalizado]=linhas<{tipo:string}>(await tx.execute(sql`SELECT tipo FROM atendeia_pedidos_eventos WHERE pedido_id=${v.id} AND ${marcosFinalizacao} AND is_deleted=false ORDER BY created_at DESC,id DESC LIMIT 1`));
      if(finalizado?.tipo!=="finalizar")throw new ErroDeNegocio("Conclua a escolha dos itens antes do pagamento.");
      const pg=pagamentoSchema.parse(v.pagamento);
      if(pg.forma!=="dinheiro"&&(pg.troco!=="pendente"||pg.valor!=="0.00"))throw new ErroDeNegocio("Troco só se aplica ao pagamento em dinheiro.");
      if(pg.troco!=="sim"&&pg.valor!=="0.00")throw new ErroDeNegocio("Informe o valor somente quando precisar de troco.");
      if(pg.troco==="sim"&&pg.valor!=="0.00"&&BigInt(pg.valor.replace(".",""))<BigInt(p.total.replace(".","")))throw new ErroDeNegocio("O valor para troco precisa cobrir o total do pedido.");
    }
    if(v.etapa==="comprovante_pix"||v.etapa==="endereco_entrega"||v.etapa==="destinatario_entrega") {
      const [ultimo]=linhas<{tipo:string;detalhe:string}>(await tx.execute(sql`SELECT tipo,detalhe FROM atendeia_pedidos_eventos
        WHERE pedido_id=${v.id} AND is_deleted=false AND (${marcosFinalizacao} OR tipo IN ('pagamento','comprovante_pix'))
        ORDER BY created_at DESC,id DESC LIMIT 1`));
      const pg=ultimo?.tipo==="pagamento"?pagamentoSalvo(ultimo.detalhe):undefined;
      const permitido=v.etapa==="comprovante_pix"?pg?.forma==="pix":podeColetarEntrega(pg,ultimo?.tipo==="comprovante_pix");
      if(!permitido)throw new ErroDeNegocio("Conclua a etapa de pagamento antes de continuar.");
      if(v.etapa==="destinatario_entrega") {
        const endereco=linhas(await tx.execute(sql`SELECT id FROM atendeia_pedidos_eventos WHERE pedido_id=${v.id}
          AND tipo='endereco_entrega' AND is_deleted=false LIMIT 1`));
        if(!endereco.length)throw new ErroDeNegocio("Informe primeiro o endereço da entrega.");
      }
    }
    await evento(tx,autor,v.id,v.etapa,detalhe,chave);
    return p.total;
  });
}

export function pagamentoSalvo(detalhe?:string|null) {
  try { return pagamentoSchema.safeParse(JSON.parse(detalhe ?? "null")).data; }
  catch { return undefined; }
}

export function formaMencionada(texto:string):Pagamento["forma"]|undefined {
  const normalizado=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim().replace(/\s+/g," ");
  const chave=/^(?:(?:kd|cade|qual(?: e)?|(?:me )?(?:mande|envie|manda|passa|passe))\s+)?(?:a\s+)?chave\s+(?:(?:d[oe])\s+)?pix(?:[, ]+por favor)?[\s?!.:;]*$/;
  if(chave.test(normalizado))return "pix";
  const maquininha=/^(?:(?:(?:voces?|o entregador|o motoboy)\s+)?(?:pode\s+)?(?:traz(?:er|em)?|leva(?:r|m)?|manda(?:r)?|envia(?:r)?)\s+(?:a\s+|uma\s+)?|(?:quero|preciso de|tem)\s+(?:a\s+|uma\s+)?)?maquininha(?:\s+(?:de cartao|na entrega))?(?:[, ]+por favor)?[\s?!.]*$/;
  if(maquininha.test(normalizado))return "cartao";
  const pedido=/^(?:(?:quero|vou|prefiro|posso|pode ser|gostaria de)\s+(?:pagar\s+)?)?(?:(?:no|na|em|por|com|via)\s+)?(pix|dinheiro|cartao)(?:\s+(?:por favor|na entrega|de credito|de debito))?[\s?!.]*$/.exec(normalizado);
  return z.enum(["pix","dinheiro","cartao"]).safeParse(pedido?.[1]).data;
}

export function enderecoInformado(texto:string) {
  const endereco=texto.trim();
  const temLogradouro=/\b(?:rua|avenida|av\.?|travessa|alameda|estrada|rodovia|ladeira|pra[cç]a|quadra)\s+\S/iu.test(endereco);
  const temNumero=/\d|\bs\/?n\b/iu.test(endereco);
  return endereco.length>=8 && endereco.length<=500 && temLogradouro && temNumero;
}

export function valorParaTroco(texto:string) {
  const valor=/^(?:(?:troco\s+)?(?:pra|para)\s+)?(?:r\$\s*)?(\d{1,9})(?:[,.](\d{2}))?(?:\s+reais)?[\s!.]*$/iu.exec(texto.trim());
  return valor ? `${valor[1]}.${valor[2]??"00"}` : undefined;
}

const chaveDemonstracao = "Segue a chave Pix de demonstração. Chave fictícia: 99999999. Não faça transferência.";
const comprovanteDemonstracao = "Quando concluir a simulação, me envie o comprovante de teste para a gente finalizar o pedido e simular o envio para entrega.";
export function respostaPixSemPedido():{mensagens:string[]} {
  const aviso="Confirme os itens com a equipe para receber os dados de pagamento deste pedido.";
  return {mensagens:process.env.FARMACIA_PIX_CHAVE?.trim()?[aviso]:[chaveDemonstracao,comprovanteDemonstracao]};
}

export function respostaPagamento(pg:Pagamento,total:string,entrega:DadosEntrega={}):{mensagens:string[]} {
  if(pg.forma==="pix") {
    const chave=process.env.FARMACIA_PIX_CHAVE?.trim();
    const recebedor=process.env.FARMACIA_PIX_RECEBEDOR?.trim();
    const valor=`R$ ${total.replace(".",",")}`;
    if(!chave)return {mensagens:[
      chaveDemonstracao,
      `Valor simulado do pedido: ${valor}. Aguardando pagamento simulado.`,
      comprovanteDemonstracao,
    ]};
    return {mensagens:[chave,`Pagamento por Pix registrado. Valor do pedido: ${valor}. Aguardando pagamento.`,
      `${recebedor?`Recebedor: ${recebedor}. `:""}Quando concluir o pagamento, envie o comprovante aqui para a equipe conferir.`]};
  }
  if(pg.forma==="cartao")return comPerguntaEntrega(["O entregador levará a maquininha para você passar o cartão na hora da entrega.","Seu pedido está sendo preparado."],entrega);
  if(pg.troco==="pendente")return {mensagens:["O pagamento em dinheiro será feito na entrega. Você vai precisar de troco?"]};
  if(pg.troco==="sim"&&pg.valor==="0.00")return {mensagens:["Vai precisar de troco para qual valor?"]};
  return comPerguntaEntrega([pg.troco==="nao"?"Pagamento em dinheiro na entrega, sem troco, registrado no pedido.":`Troco para R$ ${pg.valor.replace(".",",")} registrado para a equipe.`],entrega);
}

export function descreverPagamento(detalhe:string):string {
  try {
    const p=pagamentoSchema.parse(JSON.parse(detalhe));
    return p.forma==="pix"?"Pix · aguardando conferência":p.forma==="cartao"?"Cartão na entrega · levar maquininha":`Dinheiro na entrega · ${p.troco==="nao"?"sem troco":p.troco==="sim"&&p.valor!=="0.00"?`troco para R$ ${p.valor.replace(".",",")}`:"troco a informar"}`;
  }catch{return "Preferência de pagamento indisponível.";}
}
