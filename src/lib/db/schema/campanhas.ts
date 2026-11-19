import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users, contacts } from "../schema";
import { colunasAuditoria, instante } from "./_compartilhado";
import { STATUS_CAMPANHA,STATUS_DESTINATARIO_CAMPANHA,listaSql } from "./_enums";
import type { ArquivoCampanha } from "../../farmacia/campanhas/schema";
export const campanhas = pgTable("atendeia_campanhas", {
 id: uuid("id").primaryKey(), nome: text("nome").notNull(), instancia: text("instancia").notNull(), mensagem: text("mensagem").notNull(), arquivo: jsonb("arquivo").$type<ArquivoCampanha>(),
 intervaloSegundos: integer("intervalo_segundos").notNull().default(10),
 status: text("status").notNull().default("rascunho"), version: integer("version").notNull().default(0), proximoEnvio: instante("proximo_envio").notNull().defaultNow(), ...colunasAuditoria,
 modified_by: uuid("modified_by").notNull().references(() => users.id, {onDelete: "restrict", onUpdate: "restrict"}),
}, t => [check("campanha_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_CAMPANHA))})`), check("campanha_intervalo", sql`${t.intervaloSegundos} BETWEEN 5 AND 3600`)]);
export const campanhaDestinatarios = pgTable("atendeia_campanhas_destinatarios", {
 id: uuid("id").primaryKey().defaultRandom(), campanhaId: uuid("campanha_id").notNull().references(() => campanhas.id, {onDelete: "restrict", onUpdate: "restrict"}),
 contatoId: uuid("contato_id").notNull().references(() => contacts.id, {onDelete: "restrict", onUpdate: "restrict"}), telefone: text("telefone").notNull(), status: text("status").notNull().default("pendente"),
 version: integer("version").notNull().default(0), iniciadoEm: instante("iniciado_em"), provedorId: text("provedor_id"), codigoErro: text("codigo_erro"), ...colunasAuditoria,
 modified_by: uuid("modified_by").notNull().references(() => users.id, {onDelete: "restrict", onUpdate: "restrict"}),
}, t => [uniqueIndex("campanha_contato_unico").on(t.campanhaId,t.contatoId), uniqueIndex("campanha_telefone_unico").on(t.campanhaId,t.telefone), index("campanha_fila").on(t.campanhaId,t.status),
 check("campanha_destinatario_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_DESTINATARIO_CAMPANHA))})`), check("campanha_telefone", sql`${t.telefone} ~ '^[+][1-9][0-9]{6,14}$'`)]);
