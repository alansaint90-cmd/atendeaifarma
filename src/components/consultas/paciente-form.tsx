"use client";
import type { PacienteConsulta } from "@/lib/consultas/schema";

export const pacienteVazio: PacienteConsulta = { nomeCompleto: "", telefone: "", nascimento: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };
interface PacienteFormProps { paciente: PacienteConsulta; aoAlterar: (dados: PacienteConsulta) => void; ocupado: boolean }
export function PacienteForm({ paciente, aoAlterar, ocupado }: PacienteFormProps) {
  const campos: { chave: keyof PacienteConsulta; nome: string; tipo?: string; max: number; dica?: string }[] = [
    { chave: "nomeCompleto", nome: "Nome completo do paciente", max: 150 },
    { chave: "telefone", nome: "Telefone para contato (opcional)", tipo: "tel", max: 16, dica: "Com DDI e DDD: +5571999999999" },
    { chave: "nascimento", nome: "Data de nascimento", tipo: "date", max: 10 },
    { chave: "cep", nome: "CEP (opcional)", max: 8, dica: "Oito dígitos, sem hífen." },
    { chave: "rua", nome: "Rua ou avenida", max: 150 }, { chave: "numero", nome: "Número", max: 20, dica: "Informe s/n quando não houver número." },
    { chave: "complemento", nome: "Complemento / ponto de referência (opcional)", max: 100 }, { chave: "bairro", nome: "Bairro", max: 150 },
    { chave: "cidade", nome: "Cidade", max: 150 },
  ];
  return <fieldset disabled={ocupado}><legend>Dados do paciente</legend><div className="feature-filters">
    {campos.map(c => <label key={c.chave}>{c.nome}<input name={c.chave} type={c.tipo ?? "text"} required={!["complemento", "telefone", "cep"].includes(c.chave)}
      maxLength={c.max} max={c.chave === "nascimento" ? new Date().toISOString().slice(0,10) : undefined}
      value={paciente[c.chave]} onChange={e => aoAlterar({ ...paciente, [c.chave]: c.chave === "uf" ? e.target.value.toUpperCase() : e.target.value })} />
      {c.dica && <small>{c.dica}</small>}</label>)}
  </div></fieldset>;
}
