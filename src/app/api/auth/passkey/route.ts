import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setTimeout as esperar } from "node:timers/promises";
import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/migrate";
import { systemUserId } from "@/lib/db/bootstrap";
import { auditarIdentidade, limitarAuth } from "@/lib/auth/repositorio";
import { contextoAuth, contextoRequisicao } from "@/lib/auth/contexto";
import { entradaAuth } from "@/lib/auth/validacao";
import { autenticarSenha } from "@/lib/auth/login-senha";
import { exigirSessao } from "@/lib/auth/sessao";
import { iniciarFator, concluirFator } from "@/lib/auth/passkeys-perfil";
import { configuracaoPasskey, iniciarLogin, iniciarRegistro, concluirLogin, concluirRegistro, concluirRegistroSenha } from "@/lib/auth/passkeys";
import { nomeCookieDesafio, nomeCookieSessao, opcoesCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return contextoAuth.run(contextoRequisicao(request), () => autenticar(request));
}
async function autenticar(request: Request) {
  const inicio = Date.now();
  try {
    if (process.env.AUTH_LOGIN_ENABLED !== "true") throw new Error("Indisponível");
    const config = configuracaoPasskey();
    if (request.headers.get("origin") !== config.expectedOrigin || !request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Origem");
    // Limite efetivo mesmo para clientes sem Content-Length.
    const reader = request.body?.getReader(); let corpo = ""; const decoder = new TextDecoder(); let tamanho = 0;
    if (!reader) throw new Error("Entrada");
    for (;;) { const trecho = await reader.read(); if (trecho.done) break; tamanho += trecho.value.byteLength;
      if (tamanho > 65536) { await reader.cancel(); throw new Error("Limite"); } corpo += decoder.decode(trecho.value, { stream: true }); }
    corpo += decoder.decode();
    const entrada = entradaAuth.parse(JSON.parse(corpo));
    await ensureDatabase();
    const contexto = contextoAuth.getStore();
    if (contexto) contexto.meio = entrada.acao === "iniciar_senha" ? "senha_passkey" : "passkey";
    await limitarAuth(db(), "auth:global", 240);
    if (contexto?.ip) await limitarAuth(db(), `auth:ip:${contexto.ip}`, 60);
    const jar = await cookies();
    if (entrada.acao === "iniciar_fator" || entrada.acao === "concluir_fator") {
      const sessao = await exigirSessao();
      if (entrada.acao === "iniciar_fator") {
        const r = await iniciarFator(db(), sessao, entrada.senha);
        jar.set(nomeCookieDesafio(), r.token, opcoesCookie(300));
        return NextResponse.json({ options: r.options }, { headers: { "Cache-Control": "no-store" } });
      }
      const token = jar.get(nomeCookieDesafio())?.value ?? "";
      jar.set(nomeCookieDesafio(), "", opcoesCookie(0));
      await concluirFator(db(), sessao, token, entrada.resposta);
      jar.set(nomeCookieSessao(), "", opcoesCookie(0));
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (entrada.acao === "concluir_registro_senha") {
      const resultado = await concluirRegistroSenha(db(), entrada.convite, entrada.senha);
      jar.set(nomeCookieSessao(), resultado.sessao, opcoesCookie(86400));
      return NextResponse.json({ ok: true, aviso: resultado.aviso }, { headers: { "Cache-Control": "no-store" } });
    }
    if (entrada.acao === "iniciar_login" || entrada.acao === "iniciar_registro" || entrada.acao === "iniciar_senha") {
      const usuario = entrada.acao === "iniciar_senha" ? await autenticarSenha(db(), { email: entrada.email, senha: entrada.senha }) : undefined;
      const resultado = entrada.acao === "iniciar_registro" ? await iniciarRegistro(db(), entrada.convite, undefined, entrada.senha) : await iniciarLogin(db(), undefined, usuario);
      jar.set(nomeCookieDesafio(), resultado.token, opcoesCookie(300));
      return NextResponse.json({ options: resultado.options, aviso: "aviso" in resultado ? resultado.aviso : null }, { headers: { "Cache-Control": "no-store" } });
    }
    const desafio = jar.get(nomeCookieDesafio())?.value ?? "";
    jar.set(nomeCookieDesafio(), "", opcoesCookie(0));
    const token = entrada.acao === "concluir_login" ? await concluirLogin(db(), desafio, entrada.resposta) : await concluirRegistro(db(), desafio, entrada.resposta);
    jar.set(nomeCookieSessao(), token, opcoesCookie(86400));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (process.env.AUTH_LOGIN_ENABLED === "true") {
      try { await auditarIdentidade(db(), systemUserId, "autenticacao_recusada"); } catch { /* Nunca incluir credenciais ou erro do driver na resposta. */ }
    }
    await esperar(Math.max(0, 500 - (Date.now() - inicio)));
    return NextResponse.json({ erro: "Não foi possível autenticar. Confira o acesso e tente novamente." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
