import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import type { SessaoAtiva } from "../auth/permissoes";
import { linhas, type BancoSql } from "../db/porta";
import { marcaDeExclusao, MSG_COLISAO } from "../db/soft-delete";
import { autorizar } from "../farmacia/comum";

const entradaSchema = z.strictObject({ id: z.uuid(), version: z.number().int().nonnegative() });

/** O schema ativo usa versão inteira como trava otimista. O histórico permanece íntegro. */
export async function apagarConversaOperacional(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const validacao = entradaSchema.safeParse(entrada);
  if (!validacao.success) throw new ErroDeNegocio("Dados inválidos para apagar a conversa. Atualize a caixa de entrada e tente novamente.");
  const dados = validacao.data;
  return banco.transaction(async tx => {
    const autor = await autorizar(tx, sessao, "admin");
    const [conversa] = linhas<{ version: number }>(await tx.execute(sql`SELECT version FROM atendeia_conversations
      WHERE id=${dados.id} AND is_deleted=false FOR UPDATE`));
    if (!conversa || conversa.version !== dados.version) throw new ErroDeNegocio(MSG_COLISAO);
    const enviando = linhas(await tx.execute(sql`SELECT id FROM atendeia_atendimento_envios
      WHERE conversa_id=${dados.id} AND status='enviando' AND is_deleted=false LIMIT 1`));
    if (enviando.length) throw new ErroDeNegocio("Há uma mensagem em envio. Aguarde a conclusão antes de apagar a conversa.");
    const marca = marcaDeExclusao(autor);
    const alteradas = linhas(await tx.execute(sql`UPDATE atendeia_conversations
      SET is_deleted=${marca.is_deleted},deleted_at=${marca.deleted_at.toISOString()}::timestamptz,updated_at=${marca.updated_at.toISOString()}::timestamptz,modified_by=${marca.modified_by},
        status='closed',closed_at=${marca.deleted_at.toISOString()}::timestamptz,version=version+1
      WHERE id=${dados.id} AND version=${dados.version} AND is_deleted=false RETURNING id`));
    if (!alteradas.length) throw new ErroDeNegocio(MSG_COLISAO);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('conversa_apagada','conversa',${dados.id},'["is_deleted","status"]'::jsonb,${autor})`);
    return { id: dados.id };
  });
}

/** Consulta de tombstone: apenas impede reenvio de eventos anteriores à exclusão, sem expor histórico. */
export async function conversaApagadaAposMensagem(banco: BancoSql, instancia: string, numero: string, timestamp: number, identidade?: string) {
  // A identidade fixa o atendimento de origem, mesmo quando há outro aberto para o mesmo número.
  if (identidade) {
    const mensagens = linhas<{ provedor: string; apagada: boolean }>(await banco.execute(sql`SELECT m.provider_message_id provedor,c.is_deleted apagada
      FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE m.is_deleted=false AND ch.is_deleted=false AND ch.instance_name=${instancia}
        AND c.remote_jid=${`${numero}@s.whatsapp.net`} AND m.sent_at=to_timestamp(${timestamp}) AND m.provider_message_id IS NOT NULL`));
    const origem = mensagens.find(m => createHash("sha256").update(`${instancia}:${m.provedor}`).digest("hex") === identidade);
    if (origem) return origem.apagada;
  }
  const resultado = linhas(await banco.execute(sql`SELECT c.id FROM atendeia_conversations c
    JOIN atendeia_channels ch ON ch.id=c.channel_id
    WHERE ch.is_deleted=false AND ch.instance_name=${instancia} AND c.remote_jid=${`${numero}@s.whatsapp.net`}
      AND c.is_deleted=true AND c.deleted_at>=to_timestamp(${timestamp})
      AND NOT EXISTS (SELECT 1 FROM atendeia_conversations a WHERE a.channel_id=c.channel_id AND a.remote_jid=c.remote_jid
        AND a.is_deleted=false AND a.status<>'closed' AND a.created_at<c.deleted_at) LIMIT 1`));
  return resultado.length > 0;
}
