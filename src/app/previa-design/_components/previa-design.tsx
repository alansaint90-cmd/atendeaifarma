"use client";

import { useEffect, useState } from "react";
import { PainelShell } from "@/components/painel-shell";
import { ProximasConsultas } from "@/components/operacao/proximas-consultas";
import { AgendaPrevia } from "./agenda-previa";
import "./previa.css";
import { ResumoClinica } from "@/components/operacao/resumo-clinica";

const indicadores = { abertas: 24, pendentes: 0, atendimentoIa: 18, atendimentoHumano: 6,
  novas: 24, atendidasIa: 18, atendidasHumano: 6, totalAtendidas: 24, canais: [], contatos: [], evolucao: [], atualizadoEm: "2026-10-13T12:00:00.000Z" };
const agendaDemonstracao = { dia: "2026-10-15", confirmadas: 4, livres: ["2026-10-15T13:40:00.000Z", "2026-10-15T14:20:00.000Z"],
  proximas: ["Marina Oliveira", "Pedro Almeida", "Clara Santos", "Lucas Costa"].map((nome, indice) => ({ id: String(indice), nome, inicio: `2026-10-15T${["11:00", "11:40", "12:20", "13:00"][indice]}:00.000Z` })) };

export function PreviaDesign() {
  const [rota, setRota] = useState("dashboard");
  const [visual, setVisual] = useState("novo");
  useEffect(() => {
    document.documentElement.dataset.visual = visual;
    return () => { delete document.documentElement.dataset.visual; };
  }, [visual]);
  const titulo = rota === "consultas" ? "Agenda de consultas" : "Dashboard";
  return <PainelShell papel="admin" nome="Dra. Juliana" email="Prévia local" rota={rota} titulo={titulo}
    aoNavegar={setRota} rotasVisiveis={["dashboard", "consultas"]}
    rodape={<div className="account"><div className="account-identity"><span className="account-avatar">DJ</span><span className="account-details"><strong>Dra. Juliana</strong><small>Clínica Bonvida</small></span></div></div>}>
    <main className="content">
      <div className="previa-aviso"><div><strong>Prévia do design</strong><span>Dados fictícios · nenhuma alteração na agenda real</span></div>
        <div className="previa-comparador" role="group" aria-label="Comparar aparência">
          <button className={visual === "atual" ? "primary" : "secondary"} aria-pressed={visual === "atual"} onClick={() => setVisual("atual")}>Visual atual</button>
          <button className={visual === "novo" ? "primary" : "secondary"} aria-pressed={visual === "novo"} onClick={() => setVisual("novo")}>Novo design</button>
        </div>
      </div>
      {rota === "consultas" ? <AgendaPrevia /> : <div className="page-stack dashboard-page">
        <ResumoClinica dados={indicadores} periodo="Últimos 7 dias" podeVerAgenda aoVerAgenda={() => setRota("consultas")}
          agenda={agendaDemonstracao} />
        <ProximasConsultas agenda={agendaDemonstracao} demonstracao aoVerAgenda={() => setRota("consultas")} />
      </div>}
    </main>
  </PainelShell>;
}
