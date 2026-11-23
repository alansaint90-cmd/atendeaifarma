import { randomUUID } from "node:crypto";
import { z } from "zod";
import { effectiveSettings } from "../settings/repository";
import { evolutionEventSchema } from "../evolution/schema";
import { streamKey } from "../evolution/queue";
import { agentBaseConfigSchema } from "./config";
import { configurarAgenteFarmacia as configurarAgente } from "../farmacia/configuracao-agente";
import { consultaEstoqueFarmacia, geradorFarmacia, responderComprovanteFarmacia } from "../farmacia/agente";
import { estadoPausaIa } from "../farmacia/atendimento";
import { incomingMessage, digest } from "./message";
import { generateReply, sendReply, type ContinuidadeEstoque } from "./providers";
import { transcribeAudio } from "./audio";
import { processMessage } from "./processor";
import { agentRedis, agentKeys, owned } from "./redis";
import { finishEvent, messageStore } from "./store";
import { followupDaInstancia, settingsDaInstancia } from "../evolution/instancias";
import { followupStore } from "../followups/queue";
import { configuracaoPermiteFollowup, processFollowup } from "../followups/processor";
import { executarAgendamentos } from "../agendamentos/worker";
import { executarCampanhas } from "../farmacia/campanhas/worker";
import { chatbotDaInstancia } from "../chatbots/server-repository";
import { db } from "../db/client";
import { registrarEnvioIa, type MensagemConfirmadaIa } from "../operacao/atribuir-ia";
import { pausaManualAtiva, pausarTransferencia } from "./pausa";
import { transferirAtendimento } from "../operacao/transferir";
import { deveAguardarResposta } from "./espera";
import { conversaApagadaAposMensagem } from "../operacao/apagar-conversa";

const streamResult = z.array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.array(z.string())]))]));
let started = false;
let lastLog = "";
function report(status: string) {
  if (lastLog !== status) { console.info(`Atende AI agente: ${status}`); lastLog = status; }
}

const dependenciasPadrao = { settings: effectiveSettings, generate: generateReply, send: sendReply,
  apagada: (instancia: string, numero: string, instante: number, identidade: string) => conversaApagadaAposMensagem(db(), instancia, numero, instante, identidade),
  pausaConversa: (instancia: string, numero: string) => estadoPausaIa(db(), instancia, numero),
  transferir: (instancia: string, numero: string, destino: string, motivo?: "estoque_indisponivel") => transferirAtendimento(db(), instancia, numero, destino, motivo),
  consultarEstoque: (instancia: string, mensagem: Parameters<typeof consultaEstoqueFarmacia>[2], termo: string, continuidade?: ContinuidadeEstoque) => consultaEstoqueFarmacia(db(), instancia, mensagem)(termo, continuidade),
  registrarEnvio: (instancia: string, id: string, mensagem?: MensagemConfirmadaIa) => registrarEnvioIa(db(), instancia, id, mensagem),
  chatbot: (instancia: string) => chatbotDaInstancia(db(), instancia) };
export async function runAgentTick(substituicoes: Partial<typeof dependenciasPadrao> = {}) {
  const dependencies = { ...dependenciasPadrao, ...substituicoes,
    apagada: substituicoes.apagada ?? (Object.keys(substituicoes).length ? async () => false : dependenciasPadrao.apagada),
    pausaConversa: substituicoes.pausaConversa ?? (Object.keys(substituicoes).length ? async () => undefined : dependenciasPadrao.pausaConversa),
    chatbot: substituicoes.chatbot ?? (Object.keys(substituicoes).length ? async () => null : dependenciasPadrao.chatbot) };
  const settings = await dependencies.settings();
  if (!settings.REDIS_URL) { report("Redis não configurado"); return; }
  const client = agentRedis(settings.REDIS_URL);
  const token = randomUUID();
  try {
    await client.connect();
    if (!await client.set(agentKeys.lock, token, "PX", 120000, "NX")) return;
    const iaPausada = async (instancia: string, numero: string, conversa: string) => {
      const estado = await dependencies.pausaConversa(instancia, numero);
      return Boolean(estado?.bloqueada) || await pausaManualAtiva(client, conversa, Date.now(), estado?.retomadaEm);
    };
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
    // Retoma pendentes sem impedir que outros contatos entrem durante a espera de estoque.
    let raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 20, "STREAMS", streamKey, "0");
    const pendentes = streamResult.parse(raw ?? [])[0]?.[1] ?? [];
    raw = await client.xreadgroup("GROUP", agentKeys.group, agentKeys.consumer, "COUNT", 1, "STREAMS", streamKey, ">");
    const entries = [...pendentes, ...(streamResult.parse(raw ?? [])[0]?.[1] ?? [])];
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
      const message = parsed.success && config.success ? incomingMessage(parsed.data, instancia, Date.now(), true) : null;
      let result = "ignorada";
      if (message && config.success) {
        const pausada = await iaPausada(instancia, message.number, message.conversation);
        if (!pausada
          && deveAguardarResposta(config.data.agendaConsultas, message.timestamp)) return false;
        const store = messageStore(client, token, message);
        const atendimentoAtivo = async () => {
          const atual = configurarAgente(settingsDaInstancia(await dependencies.settings(), instancia), await dependencies.chatbot(instancia));
          return atual.success && JSON.stringify(atual.data) === JSON.stringify(config.data)
            && !await dependencies.apagada(instancia, message.number, message.timestamp, message.identity)
            && !await iaPausada(instancia, message.number, message.conversation) && await client.get(agentKeys.lock) === token;
        };
        result = await dependencies.apagada(instancia, message.number, message.timestamp, message.identity) ? "conversa_apagada"
          : pausada ? "pausa_manual" : await processMessage(message, config.data, {
          ...store, generate: substituicoes.generate ?? geradorFarmacia(db(), instancia, message), send: dependencies.send, transcribe: transcribeAudio,
          receberMidia: () => responderComprovanteFarmacia(db(), instancia, message),
          consultarEstoque: (termo, continuidade) => dependencies.consultarEstoque(instancia, message, termo, continuidade),
          registrarParte: async (id, texto) => {
            await followups.outgoing(instancia, id);
            await dependencies.registrarEnvio(instancia, id, texto ? { numero: message.number, texto, origem: { identidade: message.identity, instante: message.timestamp } } : undefined);
          },
          transferir: async (destino, motivo) => {
            await dependencies.transferir(instancia, message.number, destino, motivo);
            // Estoque mantém a pausa no PostgreSQL até a equipe devolver à IA.
            await pausarTransferencia(client, token, message.conversation, Date.now(), motivo !== "estoque_indisponivel");
          },
          enabled: atendimentoAtivo,
        });
        if (result === "pausada" && await iaPausada(instancia, message.number, message.conversation)) result = "pausa_manual";
        if (result === "pausada" && await dependencies.apagada(instancia, message.number, message.timestamp, message.identity)) result = "conversa_apagada";
        const state = await store.read();
        if (state?.status === "enviada" && state.providerId && !await dependencies.apagada(instancia, message.number, message.timestamp, message.identity)) {
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
      if (result === "aguardando_estoque") continue;
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
      if (await dependencies.apagada(instancia, job.number, job.started / 1000, job.identity)) { await followups.finish(job, "cancelado"); return; }
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
            && !await dependencies.apagada(instancia, job.number, job.started / 1000, job.identity)
            && configuracaoPermiteFollowup(job, currentFollowup)
            && currentFollowup.instance === config.data.EVOLUTION_INSTANCE_NAME
            && !await iaPausada(instancia, job.number, job.conversation)
            && await client.get(agentKeys.lock) === token && await client.xlen(streamKey) === 0;
        },
        send: (number, text) => dependencies.send(config.data, number, text),
        delivered: async (id, text) => {
          await followups.outgoing(config.data.EVOLUTION_INSTANCE_NAME, id);
          await dependencies.registrarEnvio(instancia, id, { numero: job.number, texto: text, origem: { identidade: job.identity, instante: job.started / 1000 } });
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
    try { await executarCampanhas(); } catch { console.error("Atende AI: falha ao processar campanhas; confira a fila."); }
    try { processed = Boolean(await runAgentTick()); }
    catch { report("falha de configuração, Redis ou processamento; nova tentativa em 5 segundos"); }
    const timer = setTimeout(() => void loop(), processed ? 100 : 5000);
    timer.unref();
  };
  void loop();
}
