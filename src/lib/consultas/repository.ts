import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import { systemUserId } from "../db/bootstrap";
import { type BancoSql, type TransacaoSql, linhas } from "../db/porta";
import { agendaHorarios, agendaReservas } from "../db/schema/agenda-consultas";
import { vivos, travaDeColisao } from "../db/soft-delete";
import { horariosDoDia, dataConsultaSchema } from "./calendario";
import { identidadeConsultaSchema, instanciaConsultaSchema, reservaConsultaSchema, type HorarioConsulta, type Consulta } from "./schema";

const camposReserva = sql`atendeia_agenda_horarios_reservas.id,horario_id AS "horarioId",instancia,inicio,fim,status,
  atendeia_agenda_horarios_reservas.updated_at AS "atualizadoEm",nome_completo AS "nomeCompleto",telefone,nascimento,cep,rua,numero,complemento,bairro,cidade,uf`;
const relacao = sql`atendeia_agenda_horarios_reservas JOIN atendeia_agenda_horarios ON horario_id=atendeia_agenda_horarios.id`;
const normalizar = <T extends { inicio: string; fim: string; atualizadoEm: string }>(r: T): T => ({ ...r,
  inicio: new Date(r.inicio).toISOString(), fim: new Date(r.fim).toISOString(), atualizadoEm: new Date(r.atualizadoEm).toISOString() });
async function auditar(tx: TransacaoSql, id: string, acao: string, autor: string) {
  // A trilha registra a ação, sem copiar endereço, nascimento ou outros dados do paciente.
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
    VALUES(${acao},'consulta',${id},'[]'::jsonb,${autor})`);
}
export async function consultarHorarios(banco: BancoSql, entrada: unknown) {
  const dia = dataConsultaSchema.parse(entrada);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const periodos = dia < hoje ? [] : horariosDoDia(dia);
  await banco.transaction(async tx => {
    for (const periodo of periodos) {
      const criados = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_agenda_horarios(id,inicio,fim,modified_by)
        VALUES(${randomUUID()},${periodo.inicio}::timestamptz,${periodo.fim}::timestamptz,${systemUserId})
        ON CONFLICT(inicio) WHERE is_deleted=false DO NOTHING RETURNING id`));
      if (criados[0]) await auditar(tx, criados[0].id, "consulta_horario_disponibilizado", systemUserId);
    }
  });
  return linhas<HorarioConsulta>(await banco.execute(sql`SELECT id,inicio,fim,updated_at AS "atualizadoEm",
    NOT EXISTS(SELECT 1 FROM atendeia_agenda_horarios_reservas WHERE horario_id=atendeia_agenda_horarios.id
      AND ${vivos(agendaReservas)} AND status='confirmada') AS disponivel
    FROM atendeia_agenda_horarios WHERE ${vivos(agendaHorarios)} AND inicio >= ${dia + "T00:00:00-03:00"}::timestamptz
      AND inicio < ${dia + "T00:00:00-03:00"}::timestamptz + interval '1 day' AND inicio>now() ORDER BY inicio`)).map(normalizar);
}
export async function listarConsultas(banco: BancoSql, entrada: unknown) {
  const dia = dataConsultaSchema.parse(entrada);
  return linhas<Consulta>(await banco.execute(sql`SELECT ${camposReserva} FROM ${relacao}
    WHERE ${vivos(agendaReservas)} AND ${vivos(agendaHorarios)}
      AND inicio >= ${dia + "T00:00:00-03:00"}::timestamptz AND inicio < ${dia + "T00:00:00-03:00"}::timestamptz + interval '1 day'
    ORDER BY inicio,atendeia_agenda_horarios_reservas.created_at`)).map(normalizar);
}
export async function reservarConsulta(banco: BancoSql, entrada: unknown, contexto: { instancia: string; origem: string; identidade: string; autor: string }) {
  const dados = reservaConsultaSchema.parse(entrada);
  const instancia = instanciaConsultaSchema.parse(contexto.instancia);
  const identidade = z.string().min(1).max(200).parse(contexto.identidade);
  const origem = z.string().min(1).max(200).parse(contexto.origem);
  const autor = z.uuid().parse(contexto.autor);
  return banco.transaction(async tx => {
    // A trava da vaga serializa reservas de todos os chips para a mesma médica.
    const [horario] = linhas<HorarioConsulta>(await tx.execute(sql`SELECT id,inicio,fim,updated_at AS "atualizadoEm" FROM atendeia_agenda_horarios
      WHERE id=${dados.horarioId} AND ${vivos(agendaHorarios)} FOR UPDATE`));
    if (!horario) throw new ErroDeNegocio("Horário indisponível. Escolha outra vaga.");
    const [existente] = linhas<Consulta & { origem: string }>(await tx.execute(sql`SELECT ${camposReserva},origem FROM ${relacao}
      WHERE identidade=${identidade} AND ${vivos(agendaReservas)} AND ${vivos(agendaHorarios)}`));
    if (existente) {
      if (existente.origem !== origem || existente.instancia !== instancia || existente.horarioId !== dados.horarioId || existente.status !== "confirmada") throw new ErroDeNegocio("Solicitação já processada. Consulte a agenda.");
      return normalizar(existente);
    }
    if (new Date(horario.inicio).getTime() <= Date.now()) throw new ErroDeNegocio("Esse horário já passou. Escolha outra vaga.");
    const ocupada = linhas(await tx.execute(sql`SELECT id FROM atendeia_agenda_horarios_reservas WHERE horario_id=${dados.horarioId} AND status='confirmada' AND ${vivos(agendaReservas)}`));
    if (ocupada.length) throw new ErroDeNegocio("Esse horário acabou de ser ocupado. Escolha o próximo horário livre.");
    const p = dados.paciente; const id = randomUUID();
    await tx.execute(sql`INSERT INTO atendeia_agenda_horarios_reservas(id,horario_id,instancia,identidade,origem,nome_completo,telefone,nascimento,cep,rua,numero,complemento,bairro,cidade,uf,modified_by)
      VALUES(${id},${dados.horarioId},${instancia},${identidade},${origem},${p.nomeCompleto},${p.telefone},${p.nascimento}::date,${p.cep},${p.rua},${p.numero},${p.complemento},${p.bairro},${p.cidade},${p.uf},${autor})`);
    await auditar(tx, id, "consulta_confirmada", autor);
    const [reserva] = linhas<Consulta>(await tx.execute(sql`SELECT ${camposReserva} FROM ${relacao} WHERE atendeia_agenda_horarios_reservas.id=${id} AND ${vivos(agendaReservas)} AND ${vivos(agendaHorarios)}`));
    return normalizar(reserva);
  });
}
export async function cancelarConsulta(banco: BancoSql, entrada: unknown, autor: string) {
  const alvo = identidadeConsultaSchema.parse(entrada);
  return banco.transaction(async tx => {
    const [r] = linhas<{ id: string }>(await tx.execute(sql`UPDATE atendeia_agenda_horarios_reservas SET status='cancelada',updated_at=now(),modified_by=${autor}
      WHERE ${travaDeColisao(agendaReservas, alvo.id, new Date(alvo.atualizadoEm))} AND status='confirmada' RETURNING id`));
    if (!r) throw new ErroDeNegocio("A consulta foi alterada. Atualize a agenda.");
    await auditar(tx, r.id, "consulta_cancelada", autor); return r;
  });
}
