CREATE TABLE "atendeia_produtos_consultas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"produto_id" uuid,
	"termo" text NOT NULL,
	"chave" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_atendimento_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"chave" uuid NOT NULL,
	"status" text DEFAULT 'enviando' NOT NULL,
	"provedor_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_atendimento_status" CHECK ("atendeia_atendimento_envios"."status" IN ('enviando','enviado','incerto'))
);
--> statement-breakpoint
CREATE TABLE "atendeia_pedidos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"detalhe" text NOT NULL,
	"chave" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_farmaceuticos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"registro" text NOT NULL,
	"habilitado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendeia_pedidos_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"preco" numeric(14, 2) NOT NULL,
	"descricao" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_item_valores" CHECK ("atendeia_pedidos_itens"."quantidade">0 AND "atendeia_pedidos_itens"."preco">0)
);
--> statement-breakpoint
CREATE TABLE "atendeia_produtos_lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"validade" date,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_lote_saldo" CHECK ("atendeia_produtos_lotes"."quantidade">=0)
);
--> statement-breakpoint
CREATE TABLE "atendeia_produtos_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"pedido_id" uuid,
	"quantidade" integer NOT NULL,
	"anterior" integer NOT NULL,
	"posterior" integer NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text NOT NULL,
	"chave" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_movimento_saldo" CHECK ("atendeia_produtos_movimentos"."anterior">=0 AND "atendeia_produtos_movimentos"."posterior">=0 AND "atendeia_produtos_movimentos"."posterior"="atendeia_produtos_movimentos"."anterior"+"atendeia_produtos_movimentos"."quantidade")
);
--> statement-breakpoint
CREATE TABLE "atendeia_pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"contato_id" uuid NOT NULL,
	"conversa_id" uuid,
	"responsavel_id" uuid,
	"status" text DEFAULT 'novo' NOT NULL,
	"origem" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"chave" text NOT NULL,
	"referencia" text,
	"confirmado_em" timestamp (3) with time zone,
	"conferido_por" uuid,
	"conferencia" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	"oportunidade_id" uuid,
	CONSTRAINT "farmacia_pedido_status" CHECK ("atendeia_pedidos"."status" IN ('novo','aguardando_confirmacao','aguardando_pagamento','pagamento_confirmado','em_separacao','concluido','cancelado')),
	CONSTRAINT "farmacia_pedido_total" CHECK ("atendeia_pedidos"."total">0)
);
--> statement-breakpoint
CREATE TABLE "atendeia_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"principio" text DEFAULT '' NOT NULL,
	"generico" text DEFAULT '' NOT NULL,
	"fabricante" text DEFAULT '' NOT NULL,
	"categoria" text NOT NULL,
	"concentracao" text DEFAULT '' NOT NULL,
	"apresentacao" text NOT NULL,
	"embalagem" integer NOT NULL,
	"ean" text,
	"sku" text NOT NULL,
	"preco" numeric(14, 2) NOT NULL,
	"promocional" numeric(14, 2),
	"minimo" integer DEFAULT 0 NOT NULL,
	"receita" boolean DEFAULT false NOT NULL,
	"controle" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"medicamento" boolean DEFAULT true NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_produto_valores" CHECK ("atendeia_produtos"."preco">0 AND ("atendeia_produtos"."promocional" IS NULL OR ("atendeia_produtos"."promocional">0 AND "atendeia_produtos"."promocional"<="atendeia_produtos"."preco")) AND "atendeia_produtos"."minimo">=0 AND "atendeia_produtos"."embalagem">0)
);
--> statement-breakpoint
CREATE TABLE "atendeia_pedidos_reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"expira_em" timestamp (3) with time zone NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "farmacia_reserva_quantidade" CHECK ("atendeia_pedidos_reservas"."quantidade">0),
	CONSTRAINT "farmacia_reserva_status" CHECK ("atendeia_pedidos_reservas"."status" IN ('ativa','consumida','liberada','expirada'))
);
--> statement-breakpoint
ALTER TABLE "atendeia_produtos_consultas" ADD CONSTRAINT "atendeia_produtos_consultas_conversa_id_atendeia_conversations_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."atendeia_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_consultas" ADD CONSTRAINT "atendeia_produtos_consultas_produto_id_atendeia_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."atendeia_produtos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_consultas" ADD CONSTRAINT "atendeia_produtos_consultas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_atendimento_envios" ADD CONSTRAINT "atendeia_atendimento_envios_conversa_id_atendeia_conversations_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."atendeia_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_atendimento_envios" ADD CONSTRAINT "atendeia_atendimento_envios_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_eventos" ADD CONSTRAINT "atendeia_pedidos_eventos_pedido_id_atendeia_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."atendeia_pedidos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_eventos" ADD CONSTRAINT "atendeia_pedidos_eventos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_farmaceuticos" ADD CONSTRAINT "atendeia_farmaceuticos_usuario_id_atendeia_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_farmaceuticos" ADD CONSTRAINT "atendeia_farmaceuticos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_itens" ADD CONSTRAINT "atendeia_pedidos_itens_pedido_id_atendeia_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."atendeia_pedidos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_itens" ADD CONSTRAINT "atendeia_pedidos_itens_produto_id_atendeia_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."atendeia_produtos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_itens" ADD CONSTRAINT "atendeia_pedidos_itens_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_lotes" ADD CONSTRAINT "atendeia_produtos_lotes_produto_id_atendeia_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."atendeia_produtos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_lotes" ADD CONSTRAINT "atendeia_produtos_lotes_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_movimentos" ADD CONSTRAINT "atendeia_produtos_movimentos_lote_id_atendeia_produtos_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."atendeia_produtos_lotes"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_movimentos" ADD CONSTRAINT "atendeia_produtos_movimentos_pedido_id_atendeia_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."atendeia_pedidos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos_movimentos" ADD CONSTRAINT "atendeia_produtos_movimentos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_contato_id_atendeia_contacts_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."atendeia_contacts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_conversa_id_atendeia_conversations_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."atendeia_conversations"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_responsavel_id_atendeia_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_conferido_por_atendeia_users_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos" ADD CONSTRAINT "atendeia_pedidos_oportunidade_id_atendeia_funis_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."atendeia_funis_oportunidades"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_produtos" ADD CONSTRAINT "atendeia_produtos_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_reservas" ADD CONSTRAINT "atendeia_pedidos_reservas_pedido_id_atendeia_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."atendeia_pedidos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_reservas" ADD CONSTRAINT "atendeia_pedidos_reservas_lote_id_atendeia_produtos_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."atendeia_produtos_lotes"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "atendeia_pedidos_reservas" ADD CONSTRAINT "atendeia_pedidos_reservas_modified_by_atendeia_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."atendeia_users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_consulta_chave" ON "atendeia_produtos_consultas" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_atendimento_chave" ON "atendeia_atendimento_envios" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_evento_chave" ON "atendeia_pedidos_eventos" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_farmaceutico_usuario" ON "atendeia_farmaceuticos" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_item_produto" ON "atendeia_pedidos_itens" USING btree ("pedido_id","produto_id");--> statement-breakpoint
CREATE INDEX "farmacia_lote_fefo" ON "atendeia_produtos_lotes" USING btree ("produto_id","validade");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_movimento_chave" ON "atendeia_produtos_movimentos" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_pedido_chave" ON "atendeia_pedidos" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_pedido_numero" ON "atendeia_pedidos" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_produto_sku" ON "atendeia_produtos" USING btree ("sku") WHERE "atendeia_produtos"."is_deleted"=false;--> statement-breakpoint
CREATE UNIQUE INDEX "farmacia_produto_ean" ON "atendeia_produtos" USING btree ("ean") WHERE "atendeia_produtos"."is_deleted"=false AND "atendeia_produtos"."ean" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "farmacia_reserva_lote" ON "atendeia_pedidos_reservas" USING btree ("lote_id","expira_em");