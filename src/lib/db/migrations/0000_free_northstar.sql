CREATE TABLE "atendeia_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"message_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_recipient_attempts" CHECK ("atendeia_campaign_recipients"."attempts" >= 0),
	CONSTRAINT "atendeia_recipient_status" CHECK ("atendeia_campaign_recipients"."status" IN ('pending', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_campaign_status" CHECK ("atendeia_campaigns"."status" IN ('draft', 'scheduled', 'running', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'evolution' NOT NULL,
	"instance_name" text NOT NULL,
	"chatbot_id" uuid,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_channel_status" CHECK ("atendeia_channels"."status" IN ('disconnected', 'connecting', 'connected'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_chatbots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_chatbot_configuration" CHECK (jsonb_typeof("atendeia_chatbots"."configuration") = 'object')
);
--> statement-breakpoint
CREATE TABLE "atendeia_contact_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"source" text,
	"lead_status" text DEFAULT 'novo' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_contact_score" CHECK ("atendeia_contacts"."score" BETWEEN 0 AND 100),
	CONSTRAINT "atendeia_contact_phone" CHECK ("atendeia_contacts"."phone" IS NULL OR "atendeia_contacts"."phone" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "atendeia_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"remote_jid" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"department_id" uuid,
	"assigned_to" uuid,
	"chatbot_id" uuid,
	"human_takeover" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_conversation_status" CHECK ("atendeia_conversations"."status" IN ('open', 'pending', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_department_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatbot_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider_message_id" text,
	"direction" text NOT NULL,
	"sender_type" text NOT NULL,
	"content" text,
	"media_url" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"delivery_status" text DEFAULT 'received' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_message_direction" CHECK ("atendeia_messages"."direction" IN ('inbound', 'outbound')),
	CONSTRAINT "atendeia_message_sender" CHECK ("atendeia_messages"."sender_type" IN ('contact', 'agent', 'bot', 'system')),
	CONSTRAINT "atendeia_message_delivery" CHECK ("atendeia_messages"."delivery_status" IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"role" text DEFAULT 'visualizador' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_users_role" CHECK ("atendeia_users"."role" IN ('super_admin', 'admin', 'operador', 'visualizador'))
);
--> statement-breakpoint
ALTER TABLE "atendeia_audit_logs" ADD CONSTRAINT "atendeia_audit_logs_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaign_recipients" ADD CONSTRAINT "atendeia_campaign_recipients_campaign_id_atendeia_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."atendeia_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaign_recipients" ADD CONSTRAINT "atendeia_campaign_recipients_contact_id_atendeia_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaign_recipients" ADD CONSTRAINT "atendeia_campaign_recipients_message_id_atendeia_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."atendeia_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaign_recipients" ADD CONSTRAINT "atendeia_campaign_recipients_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaigns" ADD CONSTRAINT "atendeia_campaigns_channel_id_atendeia_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."atendeia_channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_campaigns" ADD CONSTRAINT "atendeia_campaigns_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_channels" ADD CONSTRAINT "atendeia_channels_chatbot_id_atendeia_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."atendeia_chatbots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_channels" ADD CONSTRAINT "atendeia_channels_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_chatbots" ADD CONSTRAINT "atendeia_chatbots_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_contact_tags" ADD CONSTRAINT "atendeia_contact_tags_contact_id_atendeia_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_contact_tags" ADD CONSTRAINT "atendeia_contact_tags_tag_id_atendeia_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."atendeia_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_contact_tags" ADD CONSTRAINT "atendeia_contact_tags_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_contacts" ADD CONSTRAINT "atendeia_contacts_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_channel_id_atendeia_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."atendeia_channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_contact_id_atendeia_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_department_id_atendeia_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."atendeia_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_assigned_to_atendeia_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_chatbot_id_atendeia_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."atendeia_chatbots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_conversations" ADD CONSTRAINT "atendeia_conversations_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_department_members" ADD CONSTRAINT "atendeia_department_members_department_id_atendeia_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."atendeia_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_department_members" ADD CONSTRAINT "atendeia_department_members_user_id_atendeia_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_department_members" ADD CONSTRAINT "atendeia_department_members_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_departments" ADD CONSTRAINT "atendeia_departments_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_flows" ADD CONSTRAINT "atendeia_flows_chatbot_id_atendeia_chatbots_id_fk" FOREIGN KEY ("chatbot_id") REFERENCES "public"."atendeia_chatbots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_flows" ADD CONSTRAINT "atendeia_flows_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_messages" ADD CONSTRAINT "atendeia_messages_conversation_id_atendeia_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."atendeia_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_messages" ADD CONSTRAINT "atendeia_messages_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_sessions" ADD CONSTRAINT "atendeia_sessions_user_id_atendeia_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_sessions" ADD CONSTRAINT "atendeia_sessions_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_tags" ADD CONSTRAINT "atendeia_tags_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendeia_users" ADD CONSTRAINT "atendeia_users_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendeia_audit_entity" ON "atendeia_audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_campaign_recipient_active" ON "atendeia_campaign_recipients" USING btree ("campaign_id","contact_id") WHERE "atendeia_campaign_recipients"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_channel_instance_active" ON "atendeia_channels" USING btree ("provider","instance_name") WHERE "atendeia_channels"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_chatbot_identifier_active" ON "atendeia_chatbots" USING btree (lower("identifier")) WHERE "atendeia_chatbots"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_contact_tag_active" ON "atendeia_contact_tags" USING btree ("contact_id","tag_id") WHERE "atendeia_contact_tags"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_contact_phone_active" ON "atendeia_contacts" USING btree ("phone") WHERE "atendeia_contacts"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_conversation_open" ON "atendeia_conversations" USING btree ("channel_id","remote_jid") WHERE "atendeia_conversations"."is_deleted" = false AND "atendeia_conversations"."status" <> 'closed';--> statement-breakpoint
CREATE INDEX "atendeia_inbox_status_time" ON "atendeia_conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "atendeia_conversation_contact" ON "atendeia_conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_department_member_active" ON "atendeia_department_members" USING btree ("department_id","user_id") WHERE "atendeia_department_members"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_department_name" ON "atendeia_departments" USING btree (lower("name")) WHERE "atendeia_departments"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "atendeia_flows_chatbot" ON "atendeia_flows" USING btree ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_message_provider_identity" ON "atendeia_messages" USING btree ("conversation_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "atendeia_message_timeline" ON "atendeia_messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_sessions_token" ON "atendeia_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "atendeia_sessions_expiry" ON "atendeia_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_tag_name_active" ON "atendeia_tags" USING btree (lower("name")) WHERE "atendeia_tags"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_users_email_active" ON "atendeia_users" USING btree (lower("email")) WHERE "atendeia_users"."is_deleted" = false;