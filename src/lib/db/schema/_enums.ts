/**
 * Enums do banco: `text` + CHECK, com a lista aqui. Nunca `pgEnum` —
 * acrescentar valor em pgEnum exige migracao que nao roda dentro de transacao.
 */

/** Do maior para o menor privilegio. A ordem define a hierarquia do RBAC. */
export const PAPEIS = ["super_admin", "admin", "operador", "visualizador"] as const;
export type Papel = (typeof PAPEIS)[number];
export const STATUS_OPORTUNIDADE = ["aberta", "ganha", "perdida"] as const;
export const STATUS_CONSULTA = ["confirmada", "cancelada"] as const;
export const STATUS_PEDIDO = ["novo", "aguardando_confirmacao", "aguardando_pagamento", "pagamento_confirmado", "em_separacao", "concluido", "cancelado"] as const;
export const STATUS_RESERVA = ["ativa", "consumida", "liberada", "expirada"] as const;
export const STATUS_ENVIO_FARMACIA = ["enviando", "enviado", "incerto"] as const;

/** Monta o CHECK de uma coluna enum a partir da lista (sem repetir os valores). */
export const listaSql = (valores: readonly string[]) =>
  valores.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
