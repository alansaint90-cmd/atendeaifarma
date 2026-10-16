import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, boolean, date, check, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users, contacts, conversations } from "../schema";
import { colunasAuditoria, dinheiro, instante } from "./_compartilhado";
import { oportunidades } from "./crm";
import { listaSql, STATUS_PEDIDO, STATUS_RESERVA, STATUS_ENVIO_FARMACIA } from "./_enums";

const autor = () => uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" });
export const produtos = pgTable("atendeia_produtos", {
  id: uuid("id").defaultRandom().primaryKey(), nome: text("nome").notNull(), principio: text("principio").notNull().default(""),
  generico: text("generico").notNull().default(""), fabricante: text("fabricante").notNull().default(""), categoria: text("categoria").notNull(),
  concentracao: text("concentracao").notNull().default(""), apresentacao: text("apresentacao").notNull(), embalagem: integer("embalagem").notNull(),
  ean: text("ean"), sku: text("sku").notNull(), preco: dinheiro("preco").notNull(), promocional: dinheiro("promocional"),
  minimo: integer("minimo").notNull().default(0), receita: boolean("receita").notNull().default(false), controle: text("controle").notNull().default(""),
  ativo: boolean("ativo").notNull().default(true), medicamento: boolean("medicamento").notNull().default(true),
  observacoes: text("observacoes").notNull().default(""), aliases: text("aliases").notNull().default(""),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_produto_sku").on(t.sku).where(sql`${t.is_deleted}=false`),
  uniqueIndex("farmacia_produto_ean").on(t.ean).where(sql`${t.is_deleted}=false AND ${t.ean} IS NOT NULL`),
  check("farmacia_produto_valores", sql`${t.preco}>0 AND (${t.promocional} IS NULL OR (${t.promocional}>0 AND ${t.promocional}<=${t.preco})) AND ${t.minimo}>=0 AND ${t.embalagem}>0`)]);

export const lotes = pgTable("atendeia_produtos_lotes", {
  id: uuid("id").defaultRandom().primaryKey(), produtoId: uuid("produto_id").notNull().references(() => produtos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  codigo: text("codigo").notNull(), validade: date("validade"), quantidade: integer("quantidade").notNull().default(0),
  bloqueado: boolean("bloqueado").notNull().default(false), ...colunasAuditoria, modified_by: autor(),
}, t => [check("farmacia_lote_saldo", sql`${t.quantidade}>=0`), index("farmacia_lote_fefo").on(t.produtoId, t.validade)]);

export const pedidos = pgTable("atendeia_pedidos", {
  id: uuid("id").defaultRandom().primaryKey(), numero: text("numero").notNull(),
  contatoId: uuid("contato_id").notNull().references(() => contacts.id, { onDelete: "restrict", onUpdate: "restrict" }),
  conversaId: uuid("conversa_id").references(() => conversations.id, { onDelete: "restrict", onUpdate: "restrict" }),
  responsavelId: uuid("responsavel_id").references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  status: text("status").notNull().default("novo"), origem: text("origem").notNull(), total: dinheiro("total").notNull(),
  chave: text("chave").notNull(), referencia: text("referencia"), confirmadoEm: instante("confirmado_em"),
  conferidoPor: uuid("conferido_por").references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  conferencia: text("conferencia"), ...colunasAuditoria, modified_by: autor(),
  oportunidadeId: uuid("oportunidade_id").references(() => oportunidades.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("farmacia_pedido_chave").on(t.chave), uniqueIndex("farmacia_pedido_numero").on(t.numero),
  check("farmacia_pedido_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_PEDIDO))})`),
  check("farmacia_pedido_total", sql`${t.total}>0`)]);

export const itensPedido = pgTable("atendeia_pedidos_itens", {
  id: uuid("id").defaultRandom().primaryKey(), pedidoId: uuid("pedido_id").notNull().references(() => pedidos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  produtoId: uuid("produto_id").notNull().references(() => produtos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  quantidade: integer("quantidade").notNull(), preco: dinheiro("preco").notNull(), descricao: text("descricao").notNull(),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_item_produto").on(t.pedidoId,t.produtoId), check("farmacia_item_valores", sql`${t.quantidade}>0 AND ${t.preco}>0`)]);

export const reservas = pgTable("atendeia_pedidos_reservas", {
  id: uuid("id").defaultRandom().primaryKey(), pedidoId: uuid("pedido_id").notNull().references(() => pedidos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  loteId: uuid("lote_id").notNull().references(() => lotes.id, { onDelete: "restrict", onUpdate: "restrict" }),
  quantidade: integer("quantidade").notNull(), expiraEm: instante("expira_em").notNull(), status: text("status").notNull().default("ativa"),
  ...colunasAuditoria, modified_by: autor(),
}, t => [check("farmacia_reserva_quantidade", sql`${t.quantidade}>0`),
  check("farmacia_reserva_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_RESERVA))})`), index("farmacia_reserva_lote").on(t.loteId,t.expiraEm)]);

export const movimentos = pgTable("atendeia_produtos_movimentos", {
  id: uuid("id").defaultRandom().primaryKey(), loteId: uuid("lote_id").notNull().references(() => lotes.id, { onDelete: "restrict", onUpdate: "restrict" }),
  pedidoId: uuid("pedido_id").references(() => pedidos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  quantidade: integer("quantidade").notNull(), anterior: integer("anterior").notNull(), posterior: integer("posterior").notNull(),
  tipo: text("tipo").notNull(), motivo: text("motivo").notNull(), chave: text("chave").notNull(),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_movimento_chave").on(t.chave), check("farmacia_movimento_saldo", sql`${t.anterior}>=0 AND ${t.posterior}>=0 AND ${t.posterior}=${t.anterior}+${t.quantidade}`)]);

export const eventosPedido = pgTable("atendeia_pedidos_eventos", {
  id: uuid("id").defaultRandom().primaryKey(), pedidoId: uuid("pedido_id").notNull().references(() => pedidos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  tipo: text("tipo").notNull(), detalhe: text("detalhe").notNull(), chave: text("chave").notNull(),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_evento_chave").on(t.chave)]);

export const farmaceuticos = pgTable("atendeia_farmaceuticos", {
  id: uuid("id").defaultRandom().primaryKey(), usuarioId: uuid("usuario_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  registro: text("registro").notNull(), habilitado: boolean("habilitado").notNull().default(false),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_farmaceutico_usuario").on(t.usuarioId)]);

export const consultasProduto = pgTable("atendeia_produtos_consultas", {
  id: uuid("id").defaultRandom().primaryKey(), conversaId: uuid("conversa_id").notNull().references(() => conversations.id, { onDelete: "restrict", onUpdate: "restrict" }),
  produtoId: uuid("produto_id").references(() => produtos.id, { onDelete: "restrict", onUpdate: "restrict" }),
  termo: text("termo").notNull(), chave: text("chave").notNull(), ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_consulta_chave").on(t.chave)]);

export const enviosAtendimento = pgTable("atendeia_atendimento_envios", {
  id: uuid("id").defaultRandom().primaryKey(), conversaId: uuid("conversa_id").notNull().references(() => conversations.id, { onDelete: "restrict", onUpdate: "restrict" }),
  chave: uuid("chave").notNull(), status: text("status").notNull().default("enviando"), provedorId: text("provedor_id"),
  ...colunasAuditoria, modified_by: autor(),
}, t => [uniqueIndex("farmacia_atendimento_chave").on(t.chave),check("farmacia_atendimento_status",sql`${t.status} IN (${sql.raw(listaSql(STATUS_ENVIO_FARMACIA))})`)]);
