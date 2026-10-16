import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { FormularioLogin } from "./_components/formulario";
import { Marca } from "@/components/marca";
export const dynamic = "force-dynamic";
export default async function Entrar() {
  if (process.env.AUTH_LOGIN_ENABLED !== "true") return <main className="content"><h1>Acesso individual em preparação</h1><p>A autenticação individual ainda não foi ativada neste ambiente. O responsável pela instalação precisa configurar o primeiro administrador e habilitar o acesso.</p></main>;
  if (await obterSessao()) redirect("/");
  return <main className="auth-shell"><section className="auth-panel"><Marca grande slogan /><FormularioLogin /></section></main>;
}
