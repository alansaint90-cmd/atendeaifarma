import { sql } from "drizzle-orm";
import { systemUserId } from "../db/bootstrap";
import { linhas, type BancoSql } from "../db/porta";

/** O ID confirmado pelo provedor liga o envio do worker ao eco posterior da Evolution. */
export async function registrarEnvioIa(banco: BancoSql, instancia: string, provedorId: string) {
  if (!instancia || !provedorId || instancia.length > 200 || provedorId.length > 200) throw new Error("Identidade de envio inválida.");
  await banco.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${instancia} || ':' || ${provedorId}, 0))`);
    const novo = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_envios_ia(instance_name,provider_message_id,modified_by)
      VALUES (${instancia},${provedorId},${systemUserId}) ON CONFLICT DO NOTHING RETURNING id`));
    if (novo[0]) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('envio_ia_confirmado','envio_ia',${novo[0].id},'["instance_name","provider_message_id"]'::jsonb,${systemUserId})`);
    const alteradas = linhas<{ id: string }>(await tx.execute(sql`UPDATE atendeia_messages m SET sender_type='bot',updated_at=now(),
      version=m.version+1,modified_by=${systemUserId}
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE m.conversation_id=c.id AND ch.instance_name=${instancia} AND m.provider_message_id=${provedorId}
        AND m.direction='outbound' AND m.sender_type='system' AND m.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false
      RETURNING m.id`));
    for (const linha of alteradas) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('mensagem_identificada_ia','mensagem',${linha.id},'["sender_type"]'::jsonb,${systemUserId})`);
  });
}
