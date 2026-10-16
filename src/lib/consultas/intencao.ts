import type { Turn } from "../agent/providers";
import { interpretarEscolha } from "./escolha";

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const foraDaAgenda = /camacari|semerge|remarcar|reagendar|cancelar|desmarcar|nao (?:quero|preciso)|falta de ar|dor no peito|urgencia|socorro|sintoma|atendente|humano|recepcao/;

export function horaInformada(texto: string): string | null {
  return interpretarEscolha(texto).hora ?? null;
}

export function deveConsultarAgenda(texto: string, historico: Turn[]): boolean {
  const entrada = normalizar(texto);
  if (foraDaAgenda.test(entrada)) return false;
  const ultimaFala = normalizar(historico.findLast(t => t.role === "assistant")?.content ?? "");
  const ultimoPedido = normalizar(historico.findLast(t => t.role === "user")?.content ?? "");
  if (/camacari|semerge/.test(ultimoPedido) && !/salvador|bonvida|bom vida/.test(entrada)) return false;
  const pedidoDireto = /\b(?:agendar|marcar)\b/.test(entrada)
    || /\b(?:quero|gostaria|preciso).*(?:horario|vaga)/.test(entrada)
    || /(?:horario|vaga)s?.*(?:livre|disponivel)|(?:tem|quais|qual|consultar|verificar).*(?:horario|vaga)|(?:horario|vaga).*quinta/.test(entrada);
  const continuacao = /horario|vaga|agend/.test(ultimaFala)
    && (/^(?:sim|pode|pode sim|quero|pode verificar|pode consultar|por favor)[.!]*$/.test(entrada) || horaInformada(entrada) !== null || Boolean(interpretarEscolha(entrada).dia));
  return pedidoDireto || continuacao;
}
