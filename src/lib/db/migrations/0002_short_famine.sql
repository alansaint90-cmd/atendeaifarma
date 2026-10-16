CREATE TABLE "atendeia_agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone" text NOT NULL,
	"instancia" text NOT NULL,
	"mensagem" text NOT NULL,
	"agendado_para" timestamp (3) with time zone NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"iniciado_em" timestamp (3) with time zone,
	"enviado_em" timestamp (3) with time zone,
	"provedor_id" text,
	"codigo_erro" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_agendamentos_status" CHECK ("atendeia_agendamentos"."status" IN ('pendente','enviando','enviado','cancelado','incerto','erro')),
	CONSTRAINT "atendeia_agendamentos_telefone" CHECK ("atendeia_agendamentos"."telefone" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
ALTER TABLE "atendeia_agendamentos" ADD CONSTRAINT "atendeia_agendamentos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "atendeia_agendamentos_pendentes" ON "atendeia_agendamentos" USING btree ("agendado_para") WHERE "atendeia_agendamentos"."is_deleted"=false AND "atendeia_agendamentos"."status"='pendente';