import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { minhasSessoes } from "@/lib/actions/sessoes";
import { Sessoes } from "./_components/sessoes";
import { Senha } from "./_components/senha";
import { Passkeys } from "./_components/passkeys";
import { PerfilPainel } from "./_components/perfil-painel";
import { PerfilDados } from "./_components/perfil-dados";
import { carregarMeuPerfil } from "@/lib/actions/perfil";
export const dynamic = "force-dynamic";
export default async function Perfil() {
  const sessao = await obterSessao(); if (!sessao) redirect("/entrar");
  const [r, perfil] = await Promise.all([minhasSessoes(), carregarMeuPerfil()]);
  return <PerfilPainel papel={sessao.papel} nome={sessao.nome} email={sessao.email} foto={perfil.ok ? perfil.dados.foto : null}>
    <section className="profile-heading"><h1>Meu cadastro</h1><p>Seus dados e a segurança da sua conta.</p></section>
    {perfil.ok ? <PerfilDados inicial={perfil.dados} /> : <p role="alert">{perfil.erro}</p>}
    <Senha />
    <section className="profile-security"><h2>Segurança da conta</h2><p>Sessões expiram em até 24 horas ou após uma hora sem atividade.</p></section>
    <Passkeys />{r.ok ? <Sessoes inicial={r.dados} /> : <p role="alert">{r.erro}</p>}
  </PerfilPainel>;
}
