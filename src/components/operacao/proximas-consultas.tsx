import type { ResumoAgenda } from "@/lib/consultas/resumo";

interface ProximasConsultasProps {
  agenda: ResumoAgenda | null;
  erro?: string;
  demonstracao?: boolean;
  aoTentarNovamente?: () => void;
  aoVerAgenda?: () => void;
}
export function ProximasConsultas({ agenda, erro, demonstracao = false, aoTentarNovamente, aoVerAgenda }: ProximasConsultasProps) {
  const dia = agenda ? new Date(`${agenda.dia}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }) : "Próxima quinta-feira";
  return <div className="clinica-colunas">
    <section className="panel clinica-consultas" aria-labelledby="proximas-consultas-titulo">
      <div className="panel-title"><div><h2 id="proximas-consultas-titulo">Próximas consultas</h2><p>{dia} · horário de Brasília</p></div>
        {agenda && <span className="badge green">{agenda.proximas.length} confirmadas</span>}
      </div>
      {erro ? <p role="alert">{erro} <button type="button" className="secondary" onClick={aoTentarNovamente}>Tentar consultar agenda novamente</button></p>
        : !agenda ? <p role="status">Consultando agenda…</p>
        : !agenda.proximas.length ? <p role="status" className="feature-empty">Nenhuma consulta futura confirmada nesta quinta-feira.</p>
        : <div className="table"><table><thead><tr><th>Paciente</th><th>Horário</th><th>Status</th></tr></thead><tbody>
          {agenda.proximas.map(consulta => <tr key={consulta.id}><td><div className="clinica-paciente"><span className="avatar" aria-hidden="true">{consulta.nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join("").toLocaleUpperCase("pt-BR")}</span>
            <div><strong>{consulta.nome}</strong><small>{demonstracao ? "Paciente fictício" : "Consulta na Clínica Bonvida"}</small></div></div></td>
            <td>{new Date(consulta.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</td><td><span className="badge green">Confirmada</span></td></tr>)}
        </tbody></table></div>}
      <button type="button" className="secondary clinica-ver-agenda" onClick={aoVerAgenda}>Ver todos os horários</button>
    </section>
  </div>;
}
