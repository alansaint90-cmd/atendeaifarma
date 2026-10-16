import { z } from "zod";

const texto = (rotulo: string, max = 150) => z.string().trim().min(1, `Informe ${rotulo}.`).max(max).regex(/^[^<>\x00-\x1f]+$/u, `${rotulo}: remova caracteres inválidos.`);
export const pacienteSchema = z.strictObject({
  nomeCompleto: texto("o nome completo").regex(/^\p{L}[\p{L}'’.-]*(?:\s+[\p{L}'’.-]+)+$/u, "Informe nome e sobrenome do paciente."),
  telefone: z.string().trim().regex(/^$|^\+[1-9]\d{6,14}$/, "Informe telefone com DDI e DDD ou deixe em branco.").default(""),
  nascimento: z.iso.date({ error: "Informe uma data de nascimento válida, com dia, mês e ano." }).refine(valor => valor <= new Date().toISOString().slice(0, 10) && valor >= "1900-01-01", "Informe uma data de nascimento válida, sem data futura.")
    .refine(valor => {
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const limite = `${Number(hoje.slice(0,4)) - 5}${hoje.slice(4)}`;
      return valor <= limite;
    }, "O atendimento é a partir de 5 anos. Para menores, solicite orientação à equipe."),
  cep: z.string().trim().regex(/^$|^\d{8}$/, "Informe um CEP com oito dígitos ou deixe em branco.").default(""),
  rua: texto("a rua"), numero: texto("o número ou s/n", 20), complemento: z.string().trim().max(100),
  bairro: texto("o bairro"), cidade: texto("a cidade"), uf: z.enum(["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"], { error: "Estado inválido." }).default(""),
});
export type PacienteConsulta = z.infer<typeof pacienteSchema>;
export const instanciaConsultaSchema = texto("a instância", 100);
export const identidadeConsultaSchema = z.strictObject({ id: z.uuid(), atualizadoEm: z.iso.datetime({ offset: true }) });
export const reservaConsultaSchema = z.strictObject({ horarioId: z.uuid(), paciente: pacienteSchema, dadosConferidos: z.literal(true, { error: "Confira os dados antes de confirmar a consulta." }) });
export interface HorarioConsulta { id: string; inicio: string; fim: string; atualizadoEm: string; disponivel: boolean }
export interface Consulta extends PacienteConsulta { id: string; horarioId: string; instancia: string; inicio: string; fim: string; atualizadoEm: string; status: "confirmada" | "cancelada" }
export const formatarConsulta = (inicio: string) => new Date(inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
