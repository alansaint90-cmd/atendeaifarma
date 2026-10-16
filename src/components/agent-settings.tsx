"use client";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/chatbots/repository";

interface AgentSettingsProps {
  values: Record<string, string>;
  disabled: boolean;
  onChange: (name: string, value: string) => void;
}

export function AgentSettings({ values, disabled, onChange }: AgentSettingsProps) {
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [loading, setLoading] = useState(false);
  const check = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/settings/agent", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar agente.");
      setDiagnostic(`Processador: ${result.workerEnabled ? "habilitado" : "desabilitado no servidor"}. Respostas: ${result.enabled ? "ativadas" : "desativadas"}. Fila: ${result.queued}. Estado: ${result.worker?.status ?? "sem sinal do processador"}. Último resultado: ${result.worker?.lastResult ?? "nenhum"}. Código: ${result.worker?.lastCode ?? "nenhum"}.`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(timer);
  }, [check]);
  return <fieldset disabled={disabled} className="form-panel">
    <legend>Agente de IA no WhatsApp</legend>
    <label>Respostas automáticas<select value={values.AI_ENABLED || "false"} onChange={event => onChange("AI_ENABLED", event.target.value)}>
      <option value="false">Desativadas</option><option value="true">Ativadas</option>
    </select></label>
    <small>As respostas usam somente o prompt do chatbot SDR configurado em Chatbot IA. Sem um chatbot com prompt vinculado à instância, o agente não responde. Mensagens individuais recentes de texto e áudio são respondidas por texto. Áudios: até 10 MiB; mantenha Webhook Base64 desligado na Evolution.</small>
    {loading && <p role="status">Consultando agente e fila…</p>}
    {diagnostic && <p role="status">{diagnostic}</p>}{error && <p role="alert">{error}</p>}
  </fieldset>;
}
