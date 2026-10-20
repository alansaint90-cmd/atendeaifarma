import type { ProdutoEntrada } from "./validacao";

export const produtoVazio: ProdutoEntrada = {
  nome:"", principio:"", generico:"", fabricante:"", categoria:"Medicamentos", concentracao:"", apresentacao:"",
  embalagem:1, ean:null, sku:"", preco:"", promocional:null, minimo:0, receita:false, controle:"", ativo:true,
  medicamento:true, observacoes:"", aliases:"",
};
