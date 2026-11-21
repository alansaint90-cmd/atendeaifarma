"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { Papel } from "@/lib/db/schema/_enums";
import { nav } from "@/lib/demo/data";
import { icon } from "@/lib/demo/icons";
import { ContaMenu } from "./conta-menu";
import { Marca } from "./marca";
import { podeAcessarRotaPainel } from "@/lib/auth/rotas-painel";

interface PainelShellProps {
  papel: Papel;
  nome: string;
  email: string;
  foto?: string | null;
  rota: string;
  titulo: string;
  aoNavegar: (rota: string) => void;
  children: ReactNode;
  rodape?: ReactNode;
  rotasVisiveis?: readonly string[];
}

export function PainelShell({ papel, nome, email, foto, rota, titulo, aoNavegar, children, rodape, rotasVisiveis }: PainelShellProps) {
  const [recolhido, setRecolhido] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const lateral = useRef<HTMLElement>(null), alternador = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const observarTela = useCallback((atualizar: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia("(max-width: 768px)");
    const mudar = () => { setMenuAberto(false); atualizar(); };
    media.addEventListener("change", mudar);
    return () => media.removeEventListener("change", mudar);
  }, []);
  const pequena = useSyncExternalStore(observarTela, () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches, () => false);
  const menuVisivel = pequena && menuAberto;
  const fechar = () => { setMenuAberto(false); alternador.current?.focus(); };
  const navegar = (destino: string) => { setMenuAberto(false); aoNavegar(destino); };
  useEffect(() => {
    if (!menuVisivel) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lateral.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = overflowAnterior; alternador.current?.focus(); };
  }, [menuVisivel]);
  const menu = nav.filter(([id]) => podeAcessarRotaPainel(papel, id) && (!rotasVisiveis || rotasVisiveis.includes(id)));

  return <div className={`shell tema-farma-pro${recolhido ? " sidebar-collapsed" : ""}${menuVisivel ? " menu-mobile-aberto" : ""}`}>
    {menuVisivel && <button type="button" className="menu-mobile-fundo" aria-label="Fechar menu lateral" tabIndex={-1} onClick={fechar} />}
    <aside ref={lateral} id={menuId} className="sidebar" role={menuVisivel ? "dialog" : undefined} aria-modal={menuVisivel || undefined} aria-label={menuVisivel ? "Menu principal" : undefined}
      aria-hidden={pequena && !menuVisivel || undefined} inert={pequena && !menuVisivel || undefined}
      onKeyDown={evento => {
        if (!menuVisivel) return;
        if (evento.key === "Escape" && !(evento.target as Element).closest('[role="menu"]')) { evento.preventDefault(); fechar(); }
        if (evento.key !== "Tab") return;
        const controles = Array.from(lateral.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(el => !el.closest("[hidden]"));
        const primeiro = controles[0], ultimo = controles.at(-1);
        if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo?.focus(); }
        else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro?.focus(); }
      }}>
      <div className="sidebar-marca"><Marca clara /><button type="button" className="menu-mobile-fechar" hidden={!menuVisivel} aria-label="Fechar menu" onClick={fechar}>×</button></div>
      <nav aria-label="Menu principal">
      {menu.map(([id, label, ico]) => <button key={id} type="button" className={rota === id ? "active" : ""}
        data-route={id} aria-label={label} aria-current={rota === id ? "page" : undefined} title={recolhido && !pequena ? label : undefined}
        onClick={() => navegar(id)}><span className="nav-icone" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(ico) }} />{(!recolhido || pequena) && <span className="nav-label">{label}</span>}</button>)}
    </nav>{rodape ?? <ContaMenu nome={nome} email={email} foto={foto} aoAbrirAssinatura={() => navegar("plans")} />}</aside>
    <section className="workspace" inert={menuVisivel || undefined}><header className="topbar">
      <button ref={alternador} className="icon-button" type="button" aria-label="Alternar menu" aria-controls={menuId} aria-expanded={pequena ? menuVisivel : !recolhido} onClick={() => pequena ? setMenuAberto(!menuAberto) : setRecolhido(!recolhido)}>☰</button>
      <strong>{titulo}</strong>
    </header>{children}</section>
  </div>;
}
