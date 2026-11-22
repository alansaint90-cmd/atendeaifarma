import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { continuidadeEstoqueSchema, type ContinuidadeEstoque, type Turn } from "../agent/providers";
import type { ContextoFarmacia } from "./interpretar";
import { consultarProdutos } from "./catalogo";
import { elegivel, reservaAtiva } from "./comum";

type Identificacao = { nome: string; concentracao: string; apresentacao: string };
export const descricaoComercial = (produto: Identificacao) => [produto.nome, produto.concentracao, produto.apresentacao].filter(Boolean).join(" — ");

/** Uma oferta anterior permite perguntar pela compra, mas não equivale a um pedido criado. */
export function continuidadeDaConsulta(contexto: ContextoFarmacia, historico: Turn[]): ContinuidadeEstoque | undefined {
  const abertos = contexto.pedidos.filter(p => ["aguardando_confirmacao", "aguardando_pagamento"].includes(p.status));
  if (abertos.length === 1) return { produtoIds: [], pedidoId: abertos[0].id };
  if (abertos.length > 1 || contexto.pedidos.some(p => !p.atualizadoEm)) return undefined;
  const encerramentoAnterior = Math.max(0, ...contexto.pedidos.map(p => Date.parse(p.atualizadoEm!)));
  const oferta = [...historico].reverse().find(t => t.role === "assistant" && /(?:^|\n)Temos (?:sim |estas opções disponíveis:)/u.test(t.content));
  if (!oferta) return undefined;
  const produtoIds = contexto.produtos.filter(p => (!encerramentoAnterior || Date.parse(p.consultadoEm ?? "") > encerramentoAnterior)
    && (oferta.content.includes(`${descricaoComercial(p)}, por R$ `) || oferta.content.includes(`${descricaoComercial(p)} (`))).map(p => p.id).slice(0, 8);
  return produtoIds.length ? { produtoIds } : undefined;
}

/** Revalida os itens da própria conversa antes de convidar a continuar, sem reservar ou alterar pedido. */
export async function conviteContinuarPedido(banco: BancoSql, conversaId: string, entrada: ContinuidadeEstoque): Promise<string | null> {
  const continuidade = continuidadeEstoqueSchema.parse(entrada);
  type Item = Identificacao & { id: string; sku: string; quantidade: number };
  const itens = continuidade.pedidoId
    ? linhas<Item>(await banco.execute(sql`SELECT p.id,p.nome,p.concentracao,p.apresentacao,p.sku,i.quantidade
        FROM atendeia_pedidos o JOIN atendeia_pedidos_itens i ON i.pedido_id=o.id JOIN atendeia_produtos p ON p.id=i.produto_id
        WHERE o.id=${continuidade.pedidoId} AND o.conversa_id=${conversaId} AND o.status IN ('aguardando_confirmacao','aguardando_pagamento')
          AND o.is_deleted=false AND i.is_deleted=false AND p.is_deleted=false ORDER BY i.id`))
    : linhas<Item>(await banco.execute(sql`SELECT DISTINCT p.id,p.nome,p.concentracao,p.apresentacao,p.sku,1 quantidade
        FROM atendeia_produtos p JOIN atendeia_produtos_consultas q ON q.produto_id=p.id
        WHERE p.id IN (${sql.join(continuidade.produtoIds.map(id => sql`${id}`), sql`,`)}) AND q.conversa_id=${conversaId}
          AND q.created_at>now()-interval '24 hours' AND q.is_deleted=false AND p.is_deleted=false`));
  if (!itens.length) return null;
  if (continuidade.pedidoId) {
    const [total] = linhas<{ quantidade: number }>(await banco.execute(sql`SELECT count(i.id)::int quantidade FROM atendeia_pedidos o
      JOIN atendeia_pedidos_itens i ON i.pedido_id=o.id WHERE o.id=${continuidade.pedidoId} AND o.conversa_id=${conversaId}
        AND o.status IN ('aguardando_confirmacao','aguardando_pagamento') AND o.is_deleted=false AND i.is_deleted=false`));
    if (total.quantidade !== itens.length) return null;
  }
  const disponiveis: Item[] = [];
  for (const item of itens) {
    const atual = (await consultarProdutos(banco, { sistema: true }, { termo: item.sku })).produtos.find(p => p.id === item.id);
    const [propria] = continuidade.pedidoId ? linhas<{ quantidade: number }>(await banco.execute(sql`SELECT coalesce(sum(r.quantidade),0)::int quantidade
      FROM atendeia_pedidos_reservas r JOIN atendeia_produtos_lotes l ON l.id=r.lote_id JOIN atendeia_produtos p ON p.id=l.produto_id
      WHERE r.pedido_id=${continuidade.pedidoId} AND l.produto_id=${item.id} AND ${reservaAtiva} AND ${elegivel}`)) : [];
    if (atual?.ativo && atual.disponivel + (propria?.quantidade ?? 0) >= item.quantidade) disponiveis.push(item);
  }
  if (!disponiveis.length || (continuidade.pedidoId && disponiveis.length !== itens.length)) return null;
  if (!continuidade.pedidoId && disponiveis.length > 1) return "Qual das apresentações consultadas anteriormente você deseja escolher para o pedido?";
  const descricao = disponiveis.slice(0, 3).map(descricaoComercial).join(" e ");
  return `Gostaria de finalizar o seu pedido com ${descricao}${disponiveis.length > 3 ? " e os demais itens do pedido" : ""}?`;
}
