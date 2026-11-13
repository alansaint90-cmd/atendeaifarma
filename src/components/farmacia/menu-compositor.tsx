"use client";
import { useEffect,useRef,useState,type ReactNode } from "react";

export function MenuCompositor({rotulo,icone,children,desabilitado=false}:{rotulo:string;icone:ReactNode;children:(fechar:()=>void)=>ReactNode;desabilitado?:boolean}){
  const [aberto,setAberto]=useState(false);const raiz=useRef<HTMLDivElement>(null),botao=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!aberto)return;
    raiz.current?.querySelector<HTMLButtonElement>("[data-painel-compositor] button")?.focus();
    const fora=(e:PointerEvent)=>{if(!raiz.current?.contains(e.target as Node))setAberto(false);};
    const tecla=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();setAberto(false);botao.current?.focus();}};
    document.addEventListener("pointerdown",fora);document.addEventListener("keydown",tecla);
    return()=>{document.removeEventListener("pointerdown",fora);document.removeEventListener("keydown",tecla);};
  },[aberto]);
  return <div ref={raiz} className="compositor-menu"><button ref={botao} type="button" aria-label={rotulo} title={rotulo} aria-expanded={aberto} disabled={desabilitado} onClick={()=>setAberto(!aberto)}>{icone}</button>
    {aberto&&<div className="compositor-popup" data-painel-compositor role="group" aria-label={rotulo} onClick={e=>{if((e.target as Element).closest("button,a"))botao.current?.focus();}}>{children(()=>setAberto(false))}</div>}
  </div>;
}
export function IconeCompositor({tipo}:{tipo:"mais"|"emoji"|"microfone"|"enviar"|"acoes"}){
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tipo==="mais"?<path d="M12 5v14M5 12h14"/>:tipo==="emoji"?<><circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/></>:tipo==="microfone"?<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>:tipo==="enviar"?<path d="m4 4 17 8-17 8 4-8-4-8Zm4 8h13"/>:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}</svg>;
}
