import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { LIMITE_CONTATOS } from "./limites";
import type { EstadoIaConversa, OrigemEstadoIa, consultarEstadosIa } from "./estado-ia";

export interface ContatoOperacional { id: string; version: number; nome: string; telefone: string | null; email: string | null; origem: string | null; status: string }
export interface MensagemOperacional { id: string; conteudo: string | null; direcao: string; instante: string; tipo?: string; audioDisponivel?: boolean }
export interface ConversaOperacional { id: string; version: number; nome: string; telefone: string | null; canal: string; status: string; estadoIa?: EstadoIaConversa; aguardaHumano?: boolean; avisoEntrega?: string | null; fotoUrl?: string | null; mensagens: MensagemOperacional[] }
export interface ResumoOperacional {
  abertas: number; pendentes: number; qualificados: number; taxaResposta: number; totalContatos: number;
  contatos: ContatoOperacional[]; conversas: ConversaOperacional[]; volume: { dia: string; total: number }[];
  atualizadoEm: string;
}

/** Leituras coerentes em um snapshot; os filtros preservam a exclusão lógica do schema ativo. */
export async function consultarOperacao(banco: BancoSql, consultarIa?: typeof consultarEstadosIa): Promise<ResumoOperacional> {
  const { resumo, origens } = await banco.transaction(async tx => {
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
    const contatos = linhas<ContatoOperacional>(await tx.execute(sql`SELECT id,version,name nome,phone telefone,email,source origem,lead_status status
      FROM atendeia_contacts WHERE is_deleted=false ORDER BY created_at DESC,id LIMIT ${LIMITE_CONTATOS}`));
    const conversas = linhas<Omit<ConversaOperacional, "mensagens"> & OrigemEstadoIa>(await tx.execute(sql`SELECT c.id,c.version,p.name nome,p.phone telefone,ch.name canal,c.status,p.foto_url "fotoUrl",
      ch.instance_name instancia,c.remote_jid jid,c.human_takeover assumida,(c.assigned_to IS NOT NULL) atribuida,
      c.ai_paused "pausaPainel",coalesce(extract(epoch FROM c.ai_resumed_at)*1000,0)::float8 "retomadaEm",
      (c.status='pending' AND c.human_takeover=true AND c.assigned_to IS NULL) "aguardaHumano",
      (SELECT aviso FROM atendeia_pedidos pedido
        CROSS JOIN LATERAL (SELECT CASE
          WHEN e.tipo='comprovante_pix' THEN 'Comprovante Pix recebido para conferência'
          WHEN e.tipo='pagamento' THEN CASE
            WHEN e.detalhe::jsonb->>'forma'='dinheiro' AND e.detalhe::jsonb->>'troco'='sim' THEN CASE
              WHEN e.detalhe::jsonb->>'valor'='0.00' THEN 'Cliente precisa de troco · valor a informar'
              ELSE 'Preparar troco para R$ ' || replace(e.detalhe::jsonb->>'valor','.',',') END
          END
          END aviso
          FROM atendeia_pedidos_eventos e WHERE e.pedido_id=pedido.id AND e.is_deleted=false
            AND e.tipo IN ('pagamento','comprovante_pix','finalizar','adicionar','reservar','itens_acrescentados')
          ORDER BY e.created_at DESC,e.id DESC LIMIT 1) entrega
        WHERE pedido.conversa_id=c.id AND pedido.is_deleted=false AND pedido.status='aguardando_pagamento' AND aviso IS NOT NULL
        ORDER BY pedido.created_at DESC,pedido.id LIMIT 1) "avisoEntrega"
      FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false ORDER BY c.last_message_at DESC NULLS LAST,c.id LIMIT 50`));
    const historicos: ConversaOperacional[] = [];
    const origens: OrigemEstadoIa[] = [];
    for (const { instancia, jid, assumida, atribuida, pausaPainel, retomadaEm, ...conversa } of conversas) {
      origens.push({ id: conversa.id, status: conversa.status, instancia, jid, assumida, atribuida, pausaPainel, retomadaEm });
      const mensagens = linhas<MensagemOperacional>(await tx.execute(sql`SELECT id,content conteudo,direction direcao,message_type tipo,
        (message_type='audio' AND provider_message_id IS NOT NULL) "audioDisponivel",
        to_char(sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') instante FROM atendeia_messages
        WHERE conversation_id=${conversa.id} AND is_deleted=false ORDER BY sent_at DESC,created_at DESC,id LIMIT 50`)).reverse();
      historicos.push({ ...conversa, mensagens });
    }
    const volume = linhas<{ dia: string; total: number }>(await tx.execute(sql`SELECT to_char(d.dia,'YYYY-MM-DD') dia,count(m.id)::int total
      FROM generate_series((now() AT TIME ZONE 'UTC')::date-6,(now() AT TIME ZONE 'UTC')::date,interval '1 day') d(dia)
      LEFT JOIN (SELECT m.id,m.sent_at FROM atendeia_messages m JOIN atendeia_conversations c ON c.id=m.conversation_id
        JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
        WHERE m.is_deleted=false AND c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false) m
      ON (m.sent_at AT TIME ZONE 'UTC')::date=d.dia::date GROUP BY d.dia ORDER BY d.dia`));
    return { origens, resumo: { abertas: contagem.abertas, pendentes: contagem.pendentes, qualificados: totais.qualificados,
      taxaResposta: contagem.recebidas ? Math.round(contagem.respondidas / contagem.recebidas * 100) : 0,
      totalContatos: totais.total, contatos, conversas: historicos, volume, atualizadoEm: new Date().toISOString() } };
  });
  if (!consultarIa) return resumo;
  const estados = await consultarIa(origens);
  return { ...resumo, conversas: resumo.conversas.map(conversa => ({ ...conversa, estadoIa: estados.get(conversa.id) })) };
}
