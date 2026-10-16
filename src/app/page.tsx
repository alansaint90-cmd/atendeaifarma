import { Workspace } from "@/components/workspace";
import { obterSessao } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";
import { nav } from "@/lib/demo/data";
import { lerPerfil } from "@/lib/perfil/servico";
import { db } from "@/lib/db/client";
import { podeAcessarRotaPainel } from "@/lib/auth/rotas-painel";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  const { view } = await searchParams;
  const permitido = nav.some(([id]) => id === view && podeAcessarRotaPainel(sessao.papel, id));
  const perfil = await lerPerfil(db(), sessao);
  return <Workspace papel={sessao.papel} nome={sessao.nome} email={sessao.email} foto={perfil.foto} rotaInicial={permitido && view ? view : "dashboard"} />;
}
