import { z } from "zod";
import { meses, numerosDaFala } from "./linguagem";

const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
export function interpretarEscolha(texto: string, agora = Date.now()): { dia?: string; hora?: string; opcao?: number; erro?: string } {
  let entrada = numerosDaFala(texto).replace(/\bmeia\b/gu, "30");
  if (/\b(?:nao|ou|nem)\b/u.test(entrada)) return { erro: "Qual é a única data e horário que você deseja escolher?" };
  if (/semana que vem|semana seguinte|outra semana|amanha|hoje|depois/u.test(entrada)) return { erro: "Para conferir essa escolha, informe o dia e o mês desejados. Pode falar por extenso." };
  const opcao = entrada.match(/^(?:(?:quero|prefiro|pode ser)\s+)?(?:a\s+)?(?:opcao\s+|numero\s+)?([1-6])[.!]?$/u);
  if (opcao) return { opcao: Number(opcao[1]) };
  const hoje = new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  let dia: string | undefined;
  entrada = entrada.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/u, "$3/$2/$1");
  const data = entrada.match(/\b(\d{1,2})(?:\s*[/.-]\s*|\s+)(\d{1,2})(?:\s*[/.-]\s*|\s+)(\d{4})\b/u)
    ?? entrada.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/u);
  const extensa = entrada.match(new RegExp(`\\b(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${meses.join("|")})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, "u"));
  const diaSolto = entrada.match(/\bdia\s+(\d{1,2})\b/u);
  if (data || extensa || diaSolto) {
    const numero = (data ?? extensa ?? diaSolto)![1];
    const mes = data ? Number(data[2]) : extensa ? meses.indexOf(extensa[2]) + 1 : Number(hoje.slice(5, 7));
    const anoInformado = data?.[3] ?? extensa?.[3];
    dia = `${anoInformado ?? ano}-${String(mes).padStart(2, "0")}-${numero.padStart(2, "0")}`;
    if (!anoInformado && dia < hoje) return { erro: "Essa data já passou. Informe o mês e o ano desejados para eu conferir a agenda." };
    if (!z.iso.date().safeParse(dia).success) return { erro: "Não reconheci uma data válida. Pode informar o dia, o mês e o ano, inclusive por extenso?" };
    entrada = entrada.replace((data ?? extensa ?? diaSolto)![0], " ");
  }
  const semana = entrada.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?\b/u);
  if ([...entrada.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/gu)].length > 1) return { erro: "Você mencionou mais de um dia da semana. Qual deles deseja consultar?" };
  if (semana) {
    const indice = dias.indexOf(semana[1]);
    if (dia && new Date(`${dia}T12:00:00-03:00`).getUTCDay() !== indice) return { erro: "O dia da semana e a data informados não coincidem. Qual data você deseja?" };
    if (!dia) {
      const base = new Date(`${hoje}T12:00:00-03:00`);
      base.setUTCDate(base.getUTCDate() + (indice - base.getUTCDay() + 7) % 7);
      dia = base.toISOString().slice(0, 10);
    }
    entrada = entrada.replace(semana[0], " ");
  }
  entrada = entrada.replace(/(\d)\s+horas\s+e\s+/gu, "$1:");
  const horario = entrada.match(/(?:\bas\s+|\bdas\s+|^\s*|\b(?:quero|prefiro|pode ser)\s+)(\d{1,2})(?:\s*(?:h|:|e|\s)\s*(\d{1,2}))?\s*(?:horas|h)?(?:\s*(?:da|de)\s+(manha|tarde|noite))?/u);
  let hora: string | undefined;
  if (horario) {
    if (/\d/u.test(entrada.replace(horario[0], ""))) return { erro: "Encontrei mais de um número no horário. Qual horário você deseja escolher?" };
    let h = Number(horario[1]); const m = Number(horario[2] ?? 0);
    if (/tarde|noite/u.test(horario[3] ?? "") && h < 12) h += 12;
    if (h > 23 || m > 59) return { erro: "Não reconheci esse horário. Informe a hora e os minutos desejados." };
    hora = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return { dia, hora };
}
