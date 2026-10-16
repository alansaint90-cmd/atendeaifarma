import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { Chatbot } from "../chatbots/schema";
import { colunasAuditoria, instante } from "./schema/_compartilhado";
export * from "./schema/identidade";
export * from "./schema/crm";
export * from "./schema/agenda-consultas";
export * from "./schema/farmacia";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  version: integer("version").notNull().default(0),
});
export const users = pgTable("atendeia_users", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), email: text("email"),
  phone: text("phone"), avatarData: text("avatar_data"),
  passwordHash: text("password_hash"), role: text("role").notNull().default("visualizador"),
  enabled: boolean("enabled").notNull().default(false),
  ...timestamps(), modifiedBy: uuid("modified_by").notNull().references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
}, table => [
  uniqueIndex("atendeia_users_email_active").on(sql`lower(${table.email})`).where(sql`${table.isDeleted} = false`),
  check("atendeia_users_role", sql`${table.role} IN ('super_admin', 'admin', 'operador', 'visualizador')`),
]);
const audit = () => ({ ...timestamps(), modifiedBy: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict" }) });
const id = () => uuid("id").primaryKey().defaultRandom();

export const webhookRecebimentos = pgTable("atendeia_webhook_recebimentos", {
  id: id(), identidade: text("identidade").notNull(), ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_webhook_recebimentos_identidade").on(t.identidade)]);

export const agendamentos = pgTable("atendeia_agendamentos", {
  id: id(), telefone: text("telefone").notNull(), instancia: text("instancia").notNull(), mensagem: text("mensagem").notNull(),
  agendadoPara: instante("agendado_para").notNull(), status: text("status").notNull().default("pendente"),
  iniciadoEm: instante("iniciado_em"), enviadoEm: instante("enviado_em"), provedorId: text("provedor_id"),
  codigoErro: text("codigo_erro"), version: integer("version").notNull().default(0),
  ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [index("atendeia_agendamentos_pendentes").on(t.agendadoPara).where(sql`${t.is_deleted}=false AND ${t.status}='pendente'`),
  check("atendeia_agendamentos_status", sql`${t.status} IN ('pendente','enviando','enviado','cancelado','incerto','erro')`),
  check("atendeia_agendamentos_telefone", sql`${t.telefone} ~ '^[+][1-9][0-9]{6,14}$'`)]);

export const sessions = pgTable("atendeia_sessions", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), ...audit(),
}, t => [uniqueIndex("atendeia_sessions_token").on(t.tokenHash), index("atendeia_sessions_expiry").on(t.expiresAt)]);

export const departments = pgTable("atendeia_departments", { id: id(), name: text("name").notNull(), ...audit() },
  t => [uniqueIndex("atendeia_department_name").on(sql`lower(${t.name})`).where(sql`${t.isDeleted} = false`)]);
export const departmentMembers = pgTable("atendeia_department_members", {
  id: id(), departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }), ...audit(),
}, t => [uniqueIndex("atendeia_department_member_active").on(t.departmentId, t.userId).where(sql`${t.isDeleted} = false`)]);

export const contacts = pgTable("atendeia_contacts", {
  id: id(), name: text("name").notNull(), phone: text("phone"), email: text("email"),
  source: text("source"), leadStatus: text("lead_status").notNull().default("novo"),
  score: integer("score").notNull().default(0), notes: text("notes"), ...audit(),
}, t => [
  uniqueIndex("atendeia_contact_phone_active").on(t.phone).where(sql`${t.isDeleted} = false`),
  check("atendeia_contact_score", sql`${t.score} BETWEEN 0 AND 100`),
  check("atendeia_contact_phone", sql`${t.phone} IS NULL OR ${t.phone} ~ '^[+][1-9][0-9]{6,14}$'`),
]);
export const tags = pgTable("atendeia_tags", { id: id(), name: text("name").notNull(), color: text("color").notNull().default("#10b981"), ...audit() },
  t => [uniqueIndex("atendeia_tag_name_active").on(sql`lower(${t.name})`).where(sql`${t.isDeleted} = false`)]);
export const contactTags = pgTable("atendeia_contact_tags", {
  id: id(), contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "restrict" }), ...audit(),
}, t => [uniqueIndex("atendeia_contact_tag_active").on(t.contactId, t.tagId).where(sql`${t.isDeleted} = false`)]);

export const chatbots = pgTable("atendeia_chatbots", {
  id: id(), identifier: text("identifier").notNull(), enabled: boolean("enabled").notNull().default(false),
  // Complete configuration is validated with chatbotSchema before persistence.
  configuration: jsonb("configuration").$type<Chatbot>().notNull(), ...audit(),
}, t => [uniqueIndex("atendeia_chatbot_identifier_active").on(sql`lower(${t.identifier})`).where(sql`${t.isDeleted} = false`),
  check("atendeia_chatbot_configuration", sql`jsonb_typeof(${t.configuration}) = 'object'`)]);
export const flows = pgTable("atendeia_flows", {
  id: id(), chatbotId: uuid("chatbot_id").references(() => chatbots.id, { onDelete: "restrict" }),
  name: text("name").notNull(), description: text("description").notNull(),
  definition: jsonb("definition").notNull().default({}), enabled: boolean("enabled").notNull().default(false), ...audit(),
}, t => [index("atendeia_flows_chatbot").on(t.chatbotId)]);
export const channels = pgTable("atendeia_channels", {
  id: id(), name: text("name").notNull(), provider: text("provider").notNull().default("evolution"),
  instanceName: text("instance_name").notNull(), chatbotId: uuid("chatbot_id").references(() => chatbots.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("disconnected"), ...audit(),
}, t => [uniqueIndex("atendeia_channel_instance_active").on(t.provider, t.instanceName).where(sql`${t.isDeleted} = false`),
  check("atendeia_channel_status", sql`${t.status} IN ('disconnected', 'connecting', 'connected')`)]);

export const conversations = pgTable("atendeia_conversations", {
  id: id(), channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "restrict" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  remoteJid: text("remote_jid").notNull(), status: text("status").notNull().default("open"),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "restrict" }),
  chatbotId: uuid("chatbot_id").references(() => chatbots.id, { onDelete: "restrict" }),
  humanTakeover: boolean("human_takeover").notNull().default(false),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }), closedAt: timestamp("closed_at", { withTimezone: true }), ...audit(),
}, t => [
  uniqueIndex("atendeia_conversation_open").on(t.channelId, t.remoteJid).where(sql`${t.isDeleted} = false AND ${t.status} <> 'closed'`),
  index("atendeia_inbox_status_time").on(t.status, t.lastMessageAt), index("atendeia_conversation_contact").on(t.contactId),
  check("atendeia_conversation_status", sql`${t.status} IN ('open', 'pending', 'closed')`),
]);
export const messages = pgTable("atendeia_messages", {
  id: id(), conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
  providerMessageId: text("provider_message_id"), direction: text("direction").notNull(),
  senderType: text("sender_type").notNull(), content: text("content"), mediaUrl: text("media_url"),
  messageType: text("message_type").notNull().default("text"), deliveryStatus: text("delivery_status").notNull().default("received"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(), ...audit(),
}, t => [
  uniqueIndex("atendeia_message_provider_identity").on(t.conversationId, t.providerMessageId),
  index("atendeia_message_timeline").on(t.conversationId, t.sentAt),
  check("atendeia_message_direction", sql`${t.direction} IN ('inbound', 'outbound')`),
  check("atendeia_message_sender", sql`${t.senderType} IN ('contact', 'agent', 'bot', 'system')`),
  check("atendeia_message_delivery", sql`${t.deliveryStatus} IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')`),
]);

export const aiDeliveries = pgTable("atendeia_envios_ia", {
  id: id(), instanceName: text("instance_name").notNull(), providerMessageId: text("provider_message_id").notNull(),
  ...colunasAuditoria,
  modified_by: uuid("modified_by").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "restrict" }),
}, t => [uniqueIndex("atendeia_envios_ia_identidade").on(t.instanceName, t.providerMessageId).where(sql`${t.is_deleted}=false`)]);

export const campaigns = pgTable("atendeia_campaigns", {
  id: id(), name: text("name").notNull(), channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "restrict" }),
  content: text("content").notNull(), status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }), ...audit(),
}, t => [check("atendeia_campaign_status", sql`${t.status} IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')`)]);
export const campaignRecipients = pgTable("atendeia_campaign_recipients", {
  id: id(), campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "restrict" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), ...audit(),
}, t => [uniqueIndex("atendeia_campaign_recipient_active").on(t.campaignId, t.contactId).where(sql`${t.isDeleted} = false`),
  check("atendeia_recipient_attempts", sql`${t.attempts} >= 0`),
  check("atendeia_recipient_status", sql`${t.status} IN ('pending', 'sent', 'failed', 'cancelled')`)]);
export const auditLogs = pgTable("atendeia_audit_logs", {
  id: id(), action: text("action").notNull(), entityType: text("entity_type").notNull(),
  details: jsonb("details").$type<{ motivo?: string; antes?: string[]; depois?: string[] }>().notNull().default({}),
  entityId: uuid("entity_id").notNull(), changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]), ...audit(),
}, t => [index("atendeia_audit_entity").on(t.entityType, t.entityId, t.createdAt)]);
