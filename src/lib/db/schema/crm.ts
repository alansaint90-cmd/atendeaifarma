import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users, contacts, channels, tags } from "../schema";
import { colunasAuditoria, dinheiro, instante } from "./_compartilhado";
import { STATUS_OPORTUNIDADE, listaSql } from "./_enums";

export const funis = pgTable("atendeia_funis", {
  id: uuid("id").defaultRandom().primaryKey(), nome: text("nome").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_funis_nome").on(sql`lower(${t.nome})`).where(sql`${t.is_deleted}=false`)]);
export const etapas = pgTable("atendeia_funis_etapas", {
  id: uuid("id").defaultRandom().primaryKey(), funilId: uuid("funil_id").notNull().references(() => funis.id, { onDelete: "restrict", onUpdate: "restrict" }),
  nome: text("nome").notNull(), ordem: integer("ordem").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_etapas_ordem").on(t.funilId, t.ordem).where(sql`${t.is_deleted}=false`), check("atendeia_etapa_ordem", sql`${t.ordem}>=0`)]);
export const acessosFunis = pgTable("atendeia_funis_acessos", {
  id: uuid("id").defaultRandom().primaryKey(), funilId: uuid("funil_id").notNull().references(() => funis.id, { onDelete: "restrict", onUpdate: "restrict" }),
  usuarioId: uuid("usuario_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_funil_acesso").on(t.funilId, t.usuarioId).where(sql`${t.is_deleted}=false`), index("atendeia_acessos_usuario").on(t.usuarioId)]);
export const motivosPerda = pgTable("atendeia_motivos_perda", {
  id: uuid("id").defaultRandom().primaryKey(), nome: text("nome").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_motivos_nome").on(sql`lower(${t.nome})`).where(sql`${t.is_deleted}=false`)]);
export const oportunidades = pgTable("atendeia_funis_oportunidades", {
  id: uuid("id").defaultRandom().primaryKey(), titulo: text("titulo").notNull(), valor: dinheiro("valor").notNull().default("0.00"),
  funilId: uuid("funil_id").notNull().references(() => funis.id, { onDelete: "restrict", onUpdate: "restrict" }),
  etapaId: uuid("etapa_id").notNull().references(() => etapas.id, { onDelete: "restrict", onUpdate: "restrict" }),
  contatoId: uuid("contato_id").references(() => contacts.id, { onDelete: "restrict", onUpdate: "restrict" }),
  canalId: uuid("canal_id").references(() => channels.id, { onDelete: "restrict", onUpdate: "restrict" }),
  responsavelId: uuid("responsavel_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  status: text("status", { enum: STATUS_OPORTUNIDADE }).notNull().default("aberta"), fechadoEm: instante("fechado_em"),
  motivoId: uuid("motivo_id").references(() => motivosPerda.id, { onDelete: "restrict", onUpdate: "restrict" }),
  observacao: text("observacao"), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [index("atendeia_oportunidades_funil_status").on(t.funilId,t.status), index("atendeia_oportunidades_fechamento").on(t.fechadoEm),
  check("atendeia_oportunidade_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_OPORTUNIDADE))})`),
  check("atendeia_oportunidade_valor", sql`${t.valor}>=0`),
  check("atendeia_oportunidade_fechamento", sql`(${t.status}='aberta' AND ${t.fechadoEm} IS NULL AND ${t.motivoId} IS NULL) OR (${t.status}='ganha' AND ${t.fechadoEm} IS NOT NULL AND ${t.motivoId} IS NULL) OR (${t.status}='perdida' AND ${t.fechadoEm} IS NOT NULL AND ${t.motivoId} IS NOT NULL)`)]);
export const oportunidadesTags = pgTable("atendeia_funis_oportunidades_tags", {
  id: uuid("id").defaultRandom().primaryKey(), oportunidadeId: uuid("oportunidade_id").notNull().references(() => oportunidades.id, { onDelete: "restrict", onUpdate: "restrict" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "restrict", onUpdate: "restrict" }), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_oportunidade_tag").on(t.oportunidadeId,t.tagId).where(sql`${t.is_deleted}=false`)]);
export const fechamentos = pgTable("atendeia_funis_oportunidades_fechamentos", {
  id: uuid("id").defaultRandom().primaryKey(), oportunidadeId: uuid("oportunidade_id").notNull().references(() => oportunidades.id, { onDelete: "restrict", onUpdate: "restrict" }),
  funilId: uuid("funil_id").notNull().references(() => funis.id, { onDelete: "restrict", onUpdate: "restrict" }),
  etapaAnteriorId: uuid("etapa_anterior_id").notNull().references(() => etapas.id, { onDelete: "restrict", onUpdate: "restrict" }),
  responsavelId: uuid("responsavel_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  valor: dinheiro("valor").notNull(), status: text("status").notNull(), motivo: text("motivo"), observacao: text("observacao"), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_fechamento_oportunidade").on(t.oportunidadeId), check("atendeia_fechamento_status", sql`${t.status} IN ('ganha','perdida')`)]);
