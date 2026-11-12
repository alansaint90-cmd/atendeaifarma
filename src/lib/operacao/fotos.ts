import { z } from "zod";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import type { EvolutionEvent } from "../evolution/schema";

const fotoSchema = z.string().max(2048).url().refine(valor => {
  const url = new URL(valor);
  return url.protocol === "https:" && !url.username && !url.password;
});
const contatoSchema = z.object({ remoteJid: z.string().regex(/^[1-9]\d{6,14}@s\.whatsapp\.net$/), profilePicUrl: z.union([fotoSchema, z.null(), z.literal("")]).optional() });

/** Atualiza somente contatos já vinculados à instância autenticada; não cria leads por foto. */
export async function receberFotosContatos(banco: BancoSql, evento: EvolutionEvent) {
  if (!["contacts.upsert", "contacts.update"].includes(evento.event)) return;
  await banco.transaction(async tx => {
    for (const item of Array.isArray(evento.data) ? evento.data : [evento.data]) {
      const resultado = contatoSchema.safeParse(item);
      if (!resultado.success || resultado.data.profilePicUrl === undefined) continue;
      const v = resultado.data, foto = v.profilePicUrl || null;
      const [contato] = linhas<{ id: string; version: number }>(await tx.execute(sql`SELECT p.id,p.version FROM atendeia_contacts p
        WHERE p.phone=${`+${v.remoteJid.split("@")[0]}`} AND p.is_deleted=false AND p.foto_url IS DISTINCT FROM ${foto}
        AND EXISTS(SELECT 1 FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
          WHERE c.contact_id=p.id AND ch.instance_name=${evento.instance} AND c.is_deleted=false AND ch.is_deleted=false) FOR UPDATE OF p`));
      if (!contato) continue;
      const atualizados = linhas(await tx.execute(sql`UPDATE atendeia_contacts SET foto_url=${foto},updated_at=clock_timestamp(),version=version+1,modified_by=${systemUserId}
        WHERE id=${contato.id} AND version=${contato.version} AND is_deleted=false RETURNING id`));
      if (!atualizados.length) throw new Error("Contato alterado durante a atualização da foto.");
      await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
        VALUES ('contato_foto_atualizada','contato',${contato.id},'["foto_url"]'::jsonb,${systemUserId})`);
    }
  });
}
