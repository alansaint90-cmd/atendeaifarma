import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { autorizar, elegivel, reservaAtiva, hoje, type AtorFarmacia } from "./comum";
import { descreverPagamento } from "./pagamento";

export interface PedidoLista { id:string; numero:string; cliente:string; telefone:string|null; total:string; status:string; origem:string; responsavel:string|null; data:string; conferencia:string|null; expira:string|null; conversaId:string|null; itens:{produtoId:string;descricao:string;quantidade:number;preco:string;receita:boolean}[]; eventos:{tipo:string;detalhe:string;data:string;autor:string}[] }
export async function listarPedidos(banco:BancoSql,ator:AtorFarmacia,entrada:unknown) {
  const v=z.strictObject({status:z.string().max(40).default(""),pagina:z.number().int().min(1).default(1),id:z.uuid().optional()}).parse(entrada);
  return banco.transaction(async tx=>{
    await autorizar(tx,ator,"operador",true);
    const filtro=sql`o.is_deleted=false AND ${v.status ? sql`o.status=${v.status}` : sql`true`} AND ${v.id ? sql`o.id=${v.id}` : sql`true`}`;
    const [c]=linhas<{total:number}>(await tx.execute(sql`SELECT count(*)::int total FROM atendeia_pedidos o WHERE ${filtro}`));
    const pedidos=linhas<PedidoLista>(await tx.execute(sql`SELECT o.id,o.numero,c.name cliente,c.phone telefone,o.total::text,o.status,o.origem,u.name responsavel,o.created_at::text data,
      o.conferencia,o.conversa_id "conversaId",(SELECT min(expira_em)::text FROM atendeia_pedidos_reservas r WHERE r.pedido_id=o.id AND ${reservaAtiva}) expira
      FROM atendeia_pedidos o JOIN atendeia_contacts c ON c.id=o.contato_id LEFT JOIN atendeia_users u ON u.id=o.responsavel_id
      WHERE ${filtro} ORDER BY o.created_at DESC,o.id LIMIT 30 OFFSET ${(v.pagina-1)*30}`));
    for (const p of pedidos) {
      p.itens=linhas(await tx.execute(sql`SELECT i.produto_id "produtoId",i.descricao,i.quantidade,i.preco::text,(pr.receita OR pr.controle<>'') receita
        FROM atendeia_pedidos_itens i JOIN atendeia_produtos pr ON pr.id=i.produto_id WHERE i.pedido_id=${p.id} AND i.is_deleted=false ORDER BY i.id`));
      p.eventos=linhas(await tx.execute(sql`SELECT e.tipo,e.detalhe,e.created_at::text data,u.name autor FROM atendeia_pedidos_eventos e JOIN atendeia_users u ON u.id=e.modified_by
        WHERE e.pedido_id=${p.id} AND e.is_deleted=false ORDER BY e.created_at,e.id`));
      p.eventos=p.eventos.map(e=>e.tipo==="pagamento"?{...e,detalhe:descreverPagamento(e.detalhe)}:e);
    }
    return {pedidos,total:c.total};
  });
}
export async function painelFarmacia(banco:BancoSql,ator:AtorFarmacia) {
  return banco.transaction(async tx=>{
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    await autorizar(tx,ator,"operador");
    const [estoque]=linhas<{total:number;disponiveis:number;esgotados:number;baixos:number;vencendo:number}>(await tx.execute(sql`
      WITH saldos AS (SELECT p.id,p.ativo,p.minimo,coalesce(sum(CASE WHEN ${elegivel} THEN greatest(l.quantidade-coalesce(r.qtd,0),0) ELSE 0 END),0)::int saldo,
        bool_or(l.validade BETWEEN ${hoje} AND ${hoje}+30 AND l.quantidade>0 AND l.is_deleted=false AND l.bloqueado=false) vencendo
        FROM atendeia_produtos p LEFT JOIN atendeia_produtos_lotes l ON l.produto_id=p.id
        LEFT JOIN LATERAL (SELECT sum(r.quantidade)::int qtd FROM atendeia_pedidos_reservas r WHERE r.lote_id=l.id AND ${reservaAtiva}) r ON true
        WHERE p.is_deleted=false GROUP BY p.id)
      SELECT count(*)::int total,count(*) FILTER(WHERE saldo>0)::int disponiveis,count(*) FILTER(WHERE ativo AND saldo=0)::int esgotados,
      count(*) FILTER(WHERE saldo>0 AND saldo<=minimo)::int baixos,count(*) FILTER(WHERE vencendo AND ativo)::int vencendo FROM saldos`));
    const [vendas]=linhas<{pedidos:number;confirmados:number;pendentes:number;faturamento:string}>(await tx.execute(sql`SELECT count(*)::int pedidos,
      count(*) FILTER(WHERE confirmado_em IS NOT NULL AND status<>'cancelado')::int confirmados,
      count(*) FILTER(WHERE status IN ('novo','aguardando_confirmacao','aguardando_pagamento'))::int pendentes,
      coalesce(sum(total) FILTER(WHERE confirmado_em IS NOT NULL AND status<>'cancelado'),0)::text faturamento FROM atendeia_pedidos WHERE is_deleted=false`));
    const [atendimento]=linhas<{consultas:number;atendimentos:number}>(await tx.execute(sql`SELECT (SELECT count(DISTINCT split_part(chave,':',1))::int FROM atendeia_produtos_consultas WHERE is_deleted=false) consultas,
      (SELECT count(DISTINCT conversation_id)::int FROM atendeia_messages WHERE sender_type='bot' AND direction='outbound' AND is_deleted=false) atendimentos`));
    const maisVendidos=linhas<{nome:string;quantidade:number}>(await tx.execute(sql`SELECT p.nome,sum(i.quantidade)::int quantidade FROM atendeia_pedidos_itens i
      JOIN atendeia_pedidos o ON o.id=i.pedido_id JOIN atendeia_produtos p ON p.id=i.produto_id
      WHERE i.is_deleted=false AND o.is_deleted=false AND p.is_deleted=false AND o.confirmado_em IS NOT NULL AND o.status<>'cancelado'
      GROUP BY p.id,p.nome ORDER BY quantidade DESC,p.nome LIMIT 10`));
    return {estoque,vendas,atendimento,maisVendidos,atualizadoEm:new Date().toISOString()};
  });
}
export async function contextoCadastro(banco:BancoSql,ator:AtorFarmacia) {
  return banco.transaction(async tx=>{
    await autorizar(tx,ator,"operador");
    return {
      contatos:linhas<{id:string;nome:string;telefone:string|null}>(await tx.execute(sql`SELECT id,name nome,phone telefone FROM atendeia_contacts WHERE is_deleted=false ORDER BY name LIMIT 500`)),
      usuarios:linhas<{id:string;nome:string;registro:string|null;habilitado:boolean|null}>(await tx.execute(sql`SELECT u.id,u.name nome,f.registro,f.habilitado FROM atendeia_users u
        LEFT JOIN atendeia_farmaceuticos f ON f.usuario_id=u.id AND f.is_deleted=false WHERE u.enabled=true AND u.is_deleted=false ORDER BY u.name`)),
      categorias:linhas<{nome:string}>(await tx.execute(sql`SELECT DISTINCT categoria nome FROM atendeia_produtos WHERE is_deleted=false ORDER BY categoria`)),
    };
  });
}
