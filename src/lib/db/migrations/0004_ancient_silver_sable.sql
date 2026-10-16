CREATE TABLE "atendeia_funis_acessos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funil_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_funis_etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funil_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_etapa_ordem" CHECK ("atendeia_funis_etapas"."ordem">=0)
);
--> statement-breakpoint
CREATE TABLE "atendeia_funis_oportunidades_fechamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"funil_id" uuid NOT NULL,
	"etapa_anterior_id" uuid NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"status" text NOT NULL,
	"motivo" text,
	"observacao" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_fechamento_status" CHECK ("atendeia_funis_oportunidades_fechamentos"."status" IN ('ganha','perdida'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_funis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_motivos_perda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_funis_oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"valor" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"funil_id" uuid NOT NULL,
	"etapa_id" uuid NOT NULL,
	"contato_id" uuid,
	"canal_id" uuid,
	"responsavel_id" uuid NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"fechado_em" timestamp (3) with time zone,
	"motivo_id" uuid,
	"observacao" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_oportunidade_status" CHECK ("atendeia_funis_oportunidades"."status" IN ('aberta', 'ganha', 'perdida')),
	CONSTRAINT "atendeia_oportunidade_valor" CHECK ("atendeia_funis_oportunidades"."valor">=0),
	CONSTRAINT "atendeia_oportunidade_fechamento" CHECK (("atendeia_funis_oportunidades"."status"='aberta' AND "atendeia_funis_oportunidades"."fechado_em" IS NULL AND "atendeia_funis_oportunidades"."motivo_id" IS NULL) OR ("atendeia_funis_oportunidades"."status"='ganha' AND "atendeia_funis_oportunidades"."fechado_em" IS NOT NULL AND "atendeia_funis_oportunidades"."motivo_id" IS NULL) OR ("atendeia_funis_oportunidades"."status"='perdida' AND "atendeia_funis_oportunidades"."fechado_em" IS NOT NULL AND "atendeia_funis_oportunidades"."motivo_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "atendeia_funis_oportunidades_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendeia_funis_acessos" ADD CONSTRAINT "atendeia_funis_acessos_funil_id_atendeia_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."atendeia_funis"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_acessos" ADD CONSTRAINT "atendeia_funis_acessos_usuario_id_atendeia_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_acessos" ADD CONSTRAINT "atendeia_funis_acessos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_etapas" ADD CONSTRAINT "atendeia_funis_etapas_funil_id_atendeia_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."atendeia_funis"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_etapas" ADD CONSTRAINT "atendeia_funis_etapas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_fechamentos" ADD CONSTRAINT "atendeia_funis_oportunidades_fechamentos_oportunidade_id_atendeia_funis_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."atendeia_funis_oportunidades"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_fechamentos" ADD CONSTRAINT "atendeia_funis_oportunidades_fechamentos_funil_id_atendeia_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."atendeia_funis"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_fechamentos" ADD CONSTRAINT "atendeia_funis_oportunidades_fechamentos_etapa_anterior_id_atendeia_funis_etapas_id_fk" FOREIGN KEY ("etapa_anterior_id") REFERENCES "public"."atendeia_funis_etapas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_fechamentos" ADD CONSTRAINT "atendeia_funis_oportunidades_fechamentos_responsavel_id_atendeia_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_fechamentos" ADD CONSTRAINT "atendeia_funis_oportunidades_fechamentos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis" ADD CONSTRAINT "atendeia_funis_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_motivos_perda" ADD CONSTRAINT "atendeia_motivos_perda_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_funil_id_atendeia_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."atendeia_funis"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_etapa_id_atendeia_funis_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."atendeia_funis_etapas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_contato_id_atendeia_contacts_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_canal_id_atendeia_channels_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."atendeia_channels"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_responsavel_id_atendeia_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_motivo_id_atendeia_motivos_perda_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."atendeia_motivos_perda"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades" ADD CONSTRAINT "atendeia_funis_oportunidades_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_tags" ADD CONSTRAINT "atendeia_funis_oportunidades_tags_oportunidade_id_atendeia_funis_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."atendeia_funis_oportunidades"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_tags" ADD CONSTRAINT "atendeia_funis_oportunidades_tags_tag_id_atendeia_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."atendeia_tags"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_funis_oportunidades_tags" ADD CONSTRAINT "atendeia_funis_oportunidades_tags_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_funil_acesso" ON "atendeia_funis_acessos" USING btree ("funil_id","usuario_id") WHERE "atendeia_funis_acessos"."is_deleted"=false;--> statement-breakpoint
CREATE INDEX "atendeia_acessos_usuario" ON "atendeia_funis_acessos" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_etapas_ordem" ON "atendeia_funis_etapas" USING btree ("funil_id","ordem") WHERE "atendeia_funis_etapas"."is_deleted"=false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_fechamento_oportunidade" ON "atendeia_funis_oportunidades_fechamentos" USING btree ("oportunidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_funis_nome" ON "atendeia_funis" USING btree (lower("nome")) WHERE "atendeia_funis"."is_deleted"=false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_motivos_nome" ON "atendeia_motivos_perda" USING btree (lower("nome")) WHERE "atendeia_motivos_perda"."is_deleted"=false;--> statement-breakpoint
CREATE INDEX "atendeia_oportunidades_funil_status" ON "atendeia_funis_oportunidades" USING btree ("funil_id","status");--> statement-breakpoint
CREATE INDEX "atendeia_oportunidades_fechamento" ON "atendeia_funis_oportunidades" USING btree ("fechado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_oportunidade_tag" ON "atendeia_funis_oportunidades_tags" USING btree ("oportunidade_id","tag_id") WHERE "atendeia_funis_oportunidades_tags"."is_deleted"=false;