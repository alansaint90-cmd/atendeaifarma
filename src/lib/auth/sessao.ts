import { cookies } from "next/headers";
import { ErroDeNegocio } from "@/lib/acao";
import { db } from "@/lib/db/client";
import { ensureDatabase } from "@/lib/db/migrate";
import { lerSessao, type Identidade } from "./repositorio";
import { nomeCookieSessao } from "./cookies";

/** Sessao com papel e `ativo` lidos do BANCO a cada requisicao — nunca do token. */
export async function obterSessao(): Promise<Identidade | null> {
  if (process.env.AUTH_LOGIN_ENABLED !== "true") return null;
  const token = (await cookies()).get(nomeCookieSessao())?.value;
  if (!token) return null;
  await ensureDatabase();
  return lerSessao(db(), token);
}

/** Portao de toda Server Action: sem sessao valida, nada roda. */
export async function exigirSessao(): Promise<Identidade> {
  const sessao = await obterSessao();
  if (!sessao) throw new ErroDeNegocio("Sessao expirada. Entre novamente.");
  return sessao;
}
