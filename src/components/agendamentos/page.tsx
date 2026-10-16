"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarAgendamentos, gravarAgendamento, cancelarEnvioAgendado } from "@/lib/actions/agendamentos";
import { statusAgendamento, type Agendamento, type DadosAgendamento } from "@/lib/agendamentos/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

function dataLocal(iso: string) {
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const formatar = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function AgendamentosPage({ ativoNaTela = true }: { ativoNaTela?: boolean }) {
  const [itens, setItens] = useState<Agendamento[] | null>(null);
  const [instancias, setInstancias] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(0);
  const [rascunho, setRascunho] = useState<DadosAgendamento | null>(null);
  const [versao, setVersao] = useState<number | undefined>();
  const [horario, setHorario] = useState("");
  const [confirmacao, setConfirmacao] = useState<"salvar" | "cancelar" | null>(null);
  const [alvo, setAlvo] = useState<Agendamento | null>(null);
  const carregar = useCallback(async () => {
    setOcupado(true); setErro(""); setAviso("");
    try {
      const r = await carregarAgendamentos();
      if (!r.ok) { setErro(r.erro); return; }
      setItens(r.dados.itens); setInstancias(r.dados.instancias); setAtivo(r.dados.processadorAtivo); setPagina(0);
    } catch { setErro("Falha de conexão ao carregar agendamentos."); } finally { setOcupado(false); }
  }, []);
  useEffect(() => {
    if (!ativoNaTela) return;
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [ativoNaTela, carregar]);
  function editar(item?: Agendamento) {
    setErro(""); setAviso(""); setVersao(item?.version);
    const iso = item?.agendadoPara ?? new Date(Date.now() + 3600000).toISOString();
    setHorario(dataLocal(iso));
    setRascunho({ id: item?.id ?? crypto.randomUUID(), telefone: item?.telefone ?? "", instancia: item?.instancia ?? instancias[0] ?? "",
      mensagem: item?.mensagem ?? "", agendadoPara: iso });
  }
  async function confirmar() {
    setOcupado(true); setErro("");
    try {
      const r = confirmacao === "cancelar"
        ? await cancelarEnvioAgendado({ id: alvo?.id, version: alvo?.version })
        : await gravarAgendamento(rascunho, versao === undefined ? undefined : { id: rascunho!.id, version: versao });
      if (!r.ok) { setErro(r.erro); return; }
      setItens(previous => [r.dados, ...previous!.filter(item => item.id !== r.dados.id)].sort((a, b) => b.agendadoPara.localeCompare(a.agendadoPara)));
      setRascunho(null); setAlvo(null); setPagina(0);
      setAviso(confirmacao === "cancelar" ? "Agendamento cancelado." : "Agendamento salvo no servidor.");
    } catch { setErro("Falha de conexão. Recarregue a lista antes de tentar novamente."); }
    finally { setOcupado(false); setConfirmacao(null); }
  }
  const filtrados = (itens ?? []).filter(item => (!filtro || item.status === filtro) && `${item.telefone} ${item.mensagem} ${item.instancia}`.toLowerCase().includes(busca.toLowerCase()));
  const atual = Math.min(pagina, Math.max(0, Math.ceil(filtrados.length / 10) - 1));
  return <div className="page-stack">
    <section className="page-head"><div><h1>Mensagens agendadas</h1><p>Agende envios individuais para contatos específicos.</p></div></section>
    {erro && <p role="alert" className="error-message">{erro}</p>}{aviso && <p role="status">{aviso}</p>}
    {!itens && !erro && <p role="status">{ocupado ? "Carregando agendamentos…" : "Aguardando a consulta dos agendamentos."}</p>}
    {itens && <article className="panel">
      {!ativo && <p role="status" className="followup-note">Processador desativado no servidor. Os agendamentos serão salvos, mas o envio depende da ativação em Configurações do servidor.</p>}
      <div className="page-head"><div className="agendamento-filtros"><label>Buscar<input placeholder="Telefone, chip ou mensagem" value={busca} onChange={e => { setBusca(e.target.value); setPagina(0); }} /></label>
        <label>Status<select value={filtro} onChange={e => { setFiltro(e.target.value); setPagina(0); }}><option value="">Todos</option>{Object.entries(statusAgendamento).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <button className="primary" disabled={ocupado || !instancias.length} onClick={() => editar()}>+ Novo agendamento</button></div>
      {!instancias.length && <p>Configure um chip Evolution em Configurações para agendar.</p>}
      {rascunho && <form className="tag-editor" onSubmit={event => {
        event.preventDefault(); const data = new Date(horario);
        if (!Number.isFinite(data.getTime()) || data.getTime() < Date.now() + 60000) { setErro("Escolha um horário com pelo menos um minuto de antecedência."); return; }
        setRascunho({ ...rascunho, agendadoPara: data.toISOString() }); setConfirmacao("salvar");
      }}><h2>{versao === undefined ? "Novo agendamento" : "Editar agendamento"}</h2>
        <div className="followup-grid"><label>Telefone com código do país<input required type="tel" placeholder="+5571999999999" pattern="\+[1-9][0-9]{6,14}" disabled={ocupado} value={rascunho.telefone} onChange={e => setRascunho({ ...rascunho, telefone: e.target.value })} /></label>
          <label>Chip<select required disabled={ocupado} value={rascunho.instancia} onChange={e => setRascunho({ ...rascunho, instancia: e.target.value })}>
            {!instancias.includes(rascunho.instancia) && <option value="">Selecione um chip disponível</option>}
            {instancias.map(instancia => <option key={instancia} value={instancia}>{instancia}</option>)}
          </select></label></div>
        <label>Data e hora<input required type="datetime-local" disabled={ocupado} value={horario} onChange={e => setHorario(e.target.value)} /></label>
        <small>Horários no fuso do seu navegador: {Intl.DateTimeFormat().resolvedOptions().timeZone}. O envio pode ocorrer após o horário se o serviço estiver indisponível.</small>
        <label>Mensagem<textarea required maxLength={6000} rows={4} disabled={ocupado} value={rascunho.mensagem} onChange={e => setRascunho({ ...rascunho, mensagem: e.target.value })} /></label>
        <div className="feature-actions"><button className="primary" disabled={ocupado}>Salvar agendamento</button><button className="secondary" type="button" disabled={ocupado} onClick={() => setRascunho(null)}>Fechar formulário</button></div>
      </form>}
      <div className="table"><table><thead><tr><th>Data e hora</th><th>Telefone</th><th>Chip</th><th>Mensagem</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{filtrados.slice(atual * 10, atual * 10 + 10).map(item => <tr key={item.id}><td>{formatar(item.agendadoPara)}</td><td>{item.telefone}</td><td>{item.instancia}</td>
          <td className="agendamento-mensagem"><details><summary>{item.mensagem.slice(0, 75)}{item.mensagem.length > 75 ? "…" : ""}</summary><p>{item.mensagem}</p></details></td>
          <td><span className={`badge agenda-${item.status}`}>{statusAgendamento[item.status]}</span>{item.codigoErro && <small className="agendamento-erro">{item.codigoErro}</small>}</td>
          <td>{item.status === "pendente" ? <div className="feature-actions"><button className="secondary" disabled={ocupado} onClick={() => editar(item)}>Editar</button><button className="secondary" disabled={ocupado} onClick={() => { setAlvo(item); setConfirmacao("cancelar"); }}>Cancelar envio</button></div> : "—"}</td></tr>)}</tbody></table></div>
      {!filtrados.length && <p className="feature-empty">{itens.length ? "Nenhum agendamento encontrado para os filtros." : "Nenhuma mensagem agendada. Crie seu primeiro agendamento."}</p>}
      <div className="feature-pagination"><span>{filtrados.length} agendamentos · página {atual + 1} de {Math.max(1, Math.ceil(filtrados.length / 10))}</span>
        <button className="secondary" disabled={!atual} onClick={() => setPagina(atual - 1)}>Anterior</button><button className="secondary" disabled={(atual + 1) * 10 >= filtrados.length} onClick={() => setPagina(atual + 1)}>Próxima</button></div>
      <p className="followup-note">“Enviado” confirma a aceitação pela Evolution, não a leitura pelo destinatário. Envios incertos exigem conferência antes de criar outro agendamento.</p>
    </article>}
    <ModalConfirmacaoBlock aberto={confirmacao !== null} titulo={confirmacao === "cancelar" ? "Cancelar envio agendado" : "Confirmar agendamento"}
      mensagem={confirmacao === "cancelar" ? `Cancelar o envio para ${alvo?.telefone}? O registro será preservado.` : `Enviar a mensagem para ${rascunho?.telefone} pelo chip ${rascunho?.instancia} em ${rascunho ? formatar(rascunho.agendadoPara) : ""}?`}
      carregando={ocupado} onConfirmar={() => void confirmar()} onCancelar={() => setConfirmacao(null)} />
  </div>;
}
