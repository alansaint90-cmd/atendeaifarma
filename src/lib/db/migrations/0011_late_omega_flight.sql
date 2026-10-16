CREATE TABLE "atendeia_agenda_horarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inicio" timestamp (3) with time zone NOT NULL,
	"fim" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_agenda_horarios_periodo" CHECK ("atendeia_agenda_horarios"."fim">"atendeia_agenda_horarios"."inicio")
);
--> statement-breakpoint
CREATE TABLE "atendeia_agenda_horarios_reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"horario_id" uuid NOT NULL,
	"identidade" text NOT NULL,
	"origem" text NOT NULL,
	"instancia" text NOT NULL,
	"nome_completo" text NOT NULL,
	"telefone" text NOT NULL,
	"nascimento" date NOT NULL,
	"cep" text NOT NULL,
	"rua" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text DEFAULT '' NOT NULL,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "atendeia_agenda_reserva_status" CHECK ("atendeia_agenda_horarios_reservas"."status" IN ('confirmada', 'cancelada')),
	CONSTRAINT "atendeia_agenda_reserva_cadastro" CHECK (length(trim("atendeia_agenda_horarios_reservas"."nome_completo"))>2 AND "atendeia_agenda_horarios_reservas"."telefone" ~ '^[+][1-9][0-9]{6,14}$' AND "atendeia_agenda_horarios_reservas"."cep" ~ '^[0-9]{8}$' AND length(trim("atendeia_agenda_horarios_reservas"."rua"))>0 AND length(trim("atendeia_agenda_horarios_reservas"."numero"))>0 AND length(trim("atendeia_agenda_horarios_reservas"."bairro"))>0 AND length(trim("atendeia_agenda_horarios_reservas"."cidade"))>0 AND "atendeia_agenda_horarios_reservas"."uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "atendeia_agenda_horarios" ADD CONSTRAINT "atendeia_agenda_horarios_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_agenda_horarios_reservas" ADD CONSTRAINT "atendeia_agenda_horarios_reservas_horario_id_atendeia_agenda_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."atendeia_agenda_horarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_agenda_horarios_reservas" ADD CONSTRAINT "atendeia_agenda_horarios_reservas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_agenda_horarios_inicio" ON "atendeia_agenda_horarios" USING btree ("inicio") WHERE "atendeia_agenda_horarios"."is_deleted"=false;--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_agenda_reserva_identidade" ON "atendeia_agenda_horarios_reservas" USING btree ("identidade");--> statement-breakpoint
CREATE UNIQUE INDEX "atendeia_agenda_reserva_vaga" ON "atendeia_agenda_horarios_reservas" USING btree ("horario_id") WHERE "atendeia_agenda_horarios_reservas"."is_deleted"=false AND "atendeia_agenda_horarios_reservas"."status"='confirmada';--> statement-breakpoint
CREATE INDEX "atendeia_agenda_reserva_origem" ON "atendeia_agenda_horarios_reservas" USING btree ("origem");