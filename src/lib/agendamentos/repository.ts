import { sql, type SQL } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { systemUserId } from "../db/bootstrap";
import { agendamentoSchema, identidadeAgendamento, validarData, type Agendamento } from "./schema";

interface Transacao { execute(query: SQL): PromiseLike<unknown> }
export interface BancoAgendamentos extends Transacao { transaction<T>(work: (tx: Transacao) => Promise<T>): Promise<T> }
function linhas<T>(result: unknown): T[] { return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[]; }
const campos = sql`id,telefone,instancia,mensagem,agendado_para AS "agendadoPara",status,version,codigo_erro AS "codigoErro",enviado_em AS "enviadoEm"`;
function normalizar(item: Agendamento): Agendamento {
  return { ...item, agendadoPara: new Date(item.agendadoPara).toISOString(), enviadoEm: item.enviadoEm ? new Date(item.enviadoEm).toISOString() : null };
}
async function auditar(tx: Transacao, id: string, acao: string, autor = systemUserId) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
    VALUES(${acao},'agendamento',${id},'[]'::jsonb,${autor})`);
}
export async function listarAgendamentos(banco: BancoAgendamentos) {
  return linhas<Agendamento>(await banco.execute(sql`SELECT ${campos} FROM atendeia_agendamentos WHERE is_deleted=false ORDER BY agendado_para DESC,id`)).map(normalizar);
}
export async function salvarAgendamento(banco: BancoAgendamentos, entrada: unknown, identidade?: unknown, autor = systemUserId) {
  const dados = agendamentoSchema.parse(entrada);
  const alvo = identidade === undefined ? null : identidadeAgendamento.parse(identidade);
  if (alvo && alvo.id !== dados.id) throw new ErroDeNegocio("Agendamento inválido.");
  if (!validarData(dados.agendadoPara)) throw new ErroDeNegocio("Escolha uma data entre um minuto e um ano no futuro.");
  return banco.transaction(async tx => {
    const ator = linhas(await tx.execute(sql`SELECT id FROM atendeia_settings_actors WHERE id='bootstrap-admin' AND role='super_admin' AND is_deleted=false`));
    if (!ator.length) throw new ErroDeNegocio("Administrador indisponível.");
    const resultado = alvo ? await tx.execute(sql`UPDATE atendeia_agendamentos SET telefone=${dados.telefone},instancia=${dados.instancia},
      mensagem=${dados.mensagem},agendado_para=${dados.agendadoPara}::timestamptz,version=version+1,updated_at=now(),modified_by=${autor}
      WHERE id=${alvo.id} AND version=${alvo.version} AND status='pendente' AND is_deleted=false RETURNING ${campos}`)
      : await tx.execute(sql`INSERT INTO atendeia_agendamentos(id,telefone,instancia,mensagem,agendado_para,modified_by)
        VALUES(${dados.id},${dados.telefone},${dados.instancia},${dados.mensagem},${dados.agendadoPara}::timestamptz,${autor})
        ON CONFLICT(id) DO NOTHING RETURNING ${campos}`);
    const item = linhas<Agendamento>(resultado)[0];
    if (!item) throw new ErroDeNegocio("Agendamento já registrado ou alterado. Recarregue a lista antes de tentar novamente.");
    await auditar(tx, item.id, alvo ? "admin_agendamento_editado" : "admin_agendamento_criado", autor);
    return normalizar(item);
  });
}
export async function cancelarAgendamento(banco: BancoAgendamentos, entrada: unknown, autor = systemUserId) {
  const alvo = identidadeAgendamento.parse(entrada);
  return banco.transaction(async tx => {
    const ator = linhas(await tx.execute(sql`SELECT id FROM atendeia_settings_actors WHERE id='bootstrap-admin' AND role='super_admin' AND is_deleted=false`));
    if (!ator.length) throw new ErroDeNegocio("Administrador indisponível.");
    const [item] = linhas<Agendamento>(await tx.execute(sql`UPDATE atendeia_agendamentos SET status='cancelado',version=version+1,updated_at=now(),modified_by=${autor}
      WHERE id=${alvo.id} AND version=${alvo.version} AND status='pendente' AND is_deleted=false RETURNING ${campos}`));
    if (!item) throw new ErroDeNegocio("O agendamento mudou ou o envio já começou. Recarregue a lista.");
    await auditar(tx, item.id, "admin_agendamento_cancelado", autor); return normalizar(item);
  });
}
export async function reservarAgendamento(banco: BancoAgendamentos, instancia: string) {
  return banco.transaction(async tx => {
    // Queda após reservar: não reenviar, pois o provedor pode ter aceitado a mensagem.
    const antigos = linhas<{ id: string }>(await tx.execute(sql`UPDATE atendeia_agendamentos SET status='incerto',codigo_erro='processamento_interrompido',
      version=version+1,updated_at=now(),modified_by=${systemUserId} WHERE is_deleted=false AND status='enviando' AND iniciado_em < now()-interval '5 minutes' RETURNING id`));
    for (const item of antigos) await auditar(tx, item.id, "agendamento_incerto");
    const [item] = linhas<Agendamento>(await tx.execute(sql`UPDATE atendeia_agendamentos SET status='enviando',iniciado_em=now(),
      version=version+1,updated_at=now(),modified_by=${systemUserId} WHERE id=(SELECT id FROM atendeia_agendamentos
        WHERE is_deleted=false AND status='pendente' AND instancia=${instancia} AND agendado_para<=now()
        ORDER BY agendado_para,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ${campos}`));
    if (!item) return null;
    await auditar(tx, item.id, "agendamento_iniciado"); return normalizar(item);
  });
}
export async function concluirAgendamento(banco: BancoAgendamentos, item: Agendamento, status: "enviado" | "incerto" | "erro", codigo: string | null, provedor: string | null) {
  await banco.transaction(async tx => {
    const updated = linhas(await tx.execute(sql`UPDATE atendeia_agendamentos SET status=${status},codigo_erro=${codigo},provedor_id=${provedor},
      enviado_em=${status === "enviado" ? new Date().toISOString() : null}::timestamptz,version=version+1,updated_at=now(),modified_by=${systemUserId}
      WHERE id=${item.id} AND version=${item.version} AND status='enviando' AND is_deleted=false RETURNING id`));
    if (!updated.length) throw new Error("Reserva de agendamento indisponível.");
    await auditar(tx, item.id, `agendamento_${status}`);
  });
}
