import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "../schema";

import { instante, colunasAuditoria } from "./_compartilhado";

export const passkeys = pgTable("atendeia_users_passkeys", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  credencialId: text("credencial_id").notNull(), chavePublica: text("chave_publica").notNull(), contador: bigint("contador", { mode: "number" }).notNull().default(0),
  nome: text("nome").notNull(), ...colunasAuditoria, modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_passkey_credencial").on(t.credencialId)]);
export const convites = pgTable("atendeia_users_convites", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  tokenHash: text("token_hash").notNull(), expiraEm: instante("expira_em").notNull(), usadoEm: instante("usado_em"), ...colunasAuditoria, modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_convite_hash").on(t.tokenHash)]);
export const desafios = pgTable("atendeia_auth_desafios", {
  id: uuid("id").defaultRandom().primaryKey(), tokenHash: text("token_hash").notNull(), challenge: text("challenge").notNull(),
  finalidade: text("finalidade").notNull(), userId: uuid("user_id").references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
  conviteId: uuid("convite_id").references(() => convites.id, { onDelete: "restrict", onUpdate: "restrict" }),
  expiraEm: instante("expira_em").notNull(), usadoEm: instante("usado_em"), ...colunasAuditoria, modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_desafio_hash").on(t.tokenHash), index("atendeia_desafio_expira").on(t.expiraEm)]);
export const limitesAuth = pgTable("atendeia_auth_limites", {
  id: uuid("id").defaultRandom().primaryKey(), chave: text("chave").notNull(), janela: instante("janela").notNull(),
  tentativas: integer("tentativas").notNull().default(0), ...colunasAuditoria, modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_auth_limite_chave").on(t.chave).where(sql`${t.is_deleted}=false`)]);
