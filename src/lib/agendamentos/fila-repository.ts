import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import type { AlvoFila, AcaoFila, MensagemFila } from "./fila-schema";
import { exigirGestorCampanha } from "../farmacia/campanhas/acesso";
export async function listarFilaSql(banco:BancoSql):Promise<MensagemFila[]> {
 const individuais=linhas<MensagemFila>(await banco.execute(sql`SELECT id,version::text versao,'individual' origem,agendado_para AS data,telefone,instancia,mensagem,status,'Envio individual' AS "origemNome",is_deleted lixeira,false previsao FROM atendeia_agendamentos WHERE is_deleted IN (false,true) ORDER BY agendado_para DESC,id`));
 const campanhas=linhas<MensagemFila>(await banco.execute(sql`WITH fila AS (
 SELECT d.id,d.version::text versao,'campanha' origem,
 CASE WHEN d.status='pendente' THEN greatest(c.proximo_envio,now())+(row_number() OVER(PARTITION BY c.id,d.status ORDER BY d.created_at,d.id)-1)*interval '10 seconds' ELSE coalesce(d.iniciado_em,d.created_at) END AS data,
 d.telefone,c.instancia,concat_ws(E'\n',nullif(c.mensagem,''),CASE WHEN c.arquivo IS NOT NULL AND c.arquivo<>'null'::jsonb THEN '[Anexo: '||(c.arquivo->>'nome')||']' END) mensagem,
 CASE WHEN c.status='rascunho' AND d.status='pendente' THEN 'rascunho' ELSE d.status END status,c.nome AS "origemNome",d.is_deleted lixeira,(d.status='pendente') previsao
 FROM atendeia_campanhas_destinatarios d JOIN atendeia_campanhas c ON c.id=d.campanha_id WHERE c.is_deleted=false AND c.status<>'rascunho' AND d.is_deleted IN (false,true)) SELECT * FROM fila ORDER BY data DESC,id`));
 return [...individuais,...campanhas].map(item=>({...item,data:new Date(item.data).toISOString()}));
}
export async function modificarFilaSql(banco:BancoSql,alvo:AlvoFila,acao:AcaoFila,autor:string) {
 return banco.transaction(async tx=>{
  await exigirGestorCampanha(tx,autor);
  const individual=alvo.origem==="individual";
  const tabela=individual?sql`atendeia_agendamentos`:sql`atendeia_campanhas_destinatarios`;
  const versao=sql`version::text`;
  const [item]=linhas<{status:string;lixeira:boolean}>(await tx.execute(sql`SELECT status,is_deleted lixeira FROM ${tabela} WHERE id=${alvo.id} AND ${versao}=${alvo.versao} AND is_deleted IN (false,true) FOR UPDATE`));
  if(!item)throw new ErroDeNegocio("O envio mudou. Atualize a lista.");
  if(item.status==="enviando")throw new ErroDeNegocio("O envio já começou e não pode ser interrompido com segurança.");
  if(acao==="cancelar"&&(item.status!=="pendente"||item.lixeira))throw new ErroDeNegocio("Somente envios pendentes podem ser cancelados.");
  if(acao==="restaurar"?!item.lixeira:item.lixeira)throw new ErroDeNegocio("O registro mudou. Atualize a lista.");
  const lixeira=acao==="lixeira";
  await tx.execute(sql`UPDATE ${tabela} SET status=${item.status==="pendente"?"cancelado":item.status},is_deleted=${lixeira},deleted_at=${lixeira?new Date().toISOString():null}::timestamptz,updated_at=clock_timestamp(),modified_by=${autor},version=version+1 WHERE id=${alvo.id} AND ${versao}=${alvo.versao} AND is_deleted IN (false,true)`);
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${"fila_"+acao},${individual?"agendamento":"campanha_destinatario"},${alvo.id},'["status","is_deleted"]'::jsonb,${autor})`);
 });
}
