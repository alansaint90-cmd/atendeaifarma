import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { autorizar, evento, travarEstoque, reservaAtiva, elegivel } from "./comum";

export const pagamentoSchema=z.strictObject({forma:z.enum(["pix","dinheiro","cartao"]),troco:z.enum(["pendente","nao","sim"]).default("pendente"),valor:z.string().regex(/^\d{1,9}\.\d{2}$/).default("0.00")});
export type Pagamento=z.infer<typeof pagamentoSchema>;
const registroSchema=z.strictObject({id:z.uuid(),conversaId:z.uuid(),chave:z.string().min(8).max(220),etapa:z.enum(["adicionar","finalizar","pagamento"]),pagamento:pagamentoSchema.optional()});

/** Preferência comercial no histórico; nunca comprova pagamento ou baixa estoque. */
export async function registrarEtapaPedido(banco:BancoSql,entrada:unknown) {
  const v=registroSchema.parse(entrada);
  return banco.transaction(async tx=>{
    await travarEstoque(tx);const autor=await autorizar(tx,{sistema:true},"operador",true);
    const [p]=linhas<{status:string;total:string}>(await tx.execute(sql`SELECT status,total::text FROM atendeia_pedidos WHERE id=${v.id} AND conversa_id=${v.conversaId} AND is_deleted=false FOR UPDATE`));
    if(!p||p.status!=="aguardando_pagamento")throw new ErroDeNegocio("Confirme primeiro os itens do pedido.");
    const chave=`fluxo:${v.chave}`;
    const [repetido]=linhas<{tipo:string;detalhe:string}>(await tx.execute(sql`SELECT tipo,detalhe FROM atendeia_pedidos_eventos WHERE pedido_id=${v.id} AND chave=${chave} AND is_deleted=false`));
    const detalhe=v.etapa==="pagamento"?JSON.stringify(pagamentoSchema.parse(v.pagamento)):v.etapa==="adicionar"?"Cliente deseja acrescentar produtos.":"Itens concluídos; aguardando escolha do pagamento.";
    if(repetido){if(repetido.tipo!==v.etapa||repetido.detalhe!==detalhe)throw new ErroDeNegocio("Operação já utilizada com outros dados.");return;}
    if(v.etapa!=="adicionar") {
      const invalidos=linhas(await tx.execute(sql`SELECT i.id FROM atendeia_pedidos_itens i WHERE i.pedido_id=${v.id} AND i.is_deleted=false AND i.quantidade<>(SELECT coalesce(sum(r.quantidade),0) FROM atendeia_pedidos_reservas r JOIN atendeia_produtos_lotes l ON l.id=r.lote_id JOIN atendeia_produtos p ON p.id=l.produto_id WHERE r.pedido_id=i.pedido_id AND p.id=i.produto_id AND ${reservaAtiva} AND ${elegivel})`));
      if(invalidos.length)throw new ErroDeNegocio("Preciso reconfirmar a disponibilidade dos itens com a equipe antes de continuar.");
    }
    if(v.etapa==="pagamento") {
      const [finalizado]=linhas<{tipo:string}>(await tx.execute(sql`SELECT tipo FROM atendeia_pedidos_eventos WHERE pedido_id=${v.id} AND tipo IN ('finalizar','reservar','itens_acrescentados','adicionar') AND is_deleted=false ORDER BY created_at DESC,id DESC LIMIT 1`));
      if(finalizado?.tipo!=="finalizar")throw new ErroDeNegocio("Conclua a escolha dos itens antes do pagamento.");
      const pg=pagamentoSchema.parse(v.pagamento);
      if(pg.forma!=="dinheiro"&&(pg.troco!=="pendente"||pg.valor!=="0.00"))throw new ErroDeNegocio("Troco só se aplica ao pagamento em dinheiro.");
      if(pg.troco!=="sim"&&pg.valor!=="0.00")throw new ErroDeNegocio("Informe o valor somente quando precisar de troco.");
      if(pg.troco==="sim"&&pg.valor!=="0.00"&&BigInt(pg.valor.replace(".",""))<BigInt(p.total.replace(".","")))throw new ErroDeNegocio("O valor para troco precisa cobrir o total do pedido.");
    }
    await evento(tx,autor,v.id,v.etapa,detalhe,chave);
  });
}

export function respostaPagamento(pg:Pagamento) {
  if(pg.forma==="pix") {
    const chave=process.env.FARMACIA_PIX_CHAVE?.trim();
    const recebedor=process.env.FARMACIA_PIX_RECEBEDOR?.trim();
    return chave?`Pagamento por Pix.\nChave Pix: ${chave}\n${recebedor?`Recebedor: ${recebedor}.`:"Confira o recebedor no seu banco antes de pagar."}\nApós o pagamento, envie o comprovante para conferência da equipe.`:"Pagamento por Pix registrado. A equipe da farmácia vai informar a chave para pagamento.";
  }
  if(pg.forma==="cartao")return "Pagamento por cartão na entrega registrado. O entregador levará a maquininha de cartão.";
  if(pg.troco==="pendente")return "O pagamento em dinheiro será feito na entrega. Vai precisar de troco?";
  if(pg.troco==="sim"&&pg.valor==="0.00")return "Vai precisar de troco para qual valor?";
  return pg.troco==="nao"?"Pagamento em dinheiro na entrega, sem troco, registrado no pedido.":`Pagamento em dinheiro na entrega registrado. Troco para R$ ${pg.valor.replace(".",",")}.`;
}

export function descreverPagamento(detalhe:string):string {
  try {
    const p=pagamentoSchema.parse(JSON.parse(detalhe));
    return p.forma==="pix"?"Pix · aguardando conferência":p.forma==="cartao"?"Cartão na entrega · levar maquininha":`Dinheiro na entrega · ${p.troco==="nao"?"sem troco":p.troco==="sim"&&p.valor!=="0.00"?`troco para R$ ${p.valor.replace(".",",")}`:"troco a informar"}`;
  }catch{return "Preferência de pagamento indisponível.";}
}
