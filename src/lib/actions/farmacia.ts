"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { executar } from "../acao";
import { db } from "../db/client";
import { consultarProdutos, salvarProduto, entradaEstoque, ajustarEstoque, historicoProduto } from "../farmacia/catalogo";
import { criarPedido, executarPedido, habilitarFarmaceutico } from "../farmacia/pedidos";
import { listarPedidos, painelFarmacia, contextoCadastro } from "../farmacia/consultas";
import { importarProdutos } from "../farmacia/importacao";

export async function importarPlanilha(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"admin");const r=await importarProdutos(db(),s,entrada);revalidatePath("/");return r;}); }

export async function carregarProdutos(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return consultarProdutos(db(),s,entrada);}); }
export async function gravarProduto(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"admin");const r=await salvarProduto(db(),s,entrada);revalidatePath("/");return r;}); }
export async function receberEstoque(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");const r=await entradaEstoque(db(),s,entrada);revalidatePath("/");return r;}); }
export async function ajustarInventario(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"admin");await ajustarEstoque(db(),s,entrada);revalidatePath("/");}); }
export async function carregarHistorico(id:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return historicoProduto(db(),s,id);}); }
export async function carregarPedidos(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return listarPedidos(db(),s,entrada);}); }
export async function registrarPedido(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");const r=await criarPedido(db(),s,entrada);revalidatePath("/");return r;}); }
export async function alterarPedido(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");const r=await executarPedido(db(),s,entrada);revalidatePath("/");return r;}); }
export async function carregarFarmacia() { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return painelFarmacia(db(),s);}); }
export async function carregarCadastrosFarmacia() { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return contextoCadastro(db(),s);}); }
export async function salvarHabilitacao(entrada:unknown) { return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"admin");await habilitarFarmaceutico(db(),s,entrada);revalidatePath("/");}); }
