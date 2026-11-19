import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import type { SessaoAtiva } from "../auth/permissoes";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { marcaDeExclusao, MSG_COLISAO } from "../db/soft-delete";
import { autorizar } from "../farmacia/comum";

const entradaSchema = z.strictObject({ id: z.uuid(), version: z.number().int().nonnegative() });

/** Compartilhada com o recebimento para serializar a recriação de um telefone excluído. */
export async function travarTelefoneContato(tx: TransacaoSql, telefone: string | null) {
  if (telefone) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'contato:'+telefone},0))`);
}

/** Preserva filhos e pedidos. A versão inteira é a trava otimista do schema ativo. */
export async function excluirContatoOperacional(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const validacao = entradaSchema.safeParse(entrada);
  if (!validacao.success) throw new ErroDeNegocio("Dados inválidos para excluir o contato. Atualize a lista e tente novamente.");
  const dados = validacao.data;
  return banco.transaction(async tx => {
    const autor = await autorizar(tx, sessao, "admin");
    const [identidade] = linhas<{ telefone: string | null }>(await tx.execute(sql`SELECT phone telefone FROM atendeia_contacts WHERE id=${dados.id} AND is_deleted=false`));
    if (!identidade) throw new ErroDeNegocio(MSG_COLISAO);
    await travarTelefoneContato(tx, identidade.telefone);
    const [contato] = linhas<{ version: number }>(await tx.execute(sql`SELECT version FROM atendeia_contacts
      WHERE id=${dados.id} AND is_deleted=false FOR UPDATE`));
    if (!contato || contato.version !== dados.version) throw new ErroDeNegocio(MSG_COLISAO);
    const conversas = linhas<{ id: string; version: number }>(await tx.execute(sql`SELECT id,version FROM atendeia_conversations
      WHERE contact_id=${dados.id} AND is_deleted=false ORDER BY id FOR UPDATE`));
    const enviando = linhas(await tx.execute(sql`SELECT e.id FROM atendeia_atendimento_envios e
      JOIN atendeia_conversations c ON c.id=e.conversa_id
      WHERE c.contact_id=${dados.id} AND c.is_deleted=false AND e.is_deleted=false AND e.status='enviando' LIMIT 1`));
    if (enviando.length) throw new ErroDeNegocio("Há uma mensagem em envio para este contato. Aguarde a conclusão antes de excluir.");
    const marca = marcaDeExclusao(autor), instante = marca.updated_at.toISOString();
    for (const conversa of conversas) {
      const alteradas = linhas(await tx.execute(sql`UPDATE atendeia_conversations SET is_deleted=true,deleted_at=${instante}::timestamptz,
        updated_at=${instante}::timestamptz,modified_by=${autor},status='closed',closed_at=${instante}::timestamptz,version=version+1
        WHERE id=${conversa.id} AND version=${conversa.version} AND is_deleted=false RETURNING id`));
      if (!alteradas.length) throw new ErroDeNegocio(MSG_COLISAO);
      await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
        VALUES ('conversa_arquivada_contato_excluido','conversa',${conversa.id},'["is_deleted","status"]'::jsonb,${autor})`);
    }
    const alteradas = linhas(await tx.execute(sql`UPDATE atendeia_contacts SET is_deleted=${marca.is_deleted},deleted_at=${instante}::timestamptz,
      updated_at=${instante}::timestamptz,modified_by=${autor},version=version+1
      WHERE id=${dados.id} AND version=${dados.version} AND is_deleted=false RETURNING id`));
    if (!alteradas.length) throw new ErroDeNegocio(MSG_COLISAO);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
      VALUES ('contato_excluido','contato',${dados.id},'["is_deleted"]'::jsonb,${autor})`);
    return { id: dados.id };
  });
}
