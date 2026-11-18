CREATE TABLE "atendeia_campanhas_destinatarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"telefone" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"iniciado_em" timestamp (3) with time zone,
	"provedor_id" text,
	"codigo_erro" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "campanha_destinatario_status" CHECK ("atendeia_campanhas_destinatarios"."status" IN ('pendente', 'enviando', 'enviado', 'incerto', 'bloqueado', 'cancelado')),
	CONSTRAINT "campanha_telefone" CHECK ("atendeia_campanhas_destinatarios"."telefone" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "atendeia_campanhas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"instancia" text NOT NULL,
	"mensagem" text NOT NULL,
	"arquivo" jsonb,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"proximo_envio" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "campanha_status" CHECK ("atendeia_campanhas"."status" IN ('rascunho', 'ativa', 'cancelada'))
);
--> statement-breakpoint
ALTER TABLE "atendeia_campanhas_destinatarios" ADD CONSTRAINT "atendeia_campanhas_destinatarios_campanha_id_atendeia_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."atendeia_campanhas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_campanhas_destinatarios" ADD CONSTRAINT "atendeia_campanhas_destinatarios_contato_id_atendeia_contacts_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_campanhas_destinatarios" ADD CONSTRAINT "atendeia_campanhas_destinatarios_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_campanhas" ADD CONSTRAINT "atendeia_campanhas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "campanha_contato_unico" ON "atendeia_campanhas_destinatarios" USING btree ("campanha_id","contato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campanha_telefone_unico" ON "atendeia_campanhas_destinatarios" USING btree ("campanha_id","telefone");--> statement-breakpoint
CREATE INDEX "campanha_fila" ON "atendeia_campanhas_destinatarios" USING btree ("campanha_id","status");