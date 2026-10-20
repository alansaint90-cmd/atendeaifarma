import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { linhas, type BancoSql } from "../db/porta";
import { autorizar, travarEstoque, type AtorFarmacia } from "./comum";
import { salvarProdutoNaTransacao } from "./catalogo";
import { importacaoSchema, produtoDaLinha } from "./importacao-validacao";

function chaveLinha(chave: string, linha: number) {
  const hash = createHash("sha256").update(`${chave}:${linha}`).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export async function importarProdutos(banco: BancoSql, ator: AtorFarmacia, entrada: unknown) {
  const v = importacaoSchema.parse(entrada);
  // Limita também o tamanho serializado antes de qualquer transação.
  if (JSON.stringify(v).length > 250000) throw new ErroDeNegocio("Planilha muito grande. Divida em arquivos menores.");
  return banco.transaction(async tx => {
    await travarEstoque(tx);
    await autorizar(tx, ator, "admin");
    const numeros = new Set<number>();
    for (const item of v.linhas) {
      if (numeros.has(item.linha)) throw new ErroDeNegocio(`Linha ${item.linha}: número de linha repetido.`);
      numeros.add(item.linha);
      const id = chaveLinha(v.chave, item.linha);
      const sku = item.sku || `AUTO-${id}`;
      const conflito = linhas(await tx.execute(sql`SELECT id FROM atendeia_produtos
        WHERE is_deleted=false AND id<>${id} AND (sku=${sku} OR (${item.ean}::text IS NOT NULL AND ean=${item.ean})
          OR (${!item.sku} AND lower(nome)=lower(${item.nome}) AND lower(concentracao)=lower(${item.concentracao}) AND lower(apresentacao)=lower(${item.apresentacao}))) LIMIT 1`));
      if (conflito.length) throw new ErroDeNegocio(`Linha ${item.linha}: produto já cadastrado ou repetido na planilha. Use “Lotes / entrada” para reposição.`);
      try {
        await salvarProdutoNaTransacao(tx, ator, {id:null, atualizadoEm:null,
          produto:produtoDaLinha(item, sku), estoqueInicial:item.quantidade > 0 ? {
            chave:id, codigo:item.lote, validade:item.validade, quantidade:item.quantidade,
          } : null}, id);
      } catch (erro) {
        if (erro instanceof ErroDeNegocio) throw new ErroDeNegocio(`Linha ${item.linha}: ${erro.message}`);
        throw erro;
      }
    }
    return { produtos:v.linhas.length, embalagens:v.linhas.reduce((s,l) => s+l.quantidade,0) };
  });
}
