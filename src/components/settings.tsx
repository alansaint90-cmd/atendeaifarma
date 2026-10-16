"use client";
import { useCallback, useEffect, useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { AgentSettings } from "./agent-settings";
import { ModalConfirmacaoBlock } from "./modal-confirmacao-block";
const fields = [
  ["OPENAI_API_KEY", "Chave de API da OpenAI", true],
  ["OPENAI_MODEL", "Modelo OpenAI", false],
  ["EVOLUTION_API_URL", "URL base da Evolution", false],
  ["EVOLUTION_API_KEY", "Chave de API da Evolution", true],
  ["EVOLUTION_INSTANCE_NAME", "Nome exato da instância Evolution", false],
  ["EVOLUTION_SECOND_INSTANCE_NAME", "Instância Evolution do segundo número (opcional)", false],
  ["EVOLUTION_THIRD_INSTANCE_NAME", "Instância Evolution do terceiro número (opcional)", false],
  ["EVOLUTION_WEBHOOK_SECRET", "Segredo do webhook (32 a 256 caracteres)", true],
  ["REDIS_URL", "URL de conexão Redis", true],
] as const;
const instanciasOpcionais: Record<string, string> = {
  EVOLUTION_SECOND_INSTANCE_NAME: "Vazio desativa o segundo número",
  EVOLUTION_THIRD_INSTANCE_NAME: "Vazio desativa o terceiro número",
};
type Status = { version: number; configured: Record<string, boolean>; values: Record<string, string> };
export function Settings({ podeEditar = true }: { podeEditar?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confirmarWebhook, setConfirmarWebhook] = useState(false);
  const hydrated = useHydrated();
  const webhook = hydrated ? `${window.location.origin}/api/webhooks/evolution` : "";
  const carregar = useCallback(async () => {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/settings/integrations");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao acessar o servidor.");
      setStatus(result); setValues(result.values);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);
  async function salvar() {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: status?.version, values: Object.fromEntries(Object.entries(values).filter(([name, value]) => value.trim() || name in instanciasOpcionais).map(([name, value]) => [name, value.trim()])) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao acessar o servidor.");
      setStatus(result); setValues(result.values); setConfirm(false);
      setMessage("Configurações salvas no servidor. Isso não confirma conexão com os provedores.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha de conexão."); }
    finally { setBusy(false); }
  }
  async function sincronizarWebhook() {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/settings/evolution-webhook", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao sincronizar o webhook.");
      setMessage("Webhook confirmado na Evolution para todos os chips configurados. Envie uma nova mensagem em cada número para testar o agente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha de conexão."); }
    finally { setConfirmarWebhook(false); setBusy(false); }
  }
  return <><section className="page-head"><div><h1>Configurações de integrações</h1><p>{podeEditar ? "Credenciais criptografadas e salvas no servidor." : "Consulta da operação. Alterações de credenciais são exclusivas do Super administrador."}</p></div></section>
    <section className="settings-grid"><article className="panel form-panel"><h2>Webhook da Evolution</h2><label>URL de recebimento do Atende AI<input readOnly value={webhook} /></label><p>Antes de sincronizar, salve abaixo a URL base da Evolution, a chave de API, o nome exato da instância e o segredo do webhook. Esta URL de recebimento é diferente da URL base da Evolution.</p><p>A sincronização envia o cabeçalho <code>x-webhook-secret</code> para a instância configurada.</p><small>Para responder, habilite o processador no servidor e configure o agente abaixo.</small>{podeEditar && <button type="button" disabled={busy || !status} onClick={() => { setError(""); setMessage(""); setConfirmarWebhook(true); }}>Sincronizar webhook na Evolution</button>}</article></section>
    <p role="status" aria-live="polite">{message}</p>
    {error && <p role="alert">{error}</p>}
    {!status && !error && <p role="status">{busy ? "Carregando configurações…" : "Aguardando a consulta das configurações."}</p>}
    {status && <form className="panel form-panel" onSubmit={event => { event.preventDefault(); setConfirm(true); }}>
      <AgentSettings values={values} disabled={busy || confirm || !podeEditar} onChange={(name, value) => setValues(previous => ({ ...previous, [name]: value }))} />
      {fields.map(([name, label, secret]) => <label key={name}>{label}<input type={secret ? "password" : "text"} autoComplete="off" spellCheck={false} maxLength={4096} disabled={busy || confirm || !podeEditar} value={values[name] ?? ""} placeholder={instanciasOpcionais[name] ?? (status.configured[name] ? "Configurado — deixe vazio para manter" : "Não configurado")} onChange={event => setValues(previous => ({ ...previous, [name]: event.target.value }))} /><small>{status.configured[name] ? "Valor configurado no servidor" : "Nenhum valor configurado"}</small></label>)}
      <small>Até três números podem usar a mesma Evolution, com prompts próprios em Chatbot IA. Deixe o campo do segundo ou terceiro número vazio para desativar aquele chip. Os outros campos vazios mantêm o valor atual. As configurações salvas prevalecem sobre as variáveis de ambiente. Redis deve começar com redis:// ou rediss://.</small>
      {podeEditar && <button className="primary" disabled={busy || confirm}>Salvar configurações</button>}
      <ModalConfirmacaoBlock aberto={confirm} titulo="Salvar configurações do agente"
        mensagem="Ativar respostas autoriza o agente a responder novas mensagens de texto e áudio no WhatsApp usando o prompt salvo em Chatbot IA. Alterar o segredo exige atualizar também a Evolution."
        carregando={busy} onConfirmar={() => void salvar()} onCancelar={() => setConfirm(false)} textoConfirmar="Confirmar e salvar" />
    </form>}
    <ModalConfirmacaoBlock aberto={confirmarWebhook} titulo="Sincronizar webhook na Evolution"
      mensagem="A Evolution passará a enviar os eventos de todos os chips configurados ao Atende AI com o mesmo segredo. Confirme que a URL, a chave, os nomes das instâncias e o segredo já foram salvos."
      carregando={busy} onConfirmar={() => void sincronizarWebhook()} onCancelar={() => setConfirmarWebhook(false)} textoConfirmar="Confirmar sincronização" />
  </>;
}
