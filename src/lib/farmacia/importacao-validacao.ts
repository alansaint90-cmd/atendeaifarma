import { z } from "zod";
import { normalizarPreco, produtoSchema } from "./validacao";
import { produtoVazio } from "./cadastro";

export const limiteImportacao = 200;
export const linhaImportacaoSchema = z.strictObject({
  linha: z.number().int().min(2).max(201),
  nome: z.string().trim().min(2).max(180), concentracao: z.string().trim().max(180),
  apresentacao: z.string().trim().min(2).max(180), preco: z.string().transform(normalizarPreco).pipe(produtoSchema.shape.preco),
  quantidade: z.number().int().min(0).max(1000000), lote: z.string().trim().max(180), validade: z.iso.date().nullable(),
  receita: z.boolean(), controle: z.string().trim().max(180), medicamento: z.boolean(),
  sku: z.string().trim().max(60).refine(v => !v || /^[\p{L}\p{N}_.-]+$/u.test(v), "Código interno inválido."),
  ean: produtoSchema.shape.ean, embalagem: produtoSchema.shape.embalagem,
  principio: z.string().trim().max(180), fabricante: z.string().trim().max(180),
}).superRefine((v, ctx) => {
  if (v.quantidade > 0 && !v.lote) ctx.addIssue({code:"custom",path:["lote"],message:"Informe o lote quando houver quantidade."});
  if (v.quantidade > 0 && v.medicamento && !v.validade) ctx.addIssue({code:"custom",path:["validade"],message:"Informe a validade do medicamento."});
});
export const importacaoSchema = z.strictObject({ chave:z.uuid(), linhas:z.array(linhaImportacaoSchema).min(1).max(limiteImportacao) });
export type LinhaImportacao = z.infer<typeof linhaImportacaoSchema>;
export type Importacao = z.infer<typeof importacaoSchema>;
export function produtoDaLinha(linha: LinhaImportacao, sku: string) {
  return produtoSchema.parse({ ...produtoVazio, nome:linha.nome, concentracao:linha.concentracao,
    apresentacao:linha.apresentacao, preco:linha.preco, receita:linha.receita, controle:linha.controle,
    medicamento:linha.medicamento, sku, ean:linha.ean, embalagem:linha.embalagem,
    principio:linha.principio, fabricante:linha.fabricante, categoria:linha.medicamento ? "Medicamentos" : "Outros" });
}
