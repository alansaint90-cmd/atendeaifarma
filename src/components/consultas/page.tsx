"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarAgendaConsultas, confirmarConsulta, cancelarConsultaAgendada } from "@/lib/actions/consultas";
import { pacienteSchema, formatarConsulta, type HorarioConsulta, type Consulta } from "@/lib/consultas/schema";
import { proximasQuintas } from "@/lib/consultas/calendario";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
import { PacienteForm, pacienteVazio } from "./paciente-form";

interface ConsultasPageProps { ativoNaTela: boolean }
export function ConsultasPage({ ativoNaTela }: ConsultasPageProps) {
  const [dia, setDia] = useState(() => proximasQuintas()[0]);
  const [dados, setDados] = useState<{ horarios: HorarioConsulta[]; consultas: Consulta[]; instancias: string[] } | null>(null);
  const [ocupado, setOcupado] = useState(false); const [erro, setErro] = useState(""); const [aviso, setAviso] = useState("");
  const [horario, setHorario] = useState<HorarioConsulta | null>(null); const [paciente, setPaciente] = useState(pacienteVazio);
  const [instancia, setInstancia] = useState(""); const [conferido, setConferido] = useState(false);
  const [solicitacaoId, setSolicitacaoId] = useState("");
  const [confirmacao, setConfirmacao] = useState<"reserva" | Consulta | null>(null);
  const carregar = useCallback(async () => {
    setOcupado(true); setErro("");
    try {
      const r = await carregarAgendaConsultas(dia);
      if (!r.ok) { setDados(null); setErro(r.erro); return; }
      setDados(r.dados); setInstancia(atual => r.dados.instancias.includes(atual) ? atual : r.dados.instancias[0] ?? "");
    } catch { setDados(null); setErro("Não foi possível carregar a agenda."); } finally { setOcupado(false); }
  }, [dia]);
  useEffect(() => {
    if (!ativoNaTela) return;
    const t = setTimeout(() => void carregar(), 0); return () => clearTimeout(t);
  }, [ativoNaTela, carregar]);
  async function salvar() {
    setOcupado(true); setErro("");
    try {
      const r = confirmacao === "reserva" ? await confirmarConsulta({ instancia, solicitacaoId,
        reserva: { horarioId: horario?.id, paciente, dadosConferidos: conferido } })
        : await cancelarConsultaAgendada({ id: confirmacao && confirmacao.id, atualizadoEm: confirmacao && confirmacao.atualizadoEm });
      if (!r.ok) { setErro(r.erro); return; }
      setAviso(confirmacao === "reserva" ? "Consulta confirmada e cadastro registrado. Nenhuma mensagem foi enviada pelo painel." : "Consulta cancelada. O horário voltou a ficar disponível.");
      setHorario(null); setPaciente(pacienteVazio); setConferido(false);
      await carregar();
    } catch { setErro("Não foi possível confirmar o resultado. Atualize a agenda antes de tentar novamente."); }
    finally { setConfirmacao(null); setOcupado(false); }
  }
  return <div className="page-stack"><header className="page-heading"><h1>Agenda de consultas</h1>
    <p>Quintas-feiras · 8h, 8h40, 9h20, 10h, 10h40 e 11h20 · horário de Brasília.</p></header>
    <article className="card"><div className="feature-filters"><label>Dia da consulta<input type="date" value={dia} disabled={ocupado || !!horario}
      onChange={e => { setDia(e.target.value); setDados(null); setAviso(""); }} /></label>
      <button className="secondary" disabled={ocupado} onClick={() => void carregar()}>Atualizar agenda</button></div>
      <p>A consulta só é confirmada com cadastro completo. Cada horário recebe apenas um paciente, inclusive quando as reservas vêm de chips diferentes.</p>
      {erro && <p role="alert">{erro}</p>}{aviso && <p role="status">{aviso}</p>}{ocupado && <p role="status">Consultando a agenda…</p>}
      {dados && <><h2>Horários</h2><div className="feature-actions">{dados.horarios.map(v => <button className="secondary" key={v.id} disabled={!v.disponivel || ocupado || !!horario}
        onClick={() => { setHorario(v); setSolicitacaoId(crypto.randomUUID()); setConferido(false); setAviso(""); }}>
        {formatarConsulta(v.inicio)} · {v.disponivel ? "Livre" : "Ocupado"}</button>)}</div>
      {!dados.horarios.length && <p className="feature-empty">Não há horários futuros para este dia.</p>}
      {horario && <form className="feature-form" onSubmit={e => { e.preventDefault(); const p = pacienteSchema.safeParse(paciente);
        if (!p.success) { setErro(p.error.issues[0].message); return; } setErro(""); setConfirmacao("reserva"); }}>
        <h2>Nova consulta · {formatarConsulta(horario.inicio)}</h2><p>A seleção não bloqueia a vaga enquanto o cadastro é preenchido.</p>
        <label>Canal<select required disabled={ocupado} value={instancia} onChange={e => setInstancia(e.target.value)}>{dados.instancias.map(i => <option key={i}>{i}</option>)}</select></label>
        <PacienteForm paciente={paciente} ocupado={ocupado} aoAlterar={p => { setPaciente(p); setConferido(false); }} />
        <label><input type="checkbox" required checked={conferido} disabled={ocupado} onChange={e => setConferido(e.target.checked)} />Conferi os dados do paciente e o horário.</label>
        <div className="feature-actions"><button className="primary" disabled={ocupado || !conferido || !instancia}>Confirmar consulta</button>
          <button type="button" className="secondary" disabled={ocupado} onClick={() => setHorario(null)}>Fechar cadastro</button></div>
      </form>}
      <h2>Consultas do dia</h2>{!dados.consultas.length && <p className="feature-empty">Nenhuma consulta registrada neste dia.</p>}
      <div className="table"><table><thead><tr><th>Horário</th><th>Paciente</th><th>Contato</th><th>Status</th><th>Cadastro</th><th>Ação</th></tr></thead>
        <tbody>{dados.consultas.map(c => <tr key={c.id}><td>{formatarConsulta(c.inicio)}</td><td>{c.nomeCompleto}</td><td>{c.telefone || "Não informado"}</td><td>{c.status === "confirmada" ? "Confirmada" : "Cancelada"}</td>
          <td><details><summary>Ver dados</summary><p>Nascimento: {c.nascimento.split("-").reverse().join("/")}</p>
            <p>{c.rua}, {c.numero} {c.complemento} · {c.bairro} · {c.cidade}{c.uf ? `/${c.uf}` : ""}{c.cep ? ` · CEP ${c.cep}` : ""}</p><small>Protocolo: {c.id}</small></details></td>
          <td>{c.status === "confirmada" && <button className="secondary" disabled={ocupado} onClick={() => setConfirmacao(c)}>Cancelar consulta</button>}</td></tr>)}</tbody></table></div></>}
    </article><ModalConfirmacaoBlock aberto={confirmacao !== null} titulo={confirmacao === "reserva" ? "Confirmar consulta" : "Cancelar consulta"}
      mensagem={confirmacao === "reserva" ? `Registrar ${paciente.nomeCompleto} em ${horario ? formatarConsulta(horario.inicio) : ""}?` : "Cancelar a consulta e liberar a vaga? O cadastro será preservado. Nenhuma mensagem será enviada automaticamente."}
      carregando={ocupado} onConfirmar={() => void salvar()} onCancelar={() => setConfirmacao(null)} /></div>;
}
