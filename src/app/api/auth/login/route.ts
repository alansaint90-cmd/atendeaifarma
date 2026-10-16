import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/migrate";
import { contextoAuth, contextoRequisicao } from "@/lib/auth/contexto";
import { autenticarESessionarSenha } from "@/lib/auth/login-senha";
import { nomeCookieSessao, opcoesCookie } from "@/lib/auth/cookies";

const entrada = z.strictObject({
  email: z.email().max(254),
  senha: z.string().min(1).max(256),
  lembrar: z.boolean().optional().default(false),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return contextoAuth.run(contextoRequisicao(request), async () => {
    try {
      if (process.env.AUTH_LOGIN_ENABLED !== "true") throw new Error("Indisponível");
      const origem = process.env.AUTH_ORIGIN;
      if (!origem || request.headers.get("origin") !== origem || !request.headers.get("content-type")?.startsWith("application/json")) {
        throw new Error("Origem inválida");
      }
      const dados = entrada.parse(await request.json());
      await ensureDatabase();
      const resultado = await autenticarESessionarSenha(db(), { email: dados.email, senha: dados.senha }, dados.lembrar);
      const resposta = NextResponse.json({
        usuario: { id: resultado.usuario.id, nome: resultado.usuario.nome, email: resultado.usuario.email, papel: resultado.usuario.papel },
      }, { headers: { "Cache-Control": "no-store" } });
      resposta.cookies.set(nomeCookieSessao(), resultado.token, { ...opcoesCookie(resultado.duracao), httpOnly: true });
      return resposta;
    } catch {
      return NextResponse.json({ erro: "Não foi possível entrar. Confira o e-mail e a senha." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
  });
}
