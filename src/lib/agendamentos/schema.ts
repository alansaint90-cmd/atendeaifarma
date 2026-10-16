import { z } from "zod";

export const agendamentoSchema = z.strictObject({
  id: z.uuid(),
  telefone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Informe o telefone com +, código do país e DDD, somente números."),
  instancia: z.string().trim().min(1, "Selecione o chip.").max(100),
  mensagem: z.string().trim().min(1, "Escreva a mensagem.").max(6000, "Use até 6.000 caracteres."),
  agendadoPara: z.iso.datetime({ offset: true }),
});
export const identidadeAgendamento = z.strictObject({ id: z.uuid(), version: z.number().int().min(0) });
export const statusAgendamento = { pendente: "Pendente", enviando: "Enviando", enviado: "Enviado", cancelado: "Cancelado", incerto: "Envio incerto", erro: "Erro" } as const;
export type DadosAgendamento = z.infer<typeof agendamentoSchema>;
export interface Agendamento extends DadosAgendamento {
  version: number; status: keyof typeof statusAgendamento; codigoErro: string | null; enviadoEm: string | null;
}
export function validarData(iso: string, agora = Date.now()) {
  const horario = Date.parse(iso);
  return horario >= agora + 60000 && horario <= agora + 365 * 86400000;
}
