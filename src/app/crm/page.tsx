import { redirect } from "next/navigation";
import Link from "next/link";
import { obterSessao } from "@/lib/auth/sessao";
import { catalogoCrm } from "@/lib/crm/cadastros";
import { consultarCrm } from "@/lib/crm/consultas";
import { db } from "@/lib/db/client";
import { PainelCrm } from "./_components/painel";
export const dynamic = "force-dynamic";
export default async function Crm() {
  const sessao = await obterSessao(); if (!sessao) redirect("/entrar");
  return <main className="content"><header className="page-head"><div><h1>CRM e oportunidades</h1><p>Dados comerciais e acesso individual.</p></div><Link href="/">Painel de atendimento</Link><Link href="/perfil">Meu perfil</Link></header>
    <PainelCrm usuarioId={sessao.userId} inicial={{ catalogo: await catalogoCrm(db(), sessao), consulta: await consultarCrm(db(), sessao, {}) }} /></main>;
}
