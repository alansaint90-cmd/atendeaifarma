"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { carregarFollowups, salvarFollowups } from "@/lib/actions/followups";
import { defaultFollowup, followupSchema, type FollowupConfig } from "@/lib/followups/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export function FollowupsPage({ ativo = true }: { ativo?: boolean }) {
  const [config, setConfig] = useState<FollowupConfig>(() => structuredClone(defaultFollowup));
  const [savedConfig, setSavedConfig] = useState<FollowupConfig | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [instance, setInstance] = useState("");
  const [instances, setInstances] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);
  const dirty = savedConfig !== null && JSON.stringify(config) !== JSON.stringify(savedConfig);
  function change(value: Partial<FollowupConfig>) { setConfig(previous => ({ ...previous, ...value })); setMessage(""); setError(""); }
  function step(index: number, value: Partial<FollowupConfig["steps"][number]>) {
    const steps = structuredClone(config.steps); steps[index] = { ...steps[index], ...value }; change({ steps });
  }
  const load = useCallback(async (instancia?: string) => {
    setBusy(true); setError("");
    try { const result = await carregarFollowups(instancia);
      if (!result.ok) { setError(result.erro); return; }
      const persisted = { ...result.dados.config, instance: result.dados.config.instance || result.dados.instance };
      setConfig(persisted); setSavedConfig(persisted);
      setVersion(result.dados.version); setInstance(result.dados.instance); setMessage("");
      setInstances(result.dados.instances ?? [result.dados.instance].filter(Boolean));
    } catch { setError("Falha de conexão ao carregar follow-ups."); } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (!ativo || loaded.current) return;
    const timer = window.setTimeout(() => { loaded.current = true; void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [ativo, load]);
  async function save() {
    setBusy(true); setError("");
    try { const result = await salvarFollowups(config, version!);
      if (!result.ok) { setError(result.erro); return; }
      setConfig(result.dados.config); setSavedConfig(result.dados.config);
      setVersion(result.dados.version); setMessage("Follow-ups salvos no servidor.");
    } catch { setError("Falha de conexão. Recarregue antes de tentar novamente."); }
    finally { setBusy(false); setConfirm(false); }
  }
  return <div className="page-stack">
    <section className="page-head"><div><h1>Follow-ups automáticos</h1><p>Retome atendimentos quando o contato deixar de responder.</p></div></section>
    {version === null && error && <p role="alert" className="error-message">{error} <button type="button" onClick={() => void load()}>Tentar novamente</button></p>}
    {version === null && !error && <p role="status">{busy ? "Carregando follow-ups…" : "Aguardando a consulta dos follow-ups."}</p>}
    {version !== null && <form className="panel form-panel followup-form" onSubmit={event => {
      event.preventDefault(); const parsed = followupSchema.safeParse(config);
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; } setError(""); setConfirm(true);
    }}><fieldset disabled={busy || confirm}>
      <div className="followup-grid"><label>Chip<select value={config.instance} disabled={dirty} onChange={event => void load(event.target.value)}>
        <option value="" disabled>Selecione um chip</option>{instances.map(nome => <option key={nome} value={nome}>{nome}</option>)}</select></label>
        <label>Fuso horário<select value={config.timezone} onChange={event => change({ timezone: event.target.value as FollowupConfig["timezone"] })}>
          <option value="America/Sao_Paulo">Brasília / São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Recife">Recife</option><option value="America/Rio_Branco">Rio Branco</option>
        </select></label></div>
      {!instance && <p role="status">Configure a instância Evolution em Configurações antes de ativar.</p>}
      {instances.length > 1 && <p>As mensagens e os horários são salvos separadamente para cada chip. {dirty && "Salve ou desfaça as alterações antes de trocar o chip."}</p>}
      <label className="feature-switch"><input type="checkbox" role="switch" checked={config.enabled} onChange={event => change({ enabled: event.target.checked })} /><span>Follow-ups automáticos {config.enabled ? "ligados" : "desligados"}</span></label>
      <div className="followup-grid three"><label>Atuar em<select value="ai" onChange={() => {}}><option value="ai">Chatbots de IA</option></select></label>
        <label>Não enviar antes das<input type="number" min={0} max={23} required value={config.startHour} onChange={event => change({ startHour: event.target.valueAsNumber })} /></label>
        <label>Não enviar a partir das<input type="number" min={1} max={24} required value={config.endHour} onChange={event => change({ endHour: event.target.valueAsNumber })} /></label></div>
      <fieldset className="followup-days"><legend>Enviar nos dias</legend>{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}>
        <input type="checkbox" checked={config.days.includes(day)} onChange={event => change({ days: event.target.checked ? [...config.days, day] : config.days.filter(item => item !== day) })} />{weekdays[day]}</label>)}</fieldset>
      <p className="followup-note">Até 3 mensagens por ciclo de atendimento. Uma nova mensagem cancela a sequência pendente. Os intervalos contam a partir da última resposta automática ou do follow-up anterior.</p>
      {config.steps.map((item, index) => <section className="followup-step" key={index}><h2>{index + 1}ª mensagem</h2>
        <label className="feature-switch"><input type="checkbox" role="switch" aria-label={`Ativar ${index + 1}ª mensagem`} checked={item.enabled} onChange={event => step(index, { enabled: event.target.checked })} /><span>{item.enabled ? "Ligada" : "Desligada"}</span></label>
        <label>Mensagem {index + 1}<textarea rows={3} maxLength={3000} required={item.enabled} value={item.text} onChange={event => step(index, { text: event.target.value })} /></label>
        <div className="followup-grid"><label>Tempo da {index + 1}ª mensagem<input type="number" required min={1} max={10080} value={item.delay} onChange={event => step(index, { delay: event.target.valueAsNumber })} /></label>
          <label>Unidade da {index + 1}ª mensagem<select value={item.unit} onChange={event => step(index, { unit: event.target.value as typeof item.unit })}><option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Dias</option></select></label></div>
      </section>)}
      <p className="followup-note">É necessário manter o agente habilitado no servidor. Ativar não envia mensagens antigas: a sequência começa após uma nova resposta bem-sucedida do chatbot.</p>
    </fieldset>
      <div className="followup-save-bar">
        <span role={error ? "alert" : "status"} className={error ? "error-message" : ""}>
          {error || (busy ? "Processando follow-ups…" : message || (dirty ? "Alterações não salvas" : "Sem alterações pendentes"))}
        </span>
        <button type="submit" className="primary" disabled={busy || confirm || !dirty}>Salvar follow-ups</button>
        {dirty && <button type="button" disabled={busy || confirm} onClick={() => { if (savedConfig) setConfig(structuredClone(savedConfig)); setError(""); }}>Desfazer alterações</button>}
      </div>
    </form>}
    <ModalConfirmacaoBlock aberto={confirm} titulo="Salvar follow-ups automáticos" mensagem={config.enabled
      ? "As mensagens configuradas poderão ser enviadas automaticamente pelo chip selecionado após novos atendimentos sem resposta, nos dias e horários definidos. Confirmar?"
      : "Salvar com follow-ups desligados? Sequências anteriores não serão retomadas ao reativar."}
      carregando={busy} onConfirmar={() => void save()} onCancelar={() => setConfirm(false)} />
  </div>;
}
