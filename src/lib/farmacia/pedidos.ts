import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { centavos, decimal, novoPedidoSchema, comandoPedidoSchema, habilitacaoSchema } from "./validacao";
import { autorizar, evento, auditar, elegivel, reservaAtiva, travarEstoque, type AtorFarmacia } from "./comum";
import { reservarItens, confirmarItens, cancelarItens } from "./transacoes";
import { criarNegociacao, sincronizarNegociacao } from "./crm";

export interface PedidoInterno { id:string; status:string; contato_id:string; conversa_id:string|null; total:string; confirmado_em:string|null; conferido_por:string|null }
export async function criarPedido(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const v = novoPedidoSchema.parse(entrada);
  if (new Set(v.itens.map(i=>i.produtoId)).size!==v.itens.length) throw new ErroDeNegocio("Agrupe as quantidades do mesmo produto.");
  return banco.transaction(async tx => {
    await travarEstoque(tx); const autor = await autorizar(tx,ator,"operador",true);
    const [repetido] = linhas<{id:string;contato_id:string;conversa_id:string|null}>(await tx.execute(sql`SELECT id,contato_id,conversa_id FROM atendeia_pedidos WHERE chave=${v.chave} AND is_deleted=false`));
    if (repetido) {
      const anteriores=linhas<{produtoId:string;quantidade:number}>(await tx.execute(sql`SELECT produto_id "produtoId",quantidade FROM atendeia_pedidos_itens WHERE pedido_id=${repetido.id} AND is_deleted=false ORDER BY produto_id`));
      const normalizar=(itens:{produtoId:string;quantidade:number}[])=>JSON.stringify([...itens].sort((a,b)=>a.produtoId.localeCompare(b.produtoId)));
      if (repetido.contato_id!==v.contatoId || repetido.conversa_id!==v.conversaId || normalizar(anteriores)!==normalizar(v.itens)) throw new ErroDeNegocio("Identificador de operação já utilizado com outros itens ou cliente.");
      return repetido.id;
    }
    if (!linhas(await tx.execute(sql`SELECT id FROM atendeia_contacts WHERE id=${v.contatoId} AND is_deleted=false`)).length) throw new ErroDeNegocio("Contato indisponível.");
    if (v.conversaId && !linhas(await tx.execute(sql`SELECT id FROM atendeia_conversations WHERE id=${v.conversaId} AND contact_id=${v.contatoId} AND is_deleted=false`)).length) throw new ErroDeNegocio("Conversa não pertence ao cliente.");
    const itens: {produtoId:string;quantidade:number;preco:string;descricao:string}[] = []; let total = 0n;
    for (const item of [...v.itens].sort((a,b)=>a.produtoId.localeCompare(b.produtoId))) {
      const [p] = linhas<{id:string;nome:string;concentracao:string;apresentacao:string;embalagem:number;preco:string}>(await tx.execute(sql`
        SELECT id,nome,concentracao,apresentacao,embalagem,coalesce(promocional,preco)::text preco FROM atendeia_produtos
        WHERE id=${item.produtoId} AND ativo=true AND is_deleted=false FOR UPDATE`));
      if (!p) throw new ErroDeNegocio("Produto inativo ou indisponível.");
      const [saldo] = linhas<{qtd:number}>(await tx.execute(sql`SELECT coalesce(sum(greatest(l.quantidade-coalesce(r.qtd,0),0)),0)::int qtd FROM atendeia_produtos_lotes l
        JOIN atendeia_produtos p ON p.id=l.produto_id LEFT JOIN LATERAL (SELECT sum(r.quantidade)::int qtd FROM atendeia_pedidos_reservas r WHERE r.lote_id=l.id AND ${reservaAtiva}) r ON true
        WHERE p.id=${item.produtoId} AND ${elegivel}`));
      if (saldo.qtd<item.quantidade) throw new ErroDeNegocio(`Quantidade indisponível para ${p.nome}.`);
      total += centavos(p.preco)*BigInt(item.quantidade);
      itens.push({produtoId:p.id,quantidade:item.quantidade,preco:p.preco,descricao:`${p.nome} ${p.concentracao} — ${p.apresentacao}, ${p.embalagem} por embalagem`});
    }
    const id = randomUUID(); const numero = `F-${id.slice(0,8).toUpperCase()}-${id.slice(9,13).toUpperCase()}`;
    await tx.execute(sql`INSERT INTO atendeia_pedidos(id,numero,contato_id,conversa_id,responsavel_id,status,origem,total,chave,modified_by)
      VALUES (${id},${numero},${v.contatoId},${v.conversaId},${"sistema" in ator ? null : autor},'aguardando_confirmacao',${"sistema" in ator ? "whatsapp_ia" : "painel"},${decimal(total)},${v.chave},${autor})`);
    for (const i of itens) await tx.execute(sql`INSERT INTO atendeia_pedidos_itens(pedido_id,produto_id,quantidade,preco,descricao,modified_by) VALUES (${id},${i.produtoId},${i.quantidade},${i.preco},${i.descricao},${autor})`);
    await criarNegociacao(tx,autor,id);
    await evento(tx,autor,id,"criado","Aguardando confirmação dos itens; nenhuma baixa realizada.",`criar:${v.chave}`);
    return id;
  });
}
export async function executarPedido(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const v = comandoPedidoSchema.parse(entrada);
  return banco.transaction(async tx => {
    await travarEstoque(tx); const autor = await autorizar(tx,ator,v.acao==="confirmar" || v.acao==="cancelar" ? "admin" : "operador",v.acao==="reservar");
    const chave = `acao:${v.id}:${v.chave}`;
    const [repetido] = linhas<{tipo:string}>(await tx.execute(sql`SELECT tipo FROM atendeia_pedidos_eventos WHERE chave=${chave} AND is_deleted=false`));
    if (repetido) {
      if (repetido.tipo!==v.acao) throw new ErroDeNegocio("Chave utilizada em outra operação.");
      return v.id;
    }
    const [p] = linhas<PedidoInterno>(await tx.execute(sql`SELECT * FROM atendeia_pedidos WHERE id=${v.id} AND is_deleted=false FOR UPDATE`));
    if (!p) throw new ErroDeNegocio("Pedido não encontrado.");
    if (v.acao==="cancelar" && p.status==="cancelado") return p.id;
    if (v.acao==="confirmar" && p.confirmado_em && p.status!=="cancelado") return p.id;
    if (p.status==="cancelado") throw new ErroDeNegocio("Pedido cancelado.");
    if (v.acao==="reservar") await reservarItens(tx,p,autor);
    if (v.acao==="confirmar") {
      if (v.referencia.length<5) throw new ErroDeNegocio("Registre a referência da conferência de pagamento.");
      await confirmarItens(tx,p,autor,v.referencia);
    }
    if (v.acao==="cancelar") {
      if (v.referencia.length<5) throw new ErroDeNegocio("Informe o motivo do cancelamento.");
      await cancelarItens(tx,p,autor);
    }
    if (v.acao==="conferir") {
      if (p.confirmado_em || !["aguardando_confirmacao","aguardando_pagamento"].includes(p.status)) throw new ErroDeNegocio("Pedido não aceita conferência nesta etapa.");
      const habilitado = linhas(await tx.execute(sql`SELECT f.id FROM atendeia_farmaceuticos f JOIN atendeia_users u ON u.id=f.usuario_id
        WHERE f.usuario_id=${autor} AND f.habilitado=true AND f.is_deleted=false AND u.enabled=true AND u.is_deleted=false`));
      if (!habilitado.length) throw new ErroDeNegocio("Conferência exige farmacêutico habilitado no sistema.");
      if (v.referencia.length<5) throw new ErroDeNegocio("Informe apenas o protocolo da conferência, sem dados clínicos.");
      await tx.execute(sql`UPDATE atendeia_pedidos SET conferido_por=${autor},conferencia=${v.referencia},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.id} AND is_deleted=false`);
    }
    if (v.acao==="separar" || v.acao==="concluir") {
      const esperado = v.acao==="separar" ? "pagamento_confirmado" : "em_separacao";
      const proximo = v.acao==="separar" ? "em_separacao" : "concluido";
      if (p.status!==esperado) throw new ErroDeNegocio("Transição de status inválida.");
      await tx.execute(sql`UPDATE atendeia_pedidos SET status=${proximo},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${p.id} AND is_deleted=false`);
    }
    if(v.acao==="confirmar"||v.acao==="cancelar")await sincronizarNegociacao(tx,autor,p.id);
    await evento(tx,autor,p.id,v.acao,v.acao==="conferir" ? "Conferência farmacêutica registrada." : v.referencia || "Operação registrada.",chave);
    return p.id;
  });
}
export async function habilitarFarmaceutico(banco:BancoSql,ator:AtorFarmacia,entrada:unknown) {
  const v = habilitacaoSchema.parse(entrada);
  return banco.transaction(async tx=>{
    await travarEstoque(tx); const autor=await autorizar(tx,ator,"admin");
    const [u]=linhas<{role:string}>(await tx.execute(sql`SELECT role FROM atendeia_users WHERE id=${v.usuarioId} AND enabled=true AND is_deleted=false`));
    if (!u || u.role==="visualizador") throw new ErroDeNegocio("Usuário deve estar ativo e ter acesso operacional.");
    await tx.execute(sql`INSERT INTO atendeia_farmaceuticos(usuario_id,registro,habilitado,modified_by) VALUES (${v.usuarioId},${v.registro},${v.habilitado},${autor})
      ON CONFLICT (usuario_id) DO UPDATE SET registro=${v.registro},habilitado=${v.habilitado},updated_at=clock_timestamp(),modified_by=${autor} WHERE atendeia_farmaceuticos.is_deleted=false`);
    await auditar(tx,autor,v.usuarioId,"farmaceutico_habilitacao");
  });
}
export function chaveMensagem(instancia:string,id:string,acao:string) { return createHash("sha256").update(`${instancia}:${id}:${acao}`).digest("hex"); }
export async function expirarReservas(tx:TransacaoSql,autor:string) {
  const expiradas=linhas<{pedido_id:string}>(await tx.execute(sql`UPDATE atendeia_pedidos_reservas SET status='expirada',updated_at=clock_timestamp(),modified_by=${autor}
    WHERE status='ativa' AND expira_em<=now() AND is_deleted=false RETURNING pedido_id`));
  for (const id of new Set(expiradas.map(r=>r.pedido_id))) await auditar(tx,autor,id,"reserva_expirada");
}
