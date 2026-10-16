import type { FollowupConfig } from "./schema";
import { delayMs } from "./schema";
const formatters = new Map<string, Intl.DateTimeFormat>();

export function inWindow(config: FollowupConfig, timestamp: number) {
  let formatter = formatters.get(config.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, weekday: "short", hour: "numeric", hourCycle: "h23" });
    formatters.set(config.timezone, formatter);
  }
  const parts = formatter.formatToParts(timestamp);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find(item => item.type === "weekday")!.value);
  const hour = Number(parts.find(item => item.type === "hour")!.value);
  return config.days.includes(day) && hour >= config.startHour && hour < config.endHour;
}
export function nextDue(config: FollowupConfig, after: number, stepIndex: number) {
  let due = after + delayMs(config.steps[stepIndex]);
  // Buscar a próxima janela em minutos; cobre mudança de dia, semana e fuso.
  for (let minutes = 0; minutes <= 8 * 24 * 60; minutes++, due += 60000) {
    if (inWindow(config, due)) return due;
  }
  throw new Error("Não foi possível calcular a janela de envio.");
}
