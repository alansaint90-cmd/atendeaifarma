"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { executar, ErroDeNegocio } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { effectiveSettings } from "../settings/repository";
import { instanciasConfiguradas } from "../evolution/instancias";
import { db } from "../db/client";
import { campanhaSchema, identidadeCampanha } from "../farmacia/campanhas/schema";
import { contatosElegiveis, listarCampanhas, criarCampanha, alterarCampanha, destinatariosCampanha } from "../farmacia/campanhas/repository";
export async function carregarCampanhas(instancia?: unknown) {
 return executar(async()=>{const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");const instancias=instanciasConfiguradas(await effectiveSettings());
 const pedido=z.string().trim().max(100).optional().parse(instancia);
 const selecionada=pedido && instancias.includes(pedido)?pedido:instancias[0]??"";
 return {itens:await listarCampanhas(db()),contatos:selecionada?await contatosElegiveis(db(),selecionada):[],instancias,instancia:selecionada,ativo:process.env.ATENDEIA_WORKER_ENABLED==="true"};});
}
export async function gravarCampanha(entrada: unknown) {
 return executar(async()=>{const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");const dados=campanhaSchema.parse(entrada);
 if (!instanciasConfiguradas(await effectiveSettings()).includes(dados.instancia)) throw new ErroDeNegocio("Selecione um chip configurado.");
 await criarCampanha(db(),dados,sessao.userId);revalidatePath("/");return dados.id;});
}
export async function iniciarCampanha(entrada: unknown) {
 return executar(async()=>{const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");const alvo=identidadeCampanha.parse(entrada);
 const campanha=(await listarCampanhas(db())).find(c=>c.id===alvo.id);
 if (!campanha || !instanciasConfiguradas(await effectiveSettings()).includes(campanha.instancia)) throw new ErroDeNegocio("O chip da campanha não está configurado.");
 await alterarCampanha(db(),alvo,"iniciar",sessao.userId);revalidatePath("/");return true;});
}
export async function cancelarCampanha(entrada: unknown) {
 return executar(async()=>{const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");await alterarCampanha(db(),entrada,"cancelar",sessao.userId);revalidatePath("/");return true;});
}
export async function detalharCampanha(id: unknown) {
 return executar(async()=>{const sessao=await exigirSessao();await exigirPermissao(sessao,"admin");return destinatariosCampanha(db(),z.uuid().parse(id));});
}
