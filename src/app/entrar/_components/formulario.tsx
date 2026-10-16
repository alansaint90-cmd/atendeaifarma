"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function mensagemFalha(status: number): string {
  if (status === 401 || status === 403) return "E-mail ou senha incorretos.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (status >= 500) return "O serviço está temporariamente indisponível. Tente novamente em instantes.";
  return "Confira o e-mail e a senha e tente novamente.";
}

interface CampoSenhaProps {
  id: string;
  titulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
}

function CampoSenha({ id, titulo, valor, aoAlterar }: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  return <div className="campo-senha">
    <label htmlFor={id}>{titulo}</label>
    <div className="campo-senha-controle">
      <input id={id} type={visivel ? "text" : "password"} required
        maxLength={256} autoComplete="current-password" value={valor} onChange={e => aoAlterar(e.target.value)} />
      <button type="button" className="campo-senha-olho" aria-label={visivel ? `Ocultar ${titulo.toLowerCase()}` : `Mostrar ${titulo.toLowerCase()}`}
        aria-pressed={visivel} onClick={() => setVisivel(!visivel)}>
        {visivel ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M6.5 6.8C4.5 8 3 9.8 2 12c2 4.3 5.7 7 10 7 1.9 0 3.6-.3 5.1-1.1M9.9 5.2C10.6 5.1 11.3 5 12 5c4.3 0 8 2.7 10 7-.6 1.3-1.4 2.4-2.4 3.4" />
        </svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M2 12c2-4.3 5.7-7 10-7s8 2.7 10 7c-2 4.3-5.7 7-10 7S4 16.3 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>}
      </button>
    </div>
  </div>;
}

export function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro("");
    setCarregando(true);
    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, lembrar: true }),
      });
      if (!resposta.ok) {
        setErro(mensagemFalha(resposta.status));
        return;
      }
      setSenha("");
      router.push("/");
      router.refresh();
    } catch {
      setErro("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return <section className="form-card">
    <h1>Entrar no Atende AI</h1>
    <p>Acesse com seu e-mail e senha.</p>
    {erro && <p role="alert">{erro}</p>}
    <form onSubmit={e => { e.preventDefault(); void entrar(); }}>
      <label htmlFor="login-email">E-mail</label>
      <input id="login-email" type="email" required maxLength={254} autoComplete="username"
        value={email} onChange={e => setEmail(e.target.value)} />
      <CampoSenha id="login-senha" titulo="Senha" valor={senha} aoAlterar={setSenha} />
      <button type="submit" className="primary" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
    </form>
  </section>;
}
