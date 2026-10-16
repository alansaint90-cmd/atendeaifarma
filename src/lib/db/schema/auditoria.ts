import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instante } from "./_compartilhado";
import { usuarios } from "./usuarios";

// compliance:append-only — trilha de auditoria: nao se altera nem se exclui,
// por isso nao tem updated_at/deleted_at/is_deleted. Em producao, revogue
// UPDATE e DELETE desta tabela do usuario de banco da aplicacao.
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
    acao: text("acao").notNull(),
    tabela: text("tabela").notNull(),
    registro_id: uuid("registro_id").notNull(),
    detalhes: text("detalhes").notNull(),
    dados_anteriores: jsonb("dados_anteriores"),
    dados_novos: jsonb("dados_novos"),
    created_at: instante("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_auditoria_registro").on(t.tabela, t.registro_id),
    index("idx_auditoria_usuario").on(t.user_id),
  ],
);
