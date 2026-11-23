import { sql } from "drizzle-orm";
import { systemUserId } from "../db/bootstrap";
import { linhas, type BancoSql } from "../db/porta";
import { z } from "zod";
import { createHash } from "node:crypto";

const mensagemSchema = z.strictObject({ numero: z.string().regex(/^[1-9]\d{6,14}$/), texto: z.string().min(1).max(12000),
  origem: z.strictObject({ identidade: z.string().regex(/^[a-f0-9]{64}$/), instante: z.number().int().positive() }),
  encaminharEntrega: z.literal(true).optional() });
export type MensagemConfirmadaIa = z.infer<typeof mensagemSchema>;

/** O ID confirmado pelo provedor liga o envio do worker ao eco posterior da Evolution. */
export async function registrarEnvioIa(banco: BancoSql, instancia: string, provedorId: string, mensagem?: MensagemConfirmadaIa) {
  if (!instancia || !provedorId || instancia.length > 200 || provedorId.length > 200) throw new Error("Identidade de envio inválida.");
  const conteudo = mensagem === undefined ? undefined : mensagemSchema.parse(mensagem);
  await banco.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${instancia} || ':' || ${provedorId}, 0))`);
    const novo = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_envios_ia(instance_name,provider_message_id,modified_by)
      VALUES (${instancia},${provedorId},${systemUserId}) ON CONFLICT DO NOTHING RETURNING id`));
    if (novo[0]) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('envio_ia_confirmado','envio_ia',${novo[0].id},'["instance_name","provider_message_id"]'::jsonb,${systemUserId})`);
    const alteradas = linhas<{ id: string; conversaId:string }>(await tx.execute(sql`UPDATE atendeia_messages m SET sender_type='bot',updated_at=now(),
      version=m.version+1,modified_by=${systemUserId}
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE m.conversation_id=c.id AND ch.instance_name=${instancia} AND m.provider_message_id=${provedorId}
        AND m.direction='outbound' AND m.sender_type='system' AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false
      RETURNING m.id,m.conversation_id "conversaId"`));
    for (const linha of alteradas) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('mensagem_identificada_ia','mensagem',${linha.id},'["sender_type"]'::jsonb,${systemUserId})`);
    if (!conteudo) return;
    const candidatas = linhas<{ id: string; provedor: string }>(await tx.execute(sql`SELECT c.id,m.provider_message_id provedor
        FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id JOIN atendeia_channels ch ON ch.id=c.channel_id
        WHERE ch.instance_name=${instancia} AND c.remote_jid=${conteudo.numero + "@s.whatsapp.net"}
          AND m.direction='inbound' AND m.sent_at=to_timestamp(${conteudo.origem.instante}) AND m.provider_message_id IS NOT NULL
          AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false`));
    const origemId = candidatas.find(c => createHash("sha256").update(`${instancia}:${c.provedor}`).digest("hex") === conteudo.origem.identidade)?.id;
    if (!origemId) return;
    const conversa = linhas<{ id: string; version: number; assumida:boolean }>(await tx.execute(sql`SELECT c.id,c.version,c.human_takeover assumida FROM atendeia_conversations c
      JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_contacts p ON p.id=c.contact_id
      WHERE ch.instance_name=${instancia} AND ch.is_deleted=false AND p.is_deleted=false
        AND c.remote_jid=${conteudo.numero + "@s.whatsapp.net"} AND c.is_deleted=false AND c.status<>'closed'
        AND c.id=${origemId} FOR UPDATE OF c`))[0];
    // Um envio confirmado nunca recria uma conversa excluída ou encerrada.
    if (!conversa) return;
    const inserida = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_messages
      (conversation_id,provider_message_id,direction,sender_type,content,message_type,delivery_status,modified_by)
      VALUES (${conversa.id},${provedorId},'outbound','bot',${conteudo.texto},'text','sent',${systemUserId})
      ON CONFLICT DO NOTHING RETURNING id`))[0];
    const encaminhar=Boolean(conteudo.encaminharEntrega&&novo[0]&&!conversa.assumida&&(inserida||alteradas.some(m=>m.conversaId===conversa.id)));
    if (!inserida&&!encaminhar) return;
    if(inserida)await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('mensagem_ia_registrada','mensagem',${inserida.id},'["content","direction","provider_message_id"]'::jsonb,${systemUserId})`);
    await tx.execute(sql`UPDATE atendeia_conversations SET last_message_at=greatest(last_message_at,now()),updated_at=now(),
      status=CASE WHEN ${encaminhar} THEN 'pending' ELSE status END,human_takeover=human_takeover OR ${encaminhar},
      version=version+1,modified_by=${systemUserId} WHERE id=${conversa.id} AND version=${conversa.version} AND is_deleted=false`);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('conversa_resposta_ia','conversa',${conversa.id},'["last_message_at"]'::jsonb,${systemUserId})`);
    if(encaminhar)await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('entrega_encaminhada_equipe','conversa',${conversa.id},'["human_takeover","status"]'::jsonb,${systemUserId})`);
  });
}
