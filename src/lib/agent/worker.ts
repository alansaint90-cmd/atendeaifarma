import { randomUUID } from "node:crypto";
import { z } from "zod";
import { effectiveSettings } from "../settings/repository";
import { evolutionEventSchema } from "../evolution/schema";
import { streamKey } from "../evolution/queue";
import { agentBaseConfigSchema, configurarAgente as configurarBase } from "./config";
import { geradorFarmacia } from "../farmacia/agente";
import { atendimentoHumanoAtivo } from "../farmacia/atendimento";
import { incomingMessage, digest } from "./message";
import { generateReply, sendReply } from "./providers";
import { transcribeAudio } from "./audio";
import { processMessage } from "./processor";
import { agentRedis, agentKeys, owned } from "./redis";
import { finishEvent, messageStore } from "./store";
import { followupDaInstancia, settingsDaInstancia } from "../evolution/instancias";
import { followupStore } from "../followups/queue";
import { configuracaoPermiteFollowup, processFollowup } from "../followups/processor";
import { executarAgendamentos } from "../agendamentos/worker";
import { chatbotDaInstancia } from "../chatbots/server-repository";
import { db } from "../db/client";
import { registrarEnvioIa } from "../operacao/atribuir-ia";
import { pausaManualAtiva, pausarTransferencia } from "./pausa";
import { transferirAtendimento } from "../operacao/transferir";
import { deveAguardarResposta } from "./espera";

const streamResult = z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.array(z.string())]))]));
const configurarAgente = (...args: Parameters<typeof configurarBase>) => {
  const resultado = configurarBase(...args);
  if (resultado.success) resultado.data.agendaConsultas = false;
  return resultado;
};
let started = false;
let lastLog = "";
function report(status: string) {
  if (lastLog !== status) { console.info(`Atende AI agente: ${status}`); lastLog = status; }
}

const dependenciasPadrao = { settings: effectiveSettings, generate: generateReply, send: sendReply,
  transferir: (instancia: string, numero: string, destino: string) => transferirAtendimento(db(), instancia, numero, destino),
  registrarEnvio: (instancia: string, id: string) => registrarEnvioIa(db(), instancia, id),
  chatbot: (instancia: string) => chatbotDaInstancia(db(), instancia) };
export async function runAgentTick(substituicoes: Partial<typeof dependenciasPadrao> = {}) {
  const dependencies = { ...dependenciasPadrao, ...substituicoes,
    chatbot: substituicoes.chatbot ?? (Object.keys(substituicoes).length ? async () => null : dependenciasPadrao.chatbot) };
  const settings = await dependencies.settings();
  if (!settings.REDIS_URL) { report("Redis não configurado"); return; }
  const client = agentRedis(settings.REDIS_URL);
  const token = randomUUID();
  try {
    await client.connect();
    if (!await client.set(agentKeys.lock, token, "PX", 120000, "NX")) return;
    const config = agentBaseConfigSchema.safeParse(settings);
    const status = settings.AI_ENABLED !== "true" ? "desativado" : config.success ? "ativo" : "configuracao_incompleta";
    const previous = await client.get(agentKeys.heartbeat);
    const last = previous ? JSON.parse(previous) as { lastResult?: string; lastCode?: string; lastAt?: string } : {};
    await client.set(agentKeys.heartbeat, JSON.stringify({ status, at: new Date().toISOString(),
      lastResult: last.lastResult, lastCode: last.lastCode, lastAt: last.lastAt }), "EX", 180);
    report(status);
    if (!config.success) return;
    const followups = followupStore(client, token);
    try { await client.xgroup("CREATE", streamKey, agentKeys.group, "0", "MKSTREAM"); }
    catch (error) { if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) throw error; }
    // Consumidor fixo + lease global recuperam o primeiro pendente antes de ler novos.
    let raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, "0");
    let entries = streamResult.parse(raw ?? [])[0]?.[1] ?? [];
    if (!entries.length) {
      raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, ">");
      entries = streamResult.parse(raw ?? [])[0]?.[1] ?? [];
    }
    for (const [id, fields] of entries) {
      const payload = fields[fields.indexOf("payload") + 1] ?? "{}";
      let value: unknown;
      try { value = JSON.parse(payload); } catch { value = null; }
      const parsed = evolutionEventSchema.safeParse(value);
      const instancia = parsed.success ? parsed.data.instance : "";
      const chatbot = settingsDaInstancia(settings, instancia) ? await dependencies.chatbot(instancia) : null;
      const config = configurarAgente(settingsDaInstancia(settings, instancia), chatbot);
      const followupConfig = followupDaInstancia(settings, instancia);
      if (parsed.success && config.success) await followups.observe(parsed.data, instancia);
      const message = parsed.success && config.success ? incomingMessage(parsed.data, instancia, Date.now(), config.data.atendimento?.transferMedia) : null;
      let result = "ignorada";
      if (message && config.success) {
        if (!await pausaManualAtiva(client, message.conversation)
          && deveAguardarResposta(config.data.agendaConsultas, message.timestamp)) return false;
        const store = messageStore(client, token, message);
        const atendimentoAtivo = async () => {
          const atual = configurarAgente(settingsDaInstancia(await dependencies.settings(), instancia), await dependencies.chatbot(instancia));
          return atual.success && JSON.stringify(atual.data) === JSON.stringify(config.data)
            && (Object.keys(substituicoes).length > 0 || !await atendimentoHumanoAtivo(db(), instancia, message.number))
            && !await pausaManualAtiva(client, message.conversation) && await client.get(agentKeys.lock) === token;
        };
        result = await pausaManualAtiva(client, message.conversation) ? "pausa_manual" : await processMessage(message, config.data, {
          ...store, generate: substituicoes.generate ?? geradorFarmacia(db(), instancia, message), send: dependencies.send, transcribe: transcribeAudio,
          registrarParte: async id => {
            await followups.outgoing(instancia, id);
            await dependencies.registrarEnvio(instancia, id);
          },
          transferir: async destino => {
            await dependencies.transferir(instancia, message.number, destino);
            await pausarTransferencia(client, token, message.conversation);
          },
          enabled: atendimentoAtivo,
        });
        if (result === "pausada" && (await pausaManualAtiva(client, message.conversation)
          || (Object.keys(substituicoes).length === 0 && await atendimentoHumanoAtivo(db(), instancia, message.number)))) result = "pausa_manual";
        const state = await store.read();
        if (state?.status === "enviada" && state.providerId) {
          // Estados antigos não registravam cada parte antes da confirmação.
          if (!state.providerIds?.includes(state.providerId)) {
            await dependencies.registrarEnvio(config.data.EVOLUTION_INSTANCE_NAME, state.providerId);
            await followups.outgoing(config.data.EVOLUTION_INSTANCE_NAME, state.providerId);
          }
          if (!state.transferencia && !state.consulta && followupConfig.instance === config.data.EVOLUTION_INSTANCE_NAME && state.configHash === digest(JSON.stringify(config.data))) {
            await followups.schedule(message, followupConfig);
          }
        }
        await client.set(agentKeys.heartbeat, JSON.stringify({ status: "ativo", at: new Date().toISOString(),
          lastResult: result, lastCode: state?.code ?? null, lastAt: new Date().toISOString() }), "EX", 180);
      }
      if (result !== "repetir" && result !== "pausada") {
        const archive = JSON.stringify({ event: parsed.success ? parsed.data.event : "invalido", message });
        await finishEvent(client, token, id, archive, result);
      }
      report(result);
      return result !== "repetir" && result !== "pausada";
    }
    const job = await followups.due();
    if (job) {
      const instancia = job.instance ?? settings.EVOLUTION_INSTANCE_NAME ?? "";
      const chatbot = settingsDaInstancia(settings, instancia) ? await dependencies.chatbot(instancia) : null;
      const config = configurarAgente(settingsDaInstancia(settings, instancia), chatbot);
      if (!config.success) { await followups.finish(job, "cancelado"); return; }
      const followupConfig = followupDaInstancia(settings, instancia);
      await processFollowup(job, followupConfig, {
        save: followups.save, finish: result => followups.finish(job, result),
        enabled: async () => {
          const currentSettings = await dependencies.settings();
          const currentFollowup = followupDaInstancia(currentSettings, instancia);
          const currentBot = await dependencies.chatbot(instancia);
          const current = configurarAgente(settingsDaInstancia(currentSettings, instancia), currentBot);
          return current.success && JSON.stringify(current.data) === JSON.stringify(config.data)
            && (Object.keys(substituicoes).length > 0 || !await atendimentoHumanoAtivo(db(), instancia, job.number))
            && configuracaoPermiteFollowup(job, currentFollowup)
            && currentFollowup.instance === config.data.EVOLUTION_INSTANCE_NAME
            && !await pausaManualAtiva(client, job.conversation)
            && await client.get(agentKeys.lock) === token && await client.xlen(streamKey) === 0;
        },
        send: (number, text) => dependencies.send(config.data, number, text),
        delivered: async (id, text) => {
          await followups.outgoing(config.data.EVOLUTION_INSTANCE_NAME, id);
          await followups.history(job, text, digest(config.data.AI_SYSTEM_PROMPT));
        },
      });
    }
  } finally {
    if (client.status === "ready") await client.eval(owned + "redis.call('DEL', KEYS[1]); return 1", 1, agentKeys.lock, token).catch(() => {});
    client.disconnect();
  }
}

export function startAgentWorker() {
  if (started) return;
  started = true;
  const loop = async () => {
    let processed = false;
    try { await executarAgendamentos(); }
    catch { console.error("Atende AI: falha ao processar agendamentos; confira banco e configuração."); }
    try { processed = Boolean(await runAgentTick()); }
    catch { report("falha de configuração, Redis ou processamento; nova tentativa em 5 segundos"); }
    const timer = setTimeout(() => void loop(), processed ? 100 : 5000);
    timer.unref();
  };
  void loop();
}
