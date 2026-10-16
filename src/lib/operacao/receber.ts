import { sql } from "drizzle-orm";
import { systemUserId } from "../db/bootstrap";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import type { EvolutionEvent } from "../evolution/schema";
import { mensagensOperacionais } from "./evento";

async function auditar(tx: TransacaoSql, entidade: string, id: string, campos: string[]) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
    VALUES ('evolution_recebimento',${entidade},${id},${JSON.stringify(campos)}::jsonb,${systemUserId})`);
}

/** O recibo e os dados são confirmados juntos; uma repetição nunca abre outra conversa. */
export async function receberOperacao(banco: BancoSql, evento: EvolutionEvent) {
  const mensagens = mensagensOperacionais(evento);
  if (!mensagens.length) return;
  await banco.transaction(async tx => {
    for (const mensagem of mensagens) {
      if (mensagem.saida) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${mensagem.instancia} || ':' || ${mensagem.provedorId}, 0))`);
      const recibo = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_webhook_recebimentos(identidade,modified_by)
        VALUES (${mensagem.identidade},${systemUserId}) ON CONFLICT DO NOTHING RETURNING id`));
      if (!recibo.length) continue;
      await auditar(tx, "webhook_recebimento", recibo[0].id, ["identidade"]);
      let canal = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_channels(name,instance_name,modified_by)
        VALUES (${mensagem.instancia},${mensagem.instancia},${systemUserId}) ON CONFLICT DO NOTHING RETURNING id`));
      if (canal.length) await auditar(tx, "canal", canal[0].id, ["name", "instance_name"]);
      else canal = linhas(await tx.execute(sql`SELECT id FROM atendeia_channels
        WHERE provider='evolution' AND instance_name=${mensagem.instancia} AND is_deleted=false`));
      let contato = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_contacts(name,phone,source,modified_by)
        VALUES (${mensagem.nome || mensagem.telefone},${mensagem.telefone},'WhatsApp',${systemUserId}) ON CONFLICT DO NOTHING RETURNING id`));
      if (contato.length) await auditar(tx, "contato", contato[0].id, ["name", "phone", "source"]);
      else contato = linhas(await tx.execute(sql`SELECT id FROM atendeia_contacts WHERE phone=${mensagem.telefone} AND is_deleted=false`));
      if (!canal[0] || !contato[0]) throw new Error("Registro operacional indisponível.");
      // Também reconhece mensagens anteriores à instalação do recibo persistente.
      const existente = linhas(await tx.execute(sql`SELECT m.id FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id
        WHERE m.is_deleted=false AND c.is_deleted=false AND c.channel_id=${canal[0].id} AND m.provider_message_id=${mensagem.provedorId} LIMIT 1`));
      if (existente.length) continue;
      let conversa = linhas<{ id: string; version: number }>(await tx.execute(sql`INSERT INTO atendeia_conversations(channel_id,contact_id,remote_jid,modified_by)
        VALUES (${canal[0].id},${contato[0].id},${mensagem.jid},${systemUserId}) ON CONFLICT DO NOTHING RETURNING id,version`));
      if (conversa.length) await auditar(tx, "conversa", conversa[0].id, ["channel_id", "contact_id", "remote_jid"]);
      // Bloqueio entre mensagens concorrentes, mantendo a versão do schema ativo na escrita.
      conversa = linhas(await tx.execute(sql`SELECT id,version FROM atendeia_conversations WHERE channel_id=${canal[0].id}
        AND remote_jid=${mensagem.jid} AND status<>'closed' AND is_deleted=false FOR UPDATE`));
      if (!conversa[0]) throw new Error("Conversa alterada durante o recebimento.");
      const envioIa = mensagem.saida && linhas<{ id: string }>(await tx.execute(sql`SELECT id FROM atendeia_envios_ia
        WHERE instance_name=${mensagem.instancia} AND provider_message_id=${mensagem.provedorId} AND is_deleted=false LIMIT 1`)).length > 0;
      const registro = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_messages
        (conversation_id,provider_message_id,direction,sender_type,content,message_type,delivery_status,sent_at,modified_by)
        VALUES (${conversa[0].id},${mensagem.provedorId},${mensagem.saida ? "outbound" : "inbound"},${mensagem.saida ? envioIa ? "bot" : "system" : "contact"},
          ${mensagem.conteudo},${mensagem.tipo},${mensagem.saida ? "sent" : "received"},${mensagem.instante}::timestamptz,${systemUserId}) RETURNING id`));
      await auditar(tx, "mensagem", registro[0].id, ["content", "direction", "provider_message_id"]);
      const atualizada = linhas(await tx.execute(sql`UPDATE atendeia_conversations SET last_message_at=greatest(last_message_at,${mensagem.instante}::timestamptz),
        updated_at=now(),version=version+1,modified_by=${systemUserId}
        WHERE id=${conversa[0].id} AND version=${conversa[0].version} AND is_deleted=false RETURNING id`));
      if (!atualizada.length) throw new Error("Conversa alterada durante o recebimento.");
      await auditar(tx, "conversa", conversa[0].id, ["last_message_at"]);
    }
  });
}
