import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunasAuditoria } from "./_compartilhado";
import { PAPEIS, listaSql } from "./_enums";

/**
 * Usuarios do sistema. Papel e `ativo` sao lidos DAQUI a cada requisicao —
 * nunca do token de sessao. Ao conectar a biblioteca de auth, aponte o model
 * de usuario dela para esta tabela (ou crie a FK da tabela dela para esta).
 */
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    // default = MENOR privilegio: linha criada fora da rota nunca nasce admin.
    papel: text("papel", { enum: PAPEIS }).notNull().default("visualizador"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasAuditoria,
  },
  (t) => [
    uniqueIndex("uq_usuarios_email_vivo").on(t.email).where(sql`is_deleted = false`),
    check("ck_usuarios_papel", sql.raw(`papel in (${listaSql(PAPEIS)})`)),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
