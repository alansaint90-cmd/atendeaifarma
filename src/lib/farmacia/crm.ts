import { sql } from "drizzle-orm";
import { linhas,type TransacaoSql } from "../db/porta";
import { auditar } from "./comum";
// Chamado dentro da mesma transação de pedido/estoque. Não usa o fechamento manual.
export async function atualizarValorNegociacao(tx:TransacaoSql,autor:string,pedidoId:string) {
  const [o]=linhas<{id:string}>(await tx.execute(sql`UPDATE atendeia_funis_oportunidades SET valor=(SELECT total FROM atendeia_pedidos WHERE id=${pedidoId} AND is_deleted=false),updated_at=clock_timestamp(),modified_by=${autor}
    WHERE id=(SELECT oportunidade_id FROM atendeia_pedidos WHERE id=${pedidoId} AND is_deleted=false) AND status='aberta' AND is_deleted=false RETURNING id`));
  if(o)await auditar(tx,autor,o.id,"crm_pedido_atualizado");
}
export async function criarNegociacao(tx:TransacaoSql,autor:string,pedidoId:string) {
  const [p]=linhas<{numero:string;total:string;contato_id:string;conversa_id:string|null}>(await tx.execute(sql`SELECT numero,total,contato_id,conversa_id FROM atendeia_pedidos WHERE id=${pedidoId} AND is_deleted=false`));
  await tx.execute(sql`INSERT INTO atendeia_funis(nome,modified_by) VALUES ('Vendas da farmácia',${autor}) ON CONFLICT DO NOTHING`);
  const [f]=linhas<{id:string}>(await tx.execute(sql`SELECT id FROM atendeia_funis WHERE nome='Vendas da farmácia' AND is_deleted=false`));
  await tx.execute(sql`INSERT INTO atendeia_funis_etapas(funil_id,nome,ordem,modified_by) VALUES (${f.id},'Pedido em atendimento',0,${autor}) ON CONFLICT DO NOTHING`);
  const [e]=linhas<{id:string}>(await tx.execute(sql`SELECT id FROM atendeia_funis_etapas WHERE funil_id=${f.id} AND ordem=0 AND is_deleted=false`));
  await tx.execute(sql`INSERT INTO atendeia_funis_acessos(funil_id,usuario_id,modified_by) VALUES (${f.id},${autor},${autor}) ON CONFLICT DO NOTHING`);
  const [o]=linhas<{id:string}>(await tx.execute(sql`INSERT INTO atendeia_funis_oportunidades(titulo,valor,funil_id,etapa_id,contato_id,canal_id,responsavel_id,modified_by)
    VALUES (${p.numero},${p.total},${f.id},${e.id},${p.contato_id},(SELECT channel_id FROM atendeia_conversations WHERE id=${p.conversa_id} AND is_deleted=false),${autor},${autor}) RETURNING id`));
  await tx.execute(sql`UPDATE atendeia_pedidos SET oportunidade_id=${o.id},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${pedidoId} AND is_deleted=false`);
  await auditar(tx,autor,o.id,"crm_pedido_criado");
}
export async function sincronizarNegociacao(tx:TransacaoSql,autor:string,pedidoId:string) {
  const [p]=linhas<{status:string;oportunidade_id:string|null;total:string}>(await tx.execute(sql`SELECT status,oportunidade_id,total FROM atendeia_pedidos WHERE id=${pedidoId} AND is_deleted=false`));
  if(!p.oportunidade_id)return;
  if(p.status!=="cancelado"&&!['pagamento_confirmado','em_separacao','concluido'].includes(p.status))return;
  const ganhou=p.status!=="cancelado";let motivo:string|null=null;
  if(!ganhou){
    await tx.execute(sql`INSERT INTO atendeia_motivos_perda(nome,modified_by) VALUES ('Pedido cancelado ou devolvido',${autor}) ON CONFLICT DO NOTHING`);
    const [m]=linhas<{id:string}>(await tx.execute(sql`SELECT id FROM atendeia_motivos_perda WHERE nome='Pedido cancelado ou devolvido' AND is_deleted=false`));motivo=m.id;
  }
  await tx.execute(sql`UPDATE atendeia_funis_oportunidades SET status=${ganhou?'ganha':'perdida'},fechado_em=clock_timestamp(),motivo_id=${motivo},responsavel_id=${autor},
    updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.oportunidade_id} AND is_deleted=false`);
  // O registro original do fechamento é preservado; estornos ficam no histórico do pedido.
  await tx.execute(sql`INSERT INTO atendeia_funis_oportunidades_fechamentos(oportunidade_id,funil_id,etapa_anterior_id,responsavel_id,valor,status,motivo,observacao,modified_by)
    SELECT id,funil_id,etapa_id,${autor},valor,status,${ganhou?null:'Pedido cancelado ou devolvido'},'Origem: pedido da farmácia',${autor}
    FROM atendeia_funis_oportunidades WHERE id=${p.oportunidade_id} AND is_deleted=false ON CONFLICT DO NOTHING`);
  await auditar(tx,autor,p.oportunidade_id,ganhou?"crm_venda_confirmada":"crm_venda_estornada");
}
