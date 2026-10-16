import type { FollowupConfig } from "./schema";
import { inWindow, nextDue } from "./schedule";

export interface FollowupJob {
  instance?: string; // Ausente apenas nos ciclos anteriores ao suporte a dois números.
  conversation: string; identity: string; number: string; started: number;
  index: number; due: number; revision: string; status: "aguardando" | "enviando";
}
export interface FollowupPort {
  save(job: FollowupJob): Promise<void>;
  finish(result: string): Promise<void>;
  enabled(): Promise<boolean>;
  send(number: string, text: string): Promise<string>;
  delivered(id: string, text: string): Promise<void>;
}
export function configuracaoPermiteFollowup(job: FollowupJob, config: FollowupConfig) {
  return config.enabled && job.revision === config.revision && (!job.instance || job.instance === config.instance);
}
export async function processFollowup(job: FollowupJob, config: FollowupConfig, port: FollowupPort, now = Date.now()) {
  if (!configuracaoPermiteFollowup(job, config)) { await port.finish("cancelado"); return; }
  if (job.status === "enviando") { await port.finish("incerto"); return; }
  if (job.due > now) return;
  if (!inWindow(config, now)) {
    // Reaplicar somente a janela, sem somar novamente o intervalo da mensagem.
    let due = now;
    while (!inWindow(config, due)) due += 60000;
    await port.save({ ...job, due }); return;
  }
  if (!await port.enabled()) return;
  await port.save({ ...job, status: "enviando" });
  const text = config.steps[job.index].text;
  try {
    const id = await port.send(job.number, text);
    await port.delivered(id, text);
  } catch { await port.finish("incerto"); return; }
  const index = config.steps.findIndex((step, i) => i > job.index && step.enabled);
  if (index < 0) await port.finish("concluido");
  else await port.save({ ...job, index, due: nextDue(config, Date.now(), index), status: "aguardando" });
}
