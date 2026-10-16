import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";

export interface ContatoOperacional { id: string; nome: string; telefone: string | null; email: string | null; origem: string | null; status: string }
export interface MensagemOperacional { id: string; conteudo: string | null; direcao: string; instante: string }
export interface ConversaOperacional { id: string; nome: string; telefone: string | null; canal: string; status: string; mensagens: MensagemOperacional[] }
export interface ResumoOperacional {
  abertas: number; pendentes: number; qualificados: number; taxaResposta: number; totalContatos: number;
  contatos: ContatoOperacional[]; conversas: ConversaOperacional[]; volume: { dia: string; total: number }[];
  atualizadoEm: string;
}

/** Leituras coerentes em um snapshot; os filtros preservam a exclusão lógica do schema ativo. */
export async function consultarOperacao(banco: BancoSql): Promise<ResumoOperacional> {
  return banco.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const contagem = linhas<{ abertas: number; pendentes: number; recebidas: number; respondidas: number }>(await tx.execute(sql`
      WITH atendimento AS (
        SELECT c.status,
          (SELECT m.direction FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false ORDER BY m.sent_at DESC,m.created_at DESC LIMIT 1) ultima,
          EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.direction='inbound' AND m.is_deleted=false) recebeu,
          EXISTS(SELECT 1 FROM atendeia_messages s WHERE s.conversation_id=c.id AND s.direction='outbound' AND s.is_deleted=false
            AND s.delivery_status IN ('sent','delivered','read') AND EXISTS(SELECT 1 FROM atendeia_messages e
              WHERE e.conversation_id=c.id AND e.is_deleted=false AND e.direction='inbound' AND e.sent_at<=s.sent_at)) respondeu
        FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
        WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false)
      SELECT count(*) FILTER (WHERE status<>'closed')::int abertas,
        count(*) FILTER (WHERE status<>'closed' AND (status='pending' OR ultima='inbound'))::int pendentes,
        count(*) FILTER (WHERE recebeu)::int recebidas, count(*) FILTER (WHERE respondeu)::int respondidas FROM atendimento`))[0];
    const totais = linhas<{ total: number; qualificados: number }>(await tx.execute(sql`SELECT count(*)::int total,
      count(*) FILTER (WHERE lead_status='qualificado')::int qualificados FROM atendeia_contacts WHERE is_deleted=false`))[0];
    const contatos = linhas<ContatoOperacional>(await tx.execute(sql`SELECT id,name nome,phone telefone,email,source origem,lead_status status
      FROM atendeia_contacts WHERE is_deleted=false ORDER BY created_at DESC,id LIMIT 100`));
    const conversas = linhas<Omit<ConversaOperacional, "mensagens">>(await tx.execute(sql`SELECT c.id,p.name nome,p.phone telefone,ch.name canal,c.status
      FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false ORDER BY c.last_message_at DESC NULLS LAST,c.id LIMIT 50`));
    const historicos: ConversaOperacional[] = [];
    for (const conversa of conversas) {
      const mensagens = linhas<MensagemOperacional>(await tx.execute(sql`SELECT id,content conteudo,direction direcao,
        to_char(sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') instante FROM atendeia_messages
        WHERE conversation_id=${conversa.id} AND is_deleted=false ORDER BY sent_at DESC,created_at DESC,id LIMIT 50`)).reverse();
      historicos.push({ id: conversa.id, nome: conversa.nome, telefone: conversa.telefone, canal: conversa.canal, status: conversa.status, mensagens });
    }
    const volume = linhas<{ dia: string; total: number }>(await tx.execute(sql`SELECT to_char(d.dia,'YYYY-MM-DD') dia,count(m.id)::int total
      FROM generate_series((now() AT TIME ZONE 'UTC')::date-6,(now() AT TIME ZONE 'UTC')::date,interval '1 day') d(dia)
      LEFT JOIN (SELECT m.id,m.sent_at FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id
        JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
        WHERE m.is_deleted=false AND c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false) m
      ON (m.sent_at AT TIME ZONE 'UTC')::date=d.dia::date GROUP BY d.dia ORDER BY d.dia`));
    return { abertas: contagem.abertas, pendentes: contagem.pendentes, qualificados: totais.qualificados,
      taxaResposta: contagem.recebidas ? Math.round(contagem.respondidas / contagem.recebidas * 100) : 0,
      totalContatos: totais.total, contatos, conversas: historicos, volume, atualizadoEm: new Date().toISOString() };
  });
}
