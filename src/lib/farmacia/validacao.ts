import { z } from "zod";

const texto = z.string().trim().max(180);
export const valor = z.string().regex(/^\d{1,9}\.\d{2}$/, "Use valor decimal, por exemplo 8.90.").refine(v => BigInt(v.replace(".", "")) > 0n, "O valor deve ser positivo.");
export const produtoSchema = z.strictObject({
  nome: texto.min(2), principio: texto, generico: texto, fabricante: texto, categoria: texto.min(2), concentracao: texto,
  apresentacao: texto.min(2), embalagem: z.number().int().min(1).max(100000), ean: z.string().regex(/^(\d{8}|\d{12,14})$/).nullable(),
  sku: z.string().trim().regex(/^[\p{L}\p{N}_.-]{1,60}$/u), preco: valor, promocional: valor.nullable(), minimo: z.number().int().min(0).max(1000000),
  receita: z.boolean(), controle: texto, ativo: z.boolean(), medicamento: z.boolean(), observacoes: z.string().trim().max(2000), aliases: z.string().trim().max(500),
}).refine(v => !v.promocional || centavos(v.promocional) <= centavos(v.preco), "Promoção não pode superar o preço normal.");
export const entradaSchema = z.strictObject({ produtoId: z.uuid(), codigo: texto.min(1), validade: z.iso.date().nullable(), quantidade: z.number().int().min(1).max(1000000), bloqueado: z.boolean(), chave: z.uuid() });
export const estoqueInicialSchema = entradaSchema.omit({produtoId:true,bloqueado:true});
export const salvarProdutoSchema = z.strictObject({ id: z.uuid().nullable(), atualizadoEm: z.iso.datetime({offset:true}).nullable(), produto: produtoSchema, estoqueInicial: estoqueInicialSchema.nullable().optional() })
  .refine(v=>!v.id || !v.estoqueInicial, "Use a entrada de mercadoria para acrescentar estoque a um produto existente.")
  .refine(v=>!v.estoqueInicial || !v.produto.medicamento || !!v.estoqueInicial.validade, {message:"Informe a validade do medicamento.",path:["estoqueInicial","validade"]});
export type EstoqueInicial = z.infer<typeof estoqueInicialSchema>;
export function normalizarPreco(valor: string): string {
  const limpo = valor.trim().replace(",", ".");
  return /^\d{1,9}(\.\d{1,2})?$/.test(limpo) ? `${limpo.split(".")[0]}.${(limpo.split(".")[1]??"").padEnd(2,"0")}` : limpo;
}
export const ajusteSchema = z.strictObject({ loteId: z.uuid(), quantidade: z.number().int().min(0).max(1000000), motivo: z.string().trim().min(5).max(300), atualizadoEm: z.iso.datetime({offset:true}), chave: z.uuid() });
export const buscaSchema = z.strictObject({ termo: z.string().trim().max(120).default(""), categoria: texto.default(""), disponibilidade: z.enum(["todos","disponivel","baixo","esgotado","vencendo","vencido"]).default("todos"), ordenar: z.enum(["nome","quantidade"]).default("nome"), pagina: z.number().int().min(1).max(100000).default(1) });
export const novoPedidoSchema = z.strictObject({ contatoId: z.uuid(), conversaId: z.uuid().nullable(), chave: z.string().min(8).max(220).regex(/^[a-zA-Z0-9:_.-]+$/), itens: z.array(z.strictObject({ produtoId: z.uuid(), quantidade: z.number().int().min(1).max(10000) })).min(1).max(50) });
export const comandoPedidoSchema = z.strictObject({ id: z.uuid(), acao: z.enum(["reservar","confirmar","separar","concluir","cancelar","conferir"]), chave: z.uuid(), referencia: z.string().trim().max(300).default("") });
export const habilitacaoSchema = z.strictObject({ usuarioId: z.uuid(), registro: z.string().trim().regex(/^[\p{L}\p{N} /.-]{4,80}$/u), habilitado: z.boolean() });
export function centavos(v: string): bigint { return BigInt(v.replace(".", "")); }
export function decimal(v: bigint): string { return `${v / 100n}.${(v % 100n).toString().padStart(2,"0")}`; }
export type ProdutoEntrada = z.infer<typeof produtoSchema>;
