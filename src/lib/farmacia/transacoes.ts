import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { linhas, type TransacaoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { elegivel, reservaAtiva } from "./comum";
import type { PedidoInterno } from "./pedidos";

export async function reservarItens(tx:TransacaoSql,p:PedidoInterno,autor:string) {
  if (!["aguardando_confirmacao","aguardando_pagamento"].includes(p.status)) throw new ErroDeNegocio("Pedido não aceita reserva.");
  const prazo = Number(process.env.FARMACIA_RESERVA_MINUTOS ?? "15");
  if (!Number.isInteger(prazo) || prazo<1 || prazo>120) throw new ErroDeNegocio("Prazo de reserva inválido no servidor.");
  await tx.execute(sql`UPDATE atendeia_pedidos_reservas SET status='liberada',updated_at=clock_timestamp(),modified_by=${autor}
    WHERE pedido_id=${p.id} AND status='ativa' AND is_deleted=false`);
  const itens = linhas<{produto_id:string;quantidade:number;preco:string}>(await tx.execute(sql`SELECT produto_id,quantidade,preco::text FROM atendeia_pedidos_itens WHERE pedido_id=${p.id} AND is_deleted=false ORDER BY produto_id`));
  for (const item of itens) {
    const [produto]=linhas<{preco:string}>(await tx.execute(sql`SELECT coalesce(promocional,preco)::text preco FROM atendeia_produtos WHERE id=${item.produto_id} AND ativo=true AND is_deleted=false FOR UPDATE`));
    if (!produto || produto.preco!==item.preco) throw new ErroDeNegocio("Produto ou preço mudou. Cancele e recrie o pedido para conferir os novos valores.");
    const lotes=linhas<{id:string;livre:number}>(await tx.execute(sql`SELECT l.id,(l.quantidade-coalesce(r.qtd,0))::int livre FROM atendeia_produtos_lotes l JOIN atendeia_produtos p ON p.id=l.produto_id
      LEFT JOIN LATERAL (SELECT sum(r.quantidade)::int qtd FROM atendeia_pedidos_reservas r WHERE r.lote_id=l.id AND ${reservaAtiva}) r ON true
      WHERE p.id=${item.produto_id} AND ${elegivel} ORDER BY l.validade NULLS LAST,l.id FOR UPDATE OF l`));
    let restante=item.quantidade;
    for (const lote of lotes) {
      const qtd=Math.min(restante,Math.max(0,lote.livre)); if (!qtd) continue;
      await tx.execute(sql`INSERT INTO atendeia_pedidos_reservas(pedido_id,lote_id,quantidade,expira_em,modified_by)
        VALUES (${p.id},${lote.id},${qtd},now()+${prazo}*interval '1 minute',${autor})`);
      restante-=qtd;
    }
    if (restante) throw new ErroDeNegocio("Estoque insuficiente. Nenhuma reserva deste pedido foi alterada.");
  }
  await tx.execute(sql`UPDATE atendeia_pedidos SET status='aguardando_pagamento',updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.id} AND is_deleted=false`);
}

export async function confirmarItens(tx:TransacaoSql,p:PedidoInterno,autor:string,referencia:string) {
  if (p.status!=="aguardando_pagamento") throw new ErroDeNegocio("Confirme os itens e reserve o estoque antes de confirmar a venda.");
  const restritos=linhas(await tx.execute(sql`SELECT i.id FROM atendeia_pedidos_itens i JOIN atendeia_produtos p ON p.id=i.produto_id
    WHERE i.pedido_id=${p.id} AND i.is_deleted=false AND p.is_deleted=false AND (p.receita=true OR p.controle<>'')`));
  if (restritos.length) {
    const valido=p.conferido_por && linhas(await tx.execute(sql`SELECT f.id FROM atendeia_farmaceuticos f JOIN atendeia_users u ON u.id=f.usuario_id
      WHERE f.usuario_id=${p.conferido_por} AND f.habilitado=true AND f.is_deleted=false AND u.enabled=true AND u.is_deleted=false`)).length;
    if (!valido) throw new ErroDeNegocio("É necessária a conferência de um farmacêutico habilitado.");
  }
  const itens=linhas<{produto_id:string;quantidade:number}>(await tx.execute(sql`SELECT produto_id,quantidade FROM atendeia_pedidos_itens WHERE pedido_id=${p.id} AND is_deleted=false ORDER BY produto_id`));
  for (const item of itens) {
    const [s]=linhas<{qtd:number}>(await tx.execute(sql`SELECT coalesce(sum(r.quantidade),0)::int qtd FROM atendeia_pedidos_reservas r
      JOIN atendeia_produtos_lotes l ON l.id=r.lote_id JOIN atendeia_produtos p ON p.id=l.produto_id
      WHERE r.pedido_id=${p.id} AND l.produto_id=${item.produto_id} AND ${reservaAtiva} AND ${elegivel}`));
    if (s.qtd!==item.quantidade) throw new ErroDeNegocio("Reserva expirada ou lote indisponível. Reserve novamente antes da venda.");
  }
  const reservas=linhas<{id:string;lote_id:string;quantidade:number;saldo:number}>(await tx.execute(sql`SELECT r.id,r.lote_id,r.quantidade,l.quantidade saldo
    FROM atendeia_pedidos_reservas r JOIN atendeia_produtos_lotes l ON l.id=r.lote_id WHERE r.pedido_id=${p.id} AND ${reservaAtiva} AND l.is_deleted=false ORDER BY l.id,r.id FOR UPDATE OF l,r`));
  for (const r of reservas) {
    const [lote]=linhas<{quantidade:number}>(await tx.execute(sql`UPDATE atendeia_produtos_lotes SET quantidade=quantidade-${r.quantidade},updated_at=clock_timestamp(),modified_by=${autor}
      WHERE id=${r.lote_id} AND quantidade>=${r.quantidade} AND is_deleted=false RETURNING quantidade`));
    if (!lote) throw new ErroDeNegocio("Saldo insuficiente. Venda não confirmada.");
    await tx.execute(sql`INSERT INTO atendeia_produtos_movimentos(lote_id,pedido_id,quantidade,anterior,posterior,tipo,motivo,chave,modified_by)
      VALUES (${r.lote_id},${p.id},${-r.quantidade},${lote.quantidade+r.quantidade},${lote.quantidade},'venda','Venda confirmada por atendente',${`venda:${r.id}`},${autor})`);
  }
  await tx.execute(sql`UPDATE atendeia_pedidos_reservas SET status='consumida',updated_at=clock_timestamp(),modified_by=${autor} WHERE pedido_id=${p.id} AND status='ativa' AND is_deleted=false`);
  await tx.execute(sql`UPDATE atendeia_pedidos SET status='pagamento_confirmado',referencia=${referencia},confirmado_em=clock_timestamp(),responsavel_id=${autor},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.id} AND is_deleted=false`);
}

export async function cancelarItens(tx:TransacaoSql,p:PedidoInterno,autor:string) {
  if (p.confirmado_em) {
    const saidas=linhas<{id:string;lote_id:string;quantidade:number;produto_id:string;codigo:string;validade:string|null}>(await tx.execute(sql`SELECT m.id,m.lote_id,m.quantidade,l.produto_id,l.codigo,l.validade::text
      FROM atendeia_produtos_movimentos m JOIN atendeia_produtos_lotes l ON l.id=m.lote_id
      WHERE m.pedido_id=${p.id} AND m.tipo='venda' AND m.is_deleted=false AND l.is_deleted=false ORDER BY l.id`));
    for (const s of saidas) {
      const qtd=-s.quantidade; let loteId=s.lote_id;
      // Após entrega, devolução vai para um novo lote bloqueado, nunca para venda automática.
      if (p.status==="concluido") {
        loteId=randomUUID();
        await tx.execute(sql`INSERT INTO atendeia_produtos_lotes(id,produto_id,codigo,validade,quantidade,bloqueado,modified_by)
          VALUES (${loteId},${s.produto_id},${`${s.codigo} / devolução`},${s.validade},0,true,${autor})`);
      }
      const [l]=linhas<{quantidade:number}>(await tx.execute(sql`UPDATE atendeia_produtos_lotes SET quantidade=quantidade+${qtd},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${loteId} AND is_deleted=false RETURNING quantidade`));
      await tx.execute(sql`INSERT INTO atendeia_produtos_movimentos(lote_id,pedido_id,quantidade,anterior,posterior,tipo,motivo,chave,modified_by)
        VALUES (${loteId},${p.id},${qtd},${l.quantidade-qtd},${l.quantidade},'estorno',${p.status==="concluido" ? "Devolução recebida: quarentena" : "Cancelamento antes da entrega"},${`estorno:${s.id}`},${autor})`);
    }
  }
  await tx.execute(sql`UPDATE atendeia_pedidos_reservas SET status='liberada',updated_at=clock_timestamp(),modified_by=${autor} WHERE pedido_id=${p.id} AND status='ativa' AND is_deleted=false`);
  await tx.execute(sql`UPDATE atendeia_pedidos SET status='cancelado',updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.id} AND is_deleted=false`);
}
