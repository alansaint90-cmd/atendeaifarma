import { z } from "zod";

export const periodoFarmaciaSchema = z.strictObject({ inicio: z.iso.date(), fim: z.iso.date() })
  .refine(v => v.inicio <= v.fim && (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000 < 366,
    "Escolha um período válido de até 366 dias.");
export type PeriodoFarmacia = z.infer<typeof periodoFarmaciaSchema>;
export type AtalhoPeriodo = "hoje" | "ontem" | "7dias" | "15dias" | "30dias";
export function periodoFarmacia(atalho: AtalhoPeriodo, agora = new Date()): PeriodoFarmacia {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const parte = (tipo: string) => partes.find(p => p.type === tipo)!.value;
  const fim = new Date(`${parte("year")}-${parte("month")}-${parte("day")}T00:00:00Z`);
  if (atalho === "ontem") fim.setUTCDate(fim.getUTCDate() - 1);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - (atalho === "7dias" ? 6 : atalho === "15dias" ? 14 : atalho === "30dias" ? 29 : 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}
