import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";

export async function transferirAtendimento(banco: BancoSql, instancia: string, numero: string, destino: string, motivo?: "estoque_indisponivel") {
  await banco.transaction(async tx => {
    const [setor] = linhas<{ id: string }>(await tx.execute(sql`SELECT id FROM atendeia_departments
      WHERE name=${destino} AND is_deleted=false`));
    if (!setor) throw new Error("Destino de atendimento indisponível.");
    const [conversa] = linhas<{ id: string; version: number; human_takeover: boolean; assigned_to: string | null; status: string; department_id: string | null }>(await tx.execute(sql`SELECT c.id,c.version,c.human_takeover,c.assigned_to,c.status,c.department_id
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE ch.instance_name=${instancia} AND ch.provider='evolution' AND ch.is_deleted=false
        AND c.remote_jid=${`${numero}@s.whatsapp.net`} AND c.is_deleted=false AND c.status<>'closed' FOR UPDATE OF c`));
    if (!conversa) throw new Error("Conversa indisponível para transferência.");
    if (motivo && conversa.human_takeover) {
      if (conversa.status === "pending" && !conversa.assigned_to && conversa.department_id === setor.id) return;
      throw new Error("Conversa já assumida pela equipe.");
    }
    await tx.execute(sql`UPDATE atendeia_conversations SET status='pending',department_id=${setor.id},
      assigned_to=NULL,human_takeover=${motivo ? true : conversa.human_takeover},version=version+1,updated_at=now(),modified_by=${systemUserId}
      WHERE id=${conversa.id} AND version=${conversa.version} AND is_deleted=false`);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('atendimento_transferido','conversa',${conversa.id},'["status","department_id","assigned_to"]'::jsonb,${systemUserId})`);
    if (motivo) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('estoque_indisponivel_equipe_notificada','conversa',${conversa.id},'["human_takeover","status"]'::jsonb,${systemUserId})`);
  });
}
