CREATE TABLE "atendeia_envios_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_name" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendeia_envios_ia" ADD CONSTRAINT "atendeia_envios_ia_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_envios_ia_identidade" ON "atendeia_envios_ia" USING btree ("instance_name","provider_message_id") WHERE "atendeia_envios_ia"."is_deleted"=false;