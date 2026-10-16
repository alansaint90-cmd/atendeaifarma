CREATE TABLE "atendeia_users_convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp (3) with time zone NOT NULL,
	"usado_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_auth_desafios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"finalidade" text NOT NULL,
	"user_id" uuid,
	"convite_id" uuid,
	"expira_em" timestamp (3) with time zone NOT NULL,
	"usado_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_auth_limites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"janela" timestamp (3) with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_users_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credencial_id" text NOT NULL,
	"chave_publica" text NOT NULL,
	"contador" bigint DEFAULT 0 NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendeia_users_convites" ADD CONSTRAINT "atendeia_users_convites_user_id_atendeia_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_users_convites" ADD CONSTRAINT "atendeia_users_convites_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_auth_desafios" ADD CONSTRAINT "atendeia_auth_desafios_user_id_atendeia_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_auth_desafios" ADD CONSTRAINT "atendeia_auth_desafios_convite_id_atendeia_users_convites_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."atendeia_users_convites"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_auth_desafios" ADD CONSTRAINT "atendeia_auth_desafios_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_auth_limites" ADD CONSTRAINT "atendeia_auth_limites_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_users_passkeys" ADD CONSTRAINT "atendeia_users_passkeys_user_id_atendeia_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_users_passkeys" ADD CONSTRAINT "atendeia_users_passkeys_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_convite_hash" ON "atendeia_users_convites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_desafio_hash" ON "atendeia_auth_desafios" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "atendeia_desafio_expira" ON "atendeia_auth_desafios" USING btree ("expira_em");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_auth_limite_chave" ON "atendeia_auth_limites" USING btree ("chave") WHERE "atendeia_auth_limites"."is_deleted"=false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_passkey_credencial" ON "atendeia_users_passkeys" USING btree ("credencial_id");