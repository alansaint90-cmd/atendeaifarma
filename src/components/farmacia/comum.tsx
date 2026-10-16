"use client";
import { useState } from "react";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
import type { Resultado } from "@/lib/acao";
export function dinheiro(v:string) { const [inteiro,centavos="00"]=v.split(".");return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g,".")},${centavos}`; }
export function useConfirmacao(aoSucesso:()=>void) {
  const [acao,definir]=useState<{mensagem:string;executar:()=>Promise<Resultado<unknown>>}|null>(null);
  const [ocupado,ocupar]=useState(false);const [erro,erroDefinir]=useState("");
  const modal=<ModalConfirmacaoBlock aberto={!!acao} titulo="Conferir operação" mensagem={[acao?.mensagem,erro].filter(Boolean).join("\n")} carregando={ocupado}
    onCancelar={()=>definir(null)} onConfirmar={()=>{if(!acao)return;ocupar(true);erroDefinir("");void acao.executar().then(r=>{
      if(r.ok){definir(null);aoSucesso();}else erroDefinir(r.erro);
    }).catch(()=>erroDefinir("Não foi possível confirmar a operação. Recarregue antes de tentar novamente.")).finally(()=>ocupar(false));}} />;
  return {confirmar:(mensagem:string,executar:()=>Promise<Resultado<unknown>>)=>definir({mensagem,executar}),modal,erro,erroDefinir,ocupado};
}
