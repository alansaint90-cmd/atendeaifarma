import { sql } from "drizzle-orm";
import { linhas, type BancoSql, type TransacaoSql } from "../../db/porta";
import { systemUserId } from "../../db/bootstrap";
import { ErroDeNegocio } from "../../acao";
import { campanhaSchema, identidadeCampanha, validarArquivo, type Campanha, type ContatoCampanha, type ArquivoCampanha } from "./schema";
import { exigirGestorCampanha } from "./acesso";
async function auditar(tx: TransacaoSql, id: string, acao: string, autor: string) {
 await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${acao},'campanha',${id},'[]'::jsonb,${autor})`);
}
export async function contatosElegiveis(banco: TransacaoSql, instancia: string,contatoId?:string): Promise<ContatoCampanha[]> {
 return linhas(await banco.execute(sql`SELECT p.id,p.name nome,p.phone telefone FROM atendeia_contacts p
 WHERE p.is_deleted=false AND ${contatoId?sql`p.id=${contatoId}`:sql`true`} AND p.phone ~ '^[+][1-9][0-9]{6,14}$' AND EXISTS (
 SELECT 1 FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id JOIN atendeia_messages m ON m.conversation_id=c.id
 WHERE c.contact_id=p.id AND c.remote_jid=(substring(p.phone from 2)||'@s.whatsapp.net') AND c.is_deleted=false AND ch.is_deleted=false AND ch.provider='evolution' AND ch.instance_name=${instancia}
 AND m.is_deleted=false AND m.direction='inbound') ORDER BY p.name,p.id`));
}
export async function listarCampanhas(banco: TransacaoSql): Promise<Campanha[]> {
 return linhas(await banco.execute(sql`SELECT c.id,c.nome,c.instancia,c.mensagem,c.intervalo_segundos AS "intervaloSegundos",c.arquivo->>'nome' AS "arquivoNome",c.status,c.version,
 count(d.id)::int total,count(d.id) FILTER(WHERE d.status IN ('pendente','enviando'))::int pendentes,
 count(d.id) FILTER(WHERE d.status='enviado')::int enviados,count(d.id) FILTER(WHERE d.status='incerto')::int incertos,
 count(d.id) FILTER(WHERE d.status='bloqueado')::int bloqueados FROM atendeia_campanhas c
 LEFT JOIN atendeia_campanhas_destinatarios d ON d.campanha_id=c.id AND d.is_deleted=false WHERE c.is_deleted=false GROUP BY c.id ORDER BY c.created_at DESC,c.id`));
}
export async function criarCampanha(banco: BancoSql, entrada: unknown, autor = systemUserId) {
 const dados = campanhaSchema.parse(entrada);
 try { validarArquivo(dados.arquivo); } catch (e) { throw new ErroDeNegocio((e as Error).message); }
 return banco.transaction(async tx => {
  await exigirGestorCampanha(tx,autor);
  const elegiveis = await contatosElegiveis(tx, dados.instancia);
  const ids = new Set(dados.contatos); const contatos = elegiveis.filter(c => ids.has(c.id));
  if (contatos.length !== ids.size) throw new ErroDeNegocio("Selecione apenas contatos com mensagem recebida neste chip. Contatos novos não são permitidos.");
  const inseridos = linhas(await tx.execute(sql`INSERT INTO atendeia_campanhas(id,nome,instancia,mensagem,arquivo,intervalo_segundos,modified_by)
  VALUES(${dados.id},${dados.nome},${dados.instancia},${dados.mensagem},${JSON.stringify(dados.arquivo)}::jsonb,${dados.intervaloSegundos},${autor}) ON CONFLICT(id) DO NOTHING RETURNING id`));
  if (!inseridos.length) throw new ErroDeNegocio("Campanha já cadastrada. Atualize a lista.");
  for (const c of contatos) await tx.execute(sql`INSERT INTO atendeia_campanhas_destinatarios(campanha_id,contato_id,telefone,modified_by) VALUES(${dados.id},${c.id},${c.telefone},${autor})`);
  await auditar(tx, dados.id, "campanha_criada", autor); return dados.id;
 });
}
export async function alterarCampanha(banco: BancoSql, entrada: unknown, acao: "iniciar" | "cancelar", autor = systemUserId) {
 const alvo = identidadeCampanha.parse(entrada);
 await banco.transaction(async tx => {
  await exigirGestorCampanha(tx,autor);
  const [c] = linhas<{status:string;version:number}>(await tx.execute(sql`SELECT status,version FROM atendeia_campanhas WHERE id=${alvo.id} AND is_deleted=false FOR UPDATE`));
  if (!c || c.version !== alvo.version || (acao === "iniciar" ? c.status !== "rascunho" : c.status === "cancelada")) throw new ErroDeNegocio("A campanha mudou. Atualize a lista.");
  await tx.execute(sql`UPDATE atendeia_campanhas SET status=${acao === "iniciar" ? "ativa" : "cancelada"},version=version+1,updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${alvo.id} AND version=${alvo.version} AND is_deleted=false`);
  if (acao === "cancelar") await tx.execute(sql`UPDATE atendeia_campanhas_destinatarios SET status='cancelado',version=version+1,updated_at=clock_timestamp(),modified_by=${autor} WHERE campanha_id=${alvo.id} AND status='pendente' AND is_deleted=false`);
  await auditar(tx, alvo.id, acao === "iniciar" ? "campanha_iniciada" : "campanha_cancelada", autor);
 });
}
export interface EnvioCampanha { id: string; version:number; campanhaId: string; contatoId: string; telefone: string; instancia: string; mensagem: string; arquivo: ArquivoCampanha | null }
export async function reservarEnvio(banco: BancoSql, instancia: string): Promise<EnvioCampanha | null> {
 return banco.transaction(async tx => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'campanhas:'+instancia},0))`);
  const antigos = linhas<{id:string;campanha_id:string}>(await tx.execute(sql`UPDATE atendeia_campanhas_destinatarios SET status='incerto',codigo_erro='processamento_interrompido',version=version+1,updated_at=clock_timestamp(),modified_by=${systemUserId}
   WHERE is_deleted=false AND status='enviando' AND iniciado_em < now()-interval '5 minutes' RETURNING id,campanha_id`));
  for (const a of antigos) await auditar(tx,a.id,"campanha_envio_incerto",systemUserId);
  // Consulta histórica de reservas: mover um envio para a lixeira não libera disparos antecipados.
  const recentes=linhas(await tx.execute(sql`SELECT d.id FROM atendeia_campanhas_destinatarios d JOIN atendeia_campanhas c ON c.id=d.campanha_id WHERE c.instancia=${instancia} AND c.is_deleted IN (false,true) AND d.is_deleted IN (false,true) AND d.iniciado_em>now()-c.intervalo_segundos*interval '1 second' LIMIT 1`));
  if(recentes.length)return null;
  const [c] = linhas<{id:string;instancia:string;mensagem:string;arquivo:ArquivoCampanha|null}>(await tx.execute(sql`SELECT id,instancia,mensagem,arquivo FROM atendeia_campanhas c WHERE c.is_deleted=false AND c.status='ativa' AND c.instancia=${instancia} AND c.proximo_envio<=now()
   AND EXISTS(SELECT 1 FROM atendeia_campanhas_destinatarios d WHERE d.campanha_id=c.id AND d.is_deleted=false AND d.status='pendente') ORDER BY c.proximo_envio,c.id FOR UPDATE SKIP LOCKED LIMIT 1`));
  if (!c) return null;
  const [d] = linhas<{id:string;version:number;contatoId:string;telefone:string}>(await tx.execute(sql`UPDATE atendeia_campanhas_destinatarios SET status='enviando',version=version+1,iniciado_em=now(),updated_at=clock_timestamp(),modified_by=${systemUserId}
   WHERE id=(SELECT id FROM atendeia_campanhas_destinatarios WHERE campanha_id=${c.id} AND is_deleted=false AND status='pendente' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,version,contato_id AS "contatoId",telefone`));
  if (!d) return null;
  await tx.execute(sql`UPDATE atendeia_campanhas SET proximo_envio=now()+intervalo_segundos*interval '1 second',updated_at=clock_timestamp(),modified_by=${systemUserId} WHERE id=${c.id} AND is_deleted=false`);
  await auditar(tx,d.id,"campanha_envio_iniciado",systemUserId);
  return {...d,campanhaId:c.id,instancia:c.instancia,mensagem:c.mensagem,arquivo:c.arquivo};
 });
}
export async function envioPermitido(banco: TransacaoSql, item: EnvioCampanha) {
 const [c] = linhas(await banco.execute(sql`SELECT c.id FROM atendeia_campanhas c JOIN atendeia_campanhas_destinatarios d ON d.campanha_id=c.id WHERE c.id=${item.campanhaId} AND c.is_deleted=false AND d.id=${item.id} AND d.status='enviando' AND d.version=${item.version} AND d.is_deleted=false`));
 if (!c) return false;
 return (await contatosElegiveis(banco,item.instancia,item.contatoId)).some(p => p.id === item.contatoId && p.telefone === item.telefone);
}
export async function concluirEnvio(banco: BancoSql, item: EnvioCampanha, status: "enviado"|"incerto"|"bloqueado", codigo: string|null, provedor: string|null) {
 await banco.transaction(async tx => {
  const atualizados = linhas(await tx.execute(sql`UPDATE atendeia_campanhas_destinatarios SET status=${status},codigo_erro=${codigo},provedor_id=${provedor},version=version+1,updated_at=clock_timestamp(),modified_by=${systemUserId} WHERE id=${item.id} AND version=${item.version} AND status='enviando' AND is_deleted=false RETURNING id`));
  if (!atualizados.length) throw new Error("Reserva da campanha indisponível.");
  await auditar(tx,item.id,'campanha_envio_'+status,systemUserId);
 });
}
export async function destinatariosCampanha(banco: TransacaoSql, id: string) {
 return linhas<{id:string;nome:string;telefone:string;status:string;codigo:string|null}>(await banco.execute(sql`SELECT d.id,p.name nome,d.telefone,d.status,d.codigo_erro codigo FROM atendeia_campanhas_destinatarios d JOIN atendeia_contacts p ON p.id=d.contato_id WHERE d.campanha_id=${id} AND d.is_deleted=false AND p.is_deleted=false ORDER BY p.name,d.id`));
}
