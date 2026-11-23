import type { ContinuidadeEstoque, Turn } from "../agent/providers";
import type { ContextoFarmacia } from "./interpretar";

type Identificacao = { nome: string; concentracao: string; apresentacao: string };
export const descricaoComercial = (produto: Identificacao) => [produto.nome, produto.concentracao, produto.apresentacao].filter(Boolean).join(" — ");

/** Ofertas e pedidos anteriores só identificam a consulta curta, sem sugerir itens. */
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
