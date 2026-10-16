import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";

const instante = z.iso.datetime({ offset: true });
export const filtroPainelSchema = z.strictObject({
  inicio: instante,
  fim: instante,
  fuso: z.string().min(1).max(100).regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/),
  canalId: z.uuid().nullable(),
});
export type FiltroPainel = z.infer<typeof filtroPainelSchema>;
export interface PontoPainel { dia: string; conversas: number; ia: number; humano: number }
export interface PainelOperacional {
  abertas: number; pendentes: number; atendimentoIa: number; atendimentoHumano: number;
  novas: number; atendidasIa: number; atendidasHumano: number; totalAtendidas: number;
  canais: { id: string; nome: string }[];
  contatos: { id: string; nome: string; telefone: string | null }[];
  evolucao: PontoPainel[]; atualizadoEm: string;
}

function codigoSql(erro: unknown): string {
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 4; nivel++) {
    if (typeof atual !== "object" || atual === null) break;
    if ("code" in atual && typeof atual.code === "string" && /^[A-Z0-9]{5}$/.test(atual.code)) return atual.code;
    atual = "cause" in atual ? atual.cause : undefined;
  }
  return "indisponível";
}

export async function consultarPainel(banco: BancoSql, entrada: unknown): Promise<PainelOperacional> {
  const filtro = filtroPainelSchema.parse(entrada);
  const inicio = new Date(filtro.inicio), fim = new Date(filtro.fim);
  if (!(inicio < fim) || fim.getTime() - inicio.getTime() > 366 * 86400000) {
    throw new ErroDeNegocio("Escolha um intervalo de até 366 dias, com início anterior ao fim.");
  }
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: filtro.fuso }); }
  catch { throw new ErroDeNegocio("Fuso horário inválido."); }

  let etapa = "P01";
  try { return await banco.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const canal = filtro.canalId ? sql`ch.id=${filtro.canalId}` : sql`true`;
    etapa = "P02";
    const canais = linhas<{ id: string; nome: string }>(await tx.execute(sql`SELECT id,name nome FROM atendeia_channels
      WHERE is_deleted=false ORDER BY name,id`));
    if (filtro.canalId && !canais.some(item => item.id === filtro.canalId)) throw new ErroDeNegocio("Canal indisponível.");
    etapa = "P03";
    const [geral] = linhas<{ abertas: number; pendentes: number; ia: number; humano: number }>(await tx.execute(sql`
      SELECT count(*) FILTER (WHERE c.status<>'closed')::int abertas,
        count(*) FILTER (WHERE c.status<>'closed' AND (c.status='pending' OR ultimo.direction='inbound'))::int pendentes,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false AND m.direction='outbound' AND m.sender_type='bot'))::int ia,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false AND m.direction='outbound' AND m.sender_type='agent'))::int humano
      FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
      LEFT JOIN LATERAL (SELECT direction FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false
        ORDER BY sent_at DESC,created_at DESC,id DESC LIMIT 1) ultimo ON true
      WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false`));
    etapa = "P04";
    const [periodo] = linhas<{ novas: number; ia: number; humano: number; atendidas: number }>(await tx.execute(sql`
      SELECT count(*) FILTER (WHERE c.created_at>=${inicio.toISOString()} AND c.created_at<${fim.toISOString()})::int novas,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false
          AND m.direction='outbound' AND m.sender_type='bot' AND m.sent_at>=${inicio.toISOString()} AND m.sent_at<${fim.toISOString()}))::int ia,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false
          AND m.direction='outbound' AND m.sender_type='agent' AND m.sent_at>=${inicio.toISOString()} AND m.sent_at<${fim.toISOString()}))::int humano,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.is_deleted=false
          AND m.direction='outbound' AND m.sender_type IN ('bot','agent') AND m.sent_at>=${inicio.toISOString()} AND m.sent_at<${fim.toISOString()}))::int atendidas
      FROM atendeia_conversations c JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false AND ${canal}`));
    etapa = "P05";
    const evolucao = linhas<PontoPainel>(await tx.execute(sql`
      WITH dias AS (SELECT dia::date FROM generate_series(
        (${inicio.toISOString()}::timestamptz AT TIME ZONE ${filtro.fuso})::date,
        ((${fim.toISOString()}::timestamptz - interval '1 millisecond') AT TIME ZONE ${filtro.fuso})::date,
        interval '1 day') dia),
      base AS (SELECT c.id,c.created_at FROM atendeia_conversations c
        JOIN atendeia_contacts p ON p.id=c.contact_id JOIN atendeia_channels ch ON ch.id=c.channel_id
        WHERE c.is_deleted=false AND p.is_deleted=false AND ch.is_deleted=false AND ${canal}),
      criadas AS (SELECT (created_at AT TIME ZONE ${filtro.fuso})::date dia,count(*)::int total FROM base
        WHERE created_at>=${inicio.toISOString()} AND created_at<${fim.toISOString()} GROUP BY 1),
      saidas AS (SELECT (m.sent_at AT TIME ZONE ${filtro.fuso})::date dia,
        count(DISTINCT m.conversation_id) FILTER (WHERE m.sender_type='bot')::int ia,
        count(DISTINCT m.conversation_id) FILTER (WHERE m.sender_type='agent')::int humano
        FROM atendeia_messages m JOIN base b ON b.id=m.conversation_id
        WHERE m.is_deleted=false AND m.direction='outbound' AND m.sent_at>=${inicio.toISOString()} AND m.sent_at<${fim.toISOString()}
        GROUP BY 1)
      SELECT to_char(d.dia,'YYYY-MM-DD') dia,coalesce(c.total,0)::int conversas,
        coalesce(s.ia,0)::int ia,coalesce(s.humano,0)::int humano
      FROM dias d LEFT JOIN criadas c ON c.dia=d.dia LEFT JOIN saidas s ON s.dia=d.dia ORDER BY d.dia`));
    etapa = "P06";
    const contatos = linhas<{ id: string; nome: string; telefone: string | null }>(await tx.execute(sql`
      SELECT p.id,p.name nome,p.phone telefone FROM atendeia_contacts p
      JOIN atendeia_conversations c ON c.contact_id=p.id JOIN atendeia_channels ch ON ch.id=c.channel_id
      WHERE p.is_deleted=false AND c.is_deleted=false AND ch.is_deleted=false AND ${canal}
        AND c.last_message_at>=${inicio.toISOString()} AND c.last_message_at<${fim.toISOString()}
      GROUP BY p.id,p.name,p.phone ORDER BY max(c.last_message_at) DESC,p.id LIMIT 7`));
    return { abertas: geral.abertas, pendentes: geral.pendentes, atendimentoIa: geral.ia, atendimentoHumano: geral.humano,
      novas: periodo.novas, atendidasIa: periodo.ia, atendidasHumano: periodo.humano, totalAtendidas: periodo.atendidas,
      canais, contatos, evolucao, atualizadoEm: new Date().toISOString() };
  }); } catch (erro) {
    if (erro instanceof ErroDeNegocio) throw erro;
    const codigo = codigoSql(erro);
    console.error(`Atende AI: consulta do painel falhou na etapa ${etapa}; SQLSTATE ${codigo}.`);
    throw new ErroDeNegocio(`Não foi possível consultar os indicadores (etapa ${etapa}, código ${codigo}). Tente novamente.`);
  }
}
