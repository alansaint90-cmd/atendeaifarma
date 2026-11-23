"use client";
/* eslint-disable @next/next/no-img-element -- URLs de perfil podem expirar e a consulta alternativa é autenticada. */
import { useState } from "react";

/** Foto disponível ou iniciais, sem imagens fictícias de clientes. */
export function AvatarContato({ nome, fotoUrl, fotoAlternativa }: { nome: string; fotoUrl?: string | null; fotoAlternativa?: string }) {
  const [falhas, definirFalhas] = useState<{principal?:string;alternativa?:string}>({});
  const principal = fotoUrl?.startsWith("https://") && falhas.principal !== fotoUrl ? fotoUrl : undefined;
  const alternativa = fotoAlternativa && falhas.alternativa !== fotoAlternativa ? fotoAlternativa : undefined;
  const fonte = principal ?? alternativa;
  const iniciais = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  return <span className="conversas-avatar" aria-hidden="true">
    {fonte ? <img key={fonte} src={fonte} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer"
      onError={() => definirFalhas(atual=>({...atual,[principal?"principal":"alternativa"]:fonte}))} /> : iniciais}
  </span>;
}
