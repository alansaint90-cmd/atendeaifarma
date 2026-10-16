"use client";

import { useState } from "react";
import { PacienteForm, pacienteVazio } from "@/components/consultas/paciente-form";
import { pacienteSchema } from "@/lib/consultas/schema";

const horarios = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20"];

export function AgendaPrevia() {
  const [horario, setHorario] = useState("");
  const [paciente, setPaciente] = useState(pacienteVazio);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const nomes = ["Marina Oliveira", "Pedro Almeida", "Clara Santos", "Lucas Costa"];
  const pacientes = nomes.map((nome, indice) => ({ nome, horario: horarios[indice] })).filter(p => p.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  return <div className="page-stack"><header className="page-heading"><div className="previa-sobretitulo">DRA. JULIANA · CLÍNICA BONVIDA</div><h1>Agenda de consultas</h1><p>Quinta-feira, 15 de outubro de 2026 · horário de Brasília</p></header>
    <section className="card"><div className="panel-title"><div><h2>Horários da manhã</h2><p>Escolha uma vaga para visualizar o cadastro do paciente.</p></div><span className="badge green">2 vagas livres</span></div>
      <div className="previa-horarios">{horarios.map((h, i) => <button key={h} disabled={i < 4} aria-pressed={horario === h} className={horario === h ? "primary" : "secondary"} onClick={() => { setHorario(h); setAviso(""); setErro(""); }}><strong>{h}</strong><span>{i < 4 ? "Ocupado" : "Livre"}</span></button>)}</div>
    </section>
    {horario && <form className="feature-form" onSubmit={evento => { evento.preventDefault(); const resultado = pacienteSchema.safeParse(paciente); if (!resultado.success) { setErro(resultado.error.issues[0].message); return; } setErro(""); setAviso("Cadastro de demonstração conferido. Nenhuma consulta foi gravada ou enviada."); }}>
      <h2>Novo agendamento · {horario}</h2><p>Experimente os campos com dados fictícios.</p><PacienteForm paciente={paciente} ocupado={false} aoAlterar={setPaciente} />
      {erro && <p role="alert">{erro}</p>}{aviso && <p role="status">{aviso}</p>}
      <div className="feature-actions"><button className="primary" type="submit">Conferir demonstração</button><button className="secondary" type="button" onClick={() => { setHorario(""); setPaciente(pacienteVazio); setAviso(""); setErro(""); }}>Fechar cadastro</button></div>
    </form>}
    <section className="card"><div className="panel-title"><h2>Pacientes agendados</h2><label className="previa-busca"><span className="sr-only">Buscar paciente fictício</span><input type="search" placeholder="Buscar paciente…" value={busca} onChange={evento => setBusca(evento.target.value)} /></label></div>
      {pacientes.length ? <div className="table"><table><thead><tr><th>Paciente</th><th>Horário</th><th>Status</th></tr></thead><tbody>{pacientes.map(p => <tr key={p.nome}><td>{p.nome}<small className="previa-dado-ficticio">Paciente fictício</small></td><td>{p.horario}</td><td><span className="badge green">Confirmada</span></td></tr>)}</tbody></table></div> : <div className="feature-empty" role="status"><p>Nenhum paciente corresponde à busca.</p><button className="secondary" onClick={() => setBusca("")}>Limpar busca</button></div>}
    </section>
  </div>;
}
