"use client";
/* eslint-disable @next/next/no-img-element -- Foto remota pode expirar; exibição direta com fallback evita proxy e download no servidor. */
import { useState } from "react";

/** Foto disponível ou iniciais, sem imagens fictícias de clientes. */
export function AvatarContato({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  const [falhou, definirFalha] = useState<string | null>(null);
  const segura = fotoUrl?.startsWith("https://") && falhou !== fotoUrl;
  const iniciais = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  return <span className="conversas-avatar" aria-hidden="true">
    {segura ? <img src={fotoUrl ?? undefined} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" onError={() => definirFalha(fotoUrl ?? null)} /> : iniciais}
  </span>;
}
