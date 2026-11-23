"use client";
import { useState } from "react";

/** O navegador recupera a mídia somente quando o atendente solicita a reprodução. */
export function AudioMensagem({ fonte, disponivel, recebida }: { fonte?: string; disponivel?: boolean; recebida: boolean }) {
  const [erro, definirErro] = useState(false);
  const [tentativa, definirTentativa] = useState(0);
  if (!disponivel || !fonte) return <p>Áudio indisponível para reprodução.</p>;
  return <div className="conversas-audio">
    <audio key={tentativa} controls preload="none" aria-label={`Reproduzir áudio ${recebida ? "recebido" : "enviado"}`}
      src={fonte} onError={() => definirErro(true)} />
    {erro && <div role="status"><p>Não foi possível carregar o áudio.</p><button type="button" onClick={() => { definirErro(false); definirTentativa(tentativa + 1); }}>Tentar novamente</button></div>}
  </div>;
}
