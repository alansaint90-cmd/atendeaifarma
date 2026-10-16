import { sql } from "drizzle-orm";
import { pgTable, uuid, text, date, check, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "../schema";
import { colunasAuditoria, instante } from "./_compartilhado";
import { STATUS_CONSULTA, listaSql } from "./_enums";

export const agendaHorarios = pgTable("atendeia_agenda_horarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  inicio: instante("inicio").notNull(), fim: instante("fim").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_agenda_horarios_inicio").on(t.inicio).where(sql`${t.is_deleted}=false`),
  check("atendeia_agenda_horarios_periodo", sql`${t.fim}>${t.inicio}`)]);

export const agendaReservas = pgTable("atendeia_agenda_horarios_reservas", {
  id: uuid("id").primaryKey().defaultRandom(),
  horarioId: uuid("horario_id").notNull().references(() => agendaHorarios.id, { onDelete: "restrict", onUpdate: "restrict" }),
  identidade: text("identidade").notNull(), origem: text("origem").notNull(), instancia: text("instancia").notNull(),
  nomeCompleto: text("nome_completo").notNull(), telefone: text("telefone").notNull(), nascimento: date("nascimento").notNull(),
  cep: text("cep").notNull(), rua: text("rua").notNull(), numero: text("numero").notNull(), complemento: text("complemento").notNull().default(""),
  bairro: text("bairro").notNull(), cidade: text("cidade").notNull(), uf: text("uf").notNull(),
  status: text("status", { enum: STATUS_CONSULTA }).notNull().default("confirmada"), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_agenda_reserva_identidade").on(t.identidade),
  uniqueIndex("atendeia_agenda_reserva_vaga").on(t.horarioId).where(sql`${t.is_deleted}=false AND ${t.status}='confirmada'`),
  index("atendeia_agenda_reserva_origem").on(t.origem),
  check("atendeia_agenda_reserva_status", sql`${t.status} IN (${sql.raw(listaSql(STATUS_CONSULTA))})`),
  check("atendeia_agenda_reserva_cadastro", sql`length(trim(${t.nomeCompleto}))>2 AND (${t.telefone}='' OR ${t.telefone} ~ '^[+][1-9][0-9]{6,14}$') AND (${t.cep}='' OR ${t.cep} ~ '^[0-9]{8}$') AND length(trim(${t.rua}))>0 AND length(trim(${t.numero}))>0 AND length(trim(${t.bairro}))>0 AND length(trim(${t.cidade}))>0 AND (${t.uf}='' OR ${t.uf} ~ '^[A-Z]{2}$')`)]);
