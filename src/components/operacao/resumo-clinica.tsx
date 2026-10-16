import type { ReactNode } from "react";
import type { PainelOperacional } from "@/lib/operacao/painel";
import type { ResumoAgenda } from "@/lib/consultas/resumo";
import { icon } from "@/lib/demo/icons";

interface ResumoClinicaProps {
  dados: PainelOperacional | null;
  agenda: ResumoAgenda | null;
  periodo: string;
  podeVerAgenda: boolean;
  aoVerAgenda?: () => void;
  filtros?: ReactNode;
}
export function ResumoClinica({ dados, agenda, periodo, podeVerAgenda, aoVerAgenda, filtros }: ResumoClinicaProps) {
  const percentual = dados?.totalAtendidas ? Math.round(dados.atendidasIa / dados.totalAtendidas * 100) : 0;
  const dia = agenda ? new Date(`${agenda.dia}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Próxima quinta-feira";
  const horarios = agenda?.livres.map(inicio => new Date(inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })).join(" · ");
  const cards = [
    { nome: "Conversas no período", valor: dados?.novas, nota: periodo, cor: "blue", icone: "message" },
    { nome: "Atendimentos pela IA", valor: dados?.atendidasIa, nota: dados ? `${percentual}% das conversas atendidas` : "Aguardando indicadores", cor: "green", icone: "spark" },
    ...(podeVerAgenda ? [
      { nome: "Consultas confirmadas", valor: agenda?.confirmadas, nota: `Próxima quinta-feira · ${dia === "Próxima quinta-feira" ? "Brasília" : dia}`, cor: "blue", icone: "calendar" },
      { nome: "Horários disponíveis", valor: agenda?.livres.length, nota: agenda ? horarios || "Nenhuma vaga livre nesta quinta" : "Aguardando agenda", cor: "orange", icone: "clock" },
    ] : []),
  ];
  return <>
    <header className="page-head"><div><div className="clinica-sobretitulo">CLÍNICA BONVIDA · SALVADOR</div><h1>Seu atendimento, em dia.</h1><p>Acompanhe as conversas e prepare a próxima manhã de consultas.</p></div>
      {podeVerAgenda && <button type="button" className="primary" onClick={aoVerAgenda}><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("calendar") }} />Ver agenda</button>}
    </header>
    {filtros}
    <section className="kpi-grid clinica-resumo" aria-label="Resumo da clínica">{cards.map(c => <article className={`kpi ${c.cor}`} key={c.nome}>
      <div className="clinica-kpi-label"><span>{c.nome}</span><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(c.icone) }} /></div>
      <strong>{c.valor ?? "—"}</strong><small>{c.nota}</small>
    </article>)}</section>
  </>;
}
