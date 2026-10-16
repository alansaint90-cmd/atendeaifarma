"use server";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { executar } from "../acao";
import { db } from "../db/client";
import { assumirConversa,enviarManual } from "../farmacia/atendimento";
export async function assumirAtendimento(v:unknown) {return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return assumirConversa(db(),s,v);});}
export async function enviarMensagemManual(v:unknown) {return executar(async()=>{const s=await exigirSessao();await exigirPermissao(s,"operador");return enviarManual(db(),s,v);});}
