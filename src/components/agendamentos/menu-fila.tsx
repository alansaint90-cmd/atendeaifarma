"use client";
import { useEffect,useRef,useState,type CSSProperties,type ReactNode } from "react";
import { createPortal } from "react-dom";
/** Menu no corpo da página para não ser cortado pela rolagem da tabela. */
export function MenuFila({rotulo,children}:{rotulo:string;children:ReactNode}){
 const [posicao,setPosicao]=useState<CSSProperties|null>(null);const botao=useRef<HTMLButtonElement>(null),painel=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!posicao)return;painel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  const fora=(e:PointerEvent)=>{if(!painel.current?.contains(e.target as Node)&&!botao.current?.contains(e.target as Node))setPosicao(null);};
  const tecla=(e:KeyboardEvent)=>{if(e.key==="Escape"){setPosicao(null);botao.current?.focus();}};
  const mover=(e:Event)=>{if(!painel.current?.contains(e.target as Node))setPosicao(null);};
  document.addEventListener("pointerdown",fora);document.addEventListener("keydown",tecla);window.addEventListener("resize",mover);window.addEventListener("scroll",mover,true);
  return()=>{document.removeEventListener("pointerdown",fora);document.removeEventListener("keydown",tecla);window.removeEventListener("resize",mover);window.removeEventListener("scroll",mover,true);};
 },[posicao]);
 return <><button ref={botao} type="button" className="fila-menu-botao" aria-label={rotulo} aria-expanded={!!posicao} onClick={e=>{if(posicao){setPosicao(null);return;}const r=e.currentTarget.getBoundingClientRect();setPosicao({left:Math.max(12,Math.min(r.right-260,window.innerWidth-272)),width:Math.min(260,window.innerWidth-24),...(r.bottom+310>window.innerHeight?{bottom:window.innerHeight-r.top+8}:{top:r.bottom+8})});}}>⋯</button>
 {posicao&&createPortal(<div ref={painel} className="fila-opcoes" role="group" aria-label={rotulo} style={posicao} onClick={e=>{if((e.target as Element).closest("button:not(:disabled)")){setPosicao(null);botao.current?.focus();}}}>{children}</div>,document.body)}</>;
}
