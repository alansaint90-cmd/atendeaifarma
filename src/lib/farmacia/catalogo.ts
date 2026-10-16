import { sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { buscaSchema, salvarProdutoSchema, entradaSchema, ajusteSchema } from "./validacao";
import { auditar, autorizar, elegivel, hoje, reservaAtiva, travarEstoque, type AtorFarmacia } from "./comum";

export interface Produto {
  id:string; nome:string; principio:string; generico:string; fabricante:string; categoria:string; concentracao:string;
  apresentacao:string; embalagem:number; ean:string|null; sku:string; preco:string; promocional:string|null; minimo:number;
  receita:boolean; controle:string; ativo:boolean; medicamento:boolean; observacoes:string; aliases:string; atualizadoEm:string;
  disponivel:number; fisico:number; reservado:number; validade:string|null; vencido:boolean; vencendo:boolean;
}
export async function consultarProdutos(banco: BancoSql, ator: AtorFarmacia, entrada: unknown): Promise<{produtos:Produto[]; total:number}> {
  const filtro = buscaSchema.parse(entrada);
  return banco.transaction(async tx => {
    await autorizar(tx,ator,"visualizador",true);
    // Pontuação textual determinística; nenhuma equivalência terapêutica é inferida.
    const termos = filtro.termo.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu,"").split(/\s+/).filter(Boolean);
    const campo = sql`translate(lower(concat_ws(' ',p.nome,p.principio,p.generico,p.concentracao,p.apresentacao,p.ean,p.sku,p.aliases)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
    const filtros = termos.map(termo => sql`position(${termo} in ${campo})>0`);
    const texto = filtros.length ? sql.join(filtros,sql` AND `) : sql`true`;
    const categorias = filtro.categoria ? sql`p.categoria=${filtro.categoria}` : sql`true`;
    const condicao = {
      todos:sql`true`, disponivel:sql`disponivel>0`, baixo:sql`disponivel>0 AND disponivel<=minimo`, esgotado:sql`disponivel=0`,
      vencendo:sql`vencendo=true`, vencido:sql`vencido=true`,
    }[filtro.disponibilidade];
    const base = sql`WITH catalogo AS (SELECT p.*,to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "atualizadoEm",
      coalesce(s.disponivel,0)::int disponivel,coalesce(s.fisico,0)::int fisico,coalesce(s.reservado,0)::int reservado,
      s.validade::text validade,coalesce(s.vencido,false) vencido,coalesce(s.vencendo,false) vencendo
      FROM atendeia_produtos p LEFT JOIN LATERAL (
        SELECT sum(l.quantidade)::int fisico,
        sum(coalesce(r.qtd,0))::int reservado,
        sum(CASE WHEN ${elegivel} THEN greatest(l.quantidade-coalesce(r.qtd,0),0) ELSE 0 END)::int disponivel,
        min(l.validade) FILTER (WHERE ${elegivel} AND l.quantidade>0) validade,
        bool_or(l.validade<${hoje} AND l.quantidade>0) vencido,
        bool_or(l.validade BETWEEN ${hoje} AND ${hoje}+30 AND l.quantidade>0 AND l.bloqueado=false) vencendo
        FROM atendeia_produtos_lotes l LEFT JOIN LATERAL (SELECT sum(r.quantidade)::int qtd FROM atendeia_pedidos_reservas r
          WHERE r.lote_id=l.id AND ${reservaAtiva}) r ON true WHERE l.produto_id=p.id AND l.is_deleted=false
      ) s ON true WHERE p.is_deleted=false AND ${texto} AND ${categorias})`;
    const [contagem] = linhas<{total:number}>(await tx.execute(sql`${base} SELECT count(*)::int total FROM catalogo WHERE ${condicao}`));
    const ordem = filtro.ordenar === "quantidade" ? sql`disponivel,nome,id` : sql`nome,id`;
    const produtos = linhas<Produto>(await tx.execute(sql`${base} SELECT * FROM catalogo WHERE ${condicao} ORDER BY ${ordem} LIMIT 40 OFFSET ${(filtro.pagina-1)*40}`));
    return {produtos,total:contagem.total};
  });
}

export async function salvarProduto(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const {id,atualizadoEm,produto:p,estoqueInicial} = salvarProdutoSchema.parse(entrada);
  return banco.transaction(async tx => {
    await travarEstoque(tx); const autor = await autorizar(tx,ator,"admin");
    const alvo = id ?? estoqueInicial?.chave ?? randomUUID();
    if (!id && estoqueInicial) {
      const [existente] = linhas<Record<string,unknown>>(await tx.execute(sql`SELECT * FROM atendeia_produtos WHERE id=${alvo}`));
      if (existente) {
        const [lote] = linhas<{codigo:string;validade:string|null;quantidade:number}>(await tx.execute(sql`SELECT l.codigo,l.validade::text,m.posterior quantidade FROM atendeia_produtos_lotes l JOIN atendeia_produtos_movimentos m ON m.lote_id=l.id WHERE l.produto_id=${alvo} AND m.chave=${estoqueInicial.chave} AND m.tipo='entrada'`));
        if (existente.is_deleted || Object.entries(p).some(([k,v])=>existente[k]!==v) || !lote || lote.codigo!==estoqueInicial.codigo || lote.validade!==estoqueInicial.validade || lote.quantidade!==estoqueInicial.quantidade) throw new ErroDeNegocio("Cadastro já recebido com outros dados. Recarregue o estoque.");
        return alvo;
      }
    }
    if (id) {
      if (!atualizadoEm) throw new ErroDeNegocio("Recarregue o produto antes de editar.");
      const alterado = linhas(await tx.execute(sql`UPDATE atendeia_produtos SET nome=${p.nome},principio=${p.principio},generico=${p.generico},fabricante=${p.fabricante},
        categoria=${p.categoria},concentracao=${p.concentracao},apresentacao=${p.apresentacao},embalagem=${p.embalagem},ean=${p.ean},sku=${p.sku},preco=${p.preco},promocional=${p.promocional},
        minimo=${p.minimo},receita=${p.receita},controle=${p.controle},ativo=${p.ativo},medicamento=${p.medicamento},observacoes=${p.observacoes},aliases=${p.aliases},updated_at=clock_timestamp(),modified_by=${autor}
        WHERE id=${id} AND updated_at=${atualizadoEm}::timestamptz AND is_deleted=false RETURNING id`));
      if (!alterado.length) throw new ErroDeNegocio("Produto alterado por outra pessoa. Recarregue.");
      // Toda edição invalida a conferência farmacêutica de pedidos ainda não vendidos.
      await tx.execute(sql`UPDATE atendeia_pedidos SET conferido_por=NULL,conferencia=NULL,updated_at=clock_timestamp(),modified_by=${autor}
        WHERE confirmado_em IS NULL AND is_deleted=false AND id IN (SELECT pedido_id FROM atendeia_pedidos_itens WHERE produto_id=${id} AND is_deleted=false)`);
    } else await tx.execute(sql`INSERT INTO atendeia_produtos(id,nome,principio,generico,fabricante,categoria,concentracao,apresentacao,embalagem,ean,sku,preco,promocional,minimo,receita,controle,ativo,medicamento,observacoes,aliases,modified_by)
      VALUES (${alvo},${p.nome},${p.principio},${p.generico},${p.fabricante},${p.categoria},${p.concentracao},${p.apresentacao},${p.embalagem},${p.ean},${p.sku},${p.preco},${p.promocional},${p.minimo},${p.receita},${p.controle},${p.ativo},${p.medicamento},${p.observacoes},${p.aliases},${autor})`);
    await auditar(tx,autor,alvo,id ? "produto_editado" : "produto_criado");
    if (estoqueInicial) await registrarEntrada(tx,autor,{...estoqueInicial,produtoId:alvo,bloqueado:false});
    return alvo;
  });
}

export async function entradaEstoque(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const v = entradaSchema.parse(entrada);
  return banco.transaction(async tx => {
    await travarEstoque(tx); const autor = await autorizar(tx,ator,"operador");
    return registrarEntrada(tx,autor,v);
  });
}
async function registrarEntrada(tx:TransacaoSql,autor:string,v:z.infer<typeof entradaSchema>) {
    const [repetido] = linhas<{lote_id:string;produto_id:string;codigo:string;validade:string|null;quantidade:number;bloqueado:boolean;tipo:string}>(await tx.execute(sql`SELECT m.lote_id,l.produto_id,l.codigo,l.validade::text,m.posterior quantidade,l.bloqueado,m.tipo FROM atendeia_produtos_movimentos m JOIN atendeia_produtos_lotes l ON l.id=m.lote_id WHERE m.chave=${v.chave} AND m.is_deleted=false`));
    if (repetido) {
      if (repetido.tipo!=="entrada" || repetido.produto_id!==v.produtoId || repetido.codigo!==v.codigo || repetido.validade!==v.validade || repetido.quantidade!==v.quantidade || repetido.bloqueado!==v.bloqueado) throw new ErroDeNegocio("Chave de entrada já utilizada com outros dados.");
      return repetido.lote_id;
    }
    const [p] = linhas<{medicamento:boolean}>(await tx.execute(sql`SELECT medicamento FROM atendeia_produtos WHERE id=${v.produtoId} AND is_deleted=false FOR UPDATE`));
    if (!p) throw new ErroDeNegocio("Produto não encontrado.");
    if (p.medicamento && !v.validade) throw new ErroDeNegocio("Informe a validade do medicamento.");
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO atendeia_produtos_lotes(id,produto_id,codigo,validade,quantidade,bloqueado,modified_by)
      VALUES (${id},${v.produtoId},${v.codigo},${v.validade},${v.quantidade},${v.bloqueado},${autor})`);
    await tx.execute(sql`INSERT INTO atendeia_produtos_movimentos(lote_id,quantidade,anterior,posterior,tipo,motivo,chave,modified_by)
      VALUES (${id},${v.quantidade},0,${v.quantidade},'entrada','Entrada de mercadoria',${v.chave},${autor})`);
    await auditar(tx,autor,id,"estoque_entrada"); return id;
}
export async function ajustarEstoque(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const v = ajusteSchema.parse(entrada);
  return banco.transaction(async tx => {
    await travarEstoque(tx); const autor = await autorizar(tx,ator,"admin");
    if (linhas(await tx.execute(sql`SELECT id FROM atendeia_produtos_movimentos WHERE chave=${v.chave} AND is_deleted=false`)).length) return;
    const [lote] = linhas<{quantidade:number}>(await tx.execute(sql`SELECT quantidade FROM atendeia_produtos_lotes WHERE id=${v.loteId} AND is_deleted=false AND updated_at=${v.atualizadoEm}::timestamptz FOR UPDATE`));
    if (!lote) throw new ErroDeNegocio("Lote alterado. Recarregue antes do ajuste.");
    const [r] = linhas<{qtd:number}>(await tx.execute(sql`SELECT coalesce(sum(r.quantidade),0)::int qtd FROM atendeia_pedidos_reservas r WHERE r.lote_id=${v.loteId} AND ${reservaAtiva}`));
    if (v.quantidade<r.qtd) throw new ErroDeNegocio("O ajuste não pode retirar unidades reservadas. Cancele as reservas primeiro.");
    await tx.execute(sql`UPDATE atendeia_produtos_lotes SET quantidade=${v.quantidade},updated_at=clock_timestamp(),modified_by=${autor} WHERE id=${v.loteId} AND is_deleted=false`);
    await tx.execute(sql`INSERT INTO atendeia_produtos_movimentos(lote_id,quantidade,anterior,posterior,tipo,motivo,chave,modified_by)
      VALUES (${v.loteId},${v.quantidade-lote.quantidade},${lote.quantidade},${v.quantidade},'ajuste',${v.motivo},${v.chave},${autor})`);
    await auditar(tx,autor,v.loteId,"estoque_ajuste");
  });
}
export async function historicoProduto(banco: BancoSql, ator: AtorFarmacia, produtoId: unknown) {
  const id = z.uuid().parse(produtoId);
  return banco.transaction(async tx => {
    await autorizar(tx,ator,"visualizador");
    const lotes = linhas<{id:string;codigo:string;validade:string|null;quantidade:number;bloqueado:boolean;atualizadoEm:string}>(await tx.execute(sql`
      SELECT id,codigo,validade::text,quantidade,bloqueado,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "atualizadoEm"
      FROM atendeia_produtos_lotes WHERE produto_id=${id} AND is_deleted=false ORDER BY validade NULLS LAST,id`));
    const movimentos = linhas<{id:string;tipo:string;quantidade:number;anterior:number;posterior:number;motivo:string;autor:string;data:string;codigo:string}>(await tx.execute(sql`
      SELECT m.id,m.tipo,m.quantidade,m.anterior,m.posterior,m.motivo,u.name autor,m.created_at::text data,l.codigo FROM atendeia_produtos_movimentos m
      JOIN atendeia_produtos_lotes l ON l.id=m.lote_id JOIN atendeia_users u ON u.id=m.modified_by
      WHERE l.produto_id=${id} AND l.is_deleted=false AND m.is_deleted=false ORDER BY m.created_at DESC,m.id LIMIT 200`));
    return {lotes,movimentos};
  });
}
