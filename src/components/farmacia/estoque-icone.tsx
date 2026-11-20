import type { ReactNode } from "react";
export function EstoqueIcone({nome}:{nome:"caixa"|"caixas"|"comprimidos"|"alerta"|"sem"|"buscar"|"importar"|"mais"|"atualizar"|"editar"|"lotes"|"lixeira"|"foguete"|"check"|"seta"}) {
  const desenhos:Record<typeof nome,ReactNode>={
    caixa:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v10l9 5 9-5V8M12 13v10m-5-18 9 5"/></>,
    comprimidos:<g transform="rotate(-20 12 12)"><rect x="3" y="2" width="18" height="20" rx="2" fill="#e0deea" stroke="#b0a9c2"/>{[7,12,17].flatMap(x=>[6,12,18].map(y=><ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.5" ry="2" fill="#fdfcff" stroke="#9691ac" strokeWidth=".8"/>))}</g>,
    caixas:<><path d="m12 2 5 3v6l-5 3-5-3V5l5-3Zm0 6v6m-5-9 5 3 5-3M7 11l-5 3v6l5 3 5-3v-6m-10 0 5 3 5-3m-5 3v6m10-12 5 3v6l-5 3-5-3m0-6 5 3 5-3m-5 3v6"/></>,
    alerta:<><path d="m10 3-9 16a2 2 0 0 0 2 3h18a2 2 0 0 0 2-3L14 3a2 2 0 0 0-4 0Z"/><path d="M12 8v6m0 4h.01"/></>,
    sem:<><circle cx="12" cy="12" r="10"/><path d="m8 8 8 8m0-8-8 8"/></>,
    buscar:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    importar:<><path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/></>,
    mais:<path d="M12 4v16M4 12h16"/>,
    atualizar:<><path d="M21 4v6h-6M3 20v-6h6"/><path d="M4 8a9 9 0 0 1 15-4l2 6M3 14l2 6a9 9 0 0 0 15-4"/></>,
    editar:<><path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/></>,
    lotes:<><rect x="7" y="7" width="13" height="14" rx="2"/><path d="M15 7V3H3v14h4m4-6h5m-5 4h5"/></>,
    lixeira:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
    foguete:<><path d="M9 15C5 7 13 2 22 2c0 9-5 17-13 13Zm-3-4-4 1 2-7 6-1m3 14-1 4 7-2 1-6M7 17l-4 4m0-5-2 3m7 2-3 2"/><circle cx="16" cy="8" r="2"/></>,
    check:<path d="m5 12 4 4L19 6"/>,seta:<path d="M4 12h16m-6-6 6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{desenhos[nome]}</svg>;
}
