"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@/lib/db/schema/_enums";
import { PainelShell } from "@/components/painel-shell";

interface PerfilPainelProps {
  papel: Papel;
  nome: string;
  email: string;
  foto?: string | null;
  children: ReactNode;
}

export function PerfilPainel({ papel, nome, email, foto, children }: PerfilPainelProps) {
  const router = useRouter();
  return <PainelShell papel={papel} nome={nome} email={email} foto={foto} rota="perfil" titulo="Meu cadastro"
    aoNavegar={rota => router.push(`/?view=${encodeURIComponent(rota)}`)}>
    <main className="content profile-content">{children}</main>
  </PainelShell>;
}
