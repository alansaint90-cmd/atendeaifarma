import { z } from "zod";
import { ErroDeNegocio } from "../acao";

export const HORARIOS_CONSULTA = ["08:00", "08:40", "09:20", "10:00", "10:40", "11:20"] as const;
export const dataConsultaSchema = z.iso.date();
export function horariosDoDia(entrada: unknown, agora = Date.now()) {
  const dia = dataConsultaSchema.parse(entrada);
  const meioDia = new Date(`${dia}T12:00:00-03:00`);
  if (meioDia.getUTCDay() !== 4) throw new ErroDeNegocio("As consultas acontecem às quintas-feiras.");
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  if (dia < hoje || meioDia.getTime() > agora + 180 * 86400000) throw new ErroDeNegocio("Escolha uma quinta-feira nos próximos 180 dias.");
  return HORARIOS_CONSULTA.map(hora => {
    const inicio = new Date(`${dia}T${hora}:00-03:00`);
    return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 40 * 60000).toISOString() };
  }).filter(h => Date.parse(h.inicio) > agora);
}
export function proximasQuintas(agora = Date.now(), quantidade = 8) {
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const data = new Date(`${hoje}T12:00:00-03:00`);
  data.setUTCDate(data.getUTCDate() + (4 - data.getUTCDay() + 7) % 7);
  return Array.from({ length: quantidade }, (_, indice) => new Date(data.getTime() + indice * 7 * 86400000).toISOString().slice(0, 10));
}
