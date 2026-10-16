import { pacienteSchema, type PacienteConsulta } from "./schema";
import { dataNumerica, numerosDaFala } from "./linguagem";

export type CampoPaciente = keyof PacienteConsulta;
const identificacao = ["nomeCompleto", "nascimento"] as const;
const endereco = ["rua", "numero", "bairro", "cidade"] as const;
export const perguntaIdentificacao = "Qual é o nome completo do paciente? Informe também a data de nascimento, com dia, mês e ano.";
export const perguntaEndereco = "Qual é o endereço completo do paciente? Informe rua, bairro, número, cidade, e um ponto de referência, se houver.";
export const perguntaLocal = "Você gostaria de agendar uma consulta em Salvador ou em Camaçari?";
const rotulos: Record<CampoPaciente, string> = { nomeCompleto: "nome completo", nascimento: "data de nascimento (dia, mês e ano)",
  rua: "rua", numero: "número ou s/n", bairro: "bairro", cidade: "cidade do endereço", uf: "UF", complemento: "ponto de referência",
  telefone: "telefone", cep: "CEP" };
export function camposPendentes(paciente: Partial<PacienteConsulta>): CampoPaciente[] {
  const falta = (campos: readonly CampoPaciente[]) => campos.filter(c => !pacienteSchema.shape[c].safeParse(paciente[c]).success);
  const pessoal = falta(identificacao);
  return pessoal.length ? pessoal : falta(endereco);
}
export function perguntaDados(paciente: Partial<PacienteConsulta>) {
  const pendentes = camposPendentes(paciente);
  if (pendentes.length === identificacao.length && pendentes[0] === "nomeCompleto") return perguntaIdentificacao;
  if (pendentes.length === endereco.length && pendentes[0] === "rua") return perguntaEndereco;
  return `Para completar o cadastro, informe: ${pendentes.map(c => rotulos[c]).join(", ")}.`;
}
export function normalizarCampo(campo: CampoPaciente, texto: string) {
  if (campo === "telefone") {
    const numeros = texto.replace(/[\s()+.-]/g, "");
    return /^(?:\d{10}|\d{11})$/.test(numeros) && !texto.startsWith("+") ? `+55${numeros}` : `+${numeros}`;
  }
  if (campo === "cep") return texto.replace(/[\s.-]/g, "");
  if (campo === "nascimento") return dataNumerica(texto);
  if (campo === "numero") return numerosDaFala(texto);
  if (campo === "uf") return texto.toUpperCase();
  return texto;
}
