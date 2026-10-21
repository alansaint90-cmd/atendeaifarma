import { useId } from "react";

interface MarcaProps { grande?: boolean; clara?: boolean }

/** Versão vetorial da marca de referência, legível também no menu recolhido. */
export function Marca({ grande = false, clara = false }: MarcaProps) {
  const gradiente = useId();
  return <div className={`marca${grande ? " large" : ""}${clara ? " marca-clara" : ""}`} aria-label="Atende Farma">
    <svg className="marca-simbolo" width="48" height="54" viewBox="0 0 96 108" aria-hidden="true">
      <defs><linearGradient id={gradiente} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#8B5CF6" /><stop offset=".48" stopColor="#6366F1" /><stop offset="1" stopColor="#06B6D4" /></linearGradient></defs>
      <path d="M49 25V13" stroke="#8B5CF6" strokeWidth="7" strokeLinecap="round" />
      <circle cx="49" cy="9" r="8" fill="#8B5CF6" />
      <path d="M32 25h32c17 0 28 12 28 29v13c0 17-11 29-28 29H39l-17 11c-3 2-5 0-5-3V91C8 85 4 77 4 65V54c0-17 11-29 28-29Z" fill={`url(#${gradiente})`} />
      <rect x="17" y="38" width="62" height="45" rx="18" fill="#0F172A" />
      <path d="M29 59c0-9 12-9 12 0m14 0c0-9 12-9 12 0M41 70c4 4 10 4 14 0" fill="none" stroke={`url(#${gradiente})`} strokeWidth="5" strokeLinecap="round" />
    </svg>
    <span className="marca-textos"><span className="marca-nome">Atende <span className="marca-ia">Farma</span></span><small>Farmácia</small>
    </span>
  </div>;
}
