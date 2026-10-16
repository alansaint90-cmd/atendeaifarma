"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sairDoSistema } from "@/lib/actions/sessoes";

interface ContaMenuProps {
  nome: string;
  email: string;
  foto?: string | null;
  aoAbrirAssinatura: () => void;
}

export function ContaMenu({ nome, email, foto, aoAbrirAssinatura }: ContaMenuProps) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState("");
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]?.toLocaleUpperCase("pt-BR")).join("") || "?";

  useEffect(() => {
    if (!aberto) return;
    function fecharFora(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    function fecharEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fecharFora);
    document.addEventListener("keydown", fecharEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharFora);
      document.removeEventListener("keydown", fecharEscape);
    };
  }, [aberto]);

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    setErro("");
    try {
      const resultado = await sairDoSistema();
      if (!resultado.ok) { setErro(resultado.erro); return; }
      router.replace("/entrar");
      router.refresh();
    } catch {
      setErro("Não foi possível sair. Tente novamente.");
    } finally {
      setSaindo(false);
    }
  }

  return <div className="account" ref={raiz}>
    {aberto && <div className="account-menu" role="menu" aria-label="Opções da conta">
      <Link href="/perfil" role="menuitem" onClick={() => setAberto(false)}>Meu cadastro</Link>
      <button type="button" role="menuitem" onClick={() => { aoAbrirAssinatura(); setAberto(false); }}>Minha assinatura</button>
      <button type="button" role="menuitem" disabled={saindo} onClick={sair}>{saindo ? "Saindo..." : "Sair"}</button>
    </div>}
    <div className="account-identity">
      <span className="account-avatar" aria-hidden="true">{foto ? <Image unoptimized src={foto} alt="" width={38} height={38} /> : iniciais}</span>
      <span className="account-details"><strong title={nome}>{nome}</strong><small title={email}>{email}</small></span>
      <button className="account-trigger" type="button" aria-label="Abrir opções da conta" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>⋮</button>
    </div>
    {erro && <p role="alert">{erro}</p>}
  </div>;
}
