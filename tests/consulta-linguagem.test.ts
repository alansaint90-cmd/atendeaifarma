import test from "node:test";
import assert from "node:assert/strict";
import { interpretarEscolha } from "../src/lib/consultas/escolha";
import { normalizarCampo } from "../src/lib/consultas/coleta";
import { pacienteSchema } from "../src/lib/consultas/schema";
import { conduzirCadastro, type CadastroConsulta, type PortaCadastroConsulta } from "../src/lib/consultas/fluxo";
import { deveAguardarResposta } from "../src/lib/agent/espera";
import { processMessage, type DeliveryState } from "../src/lib/agent/processor";
import type { AgentConfig } from "../src/lib/agent/config";

const agora = Date.parse("2026-10-13T12:00:00-03:00");
test("interpreta datas, horários e opções digitados ou ditados sem exigir barras", () => {
  for (const texto of ["quinta-feira às nove e vinte", "quinta às 9:20", "quinta às 9 e 20"]) {
    assert.deepEqual(interpretarEscolha(texto, agora), { dia: "2026-10-15", hora: "09:20" });
  }
  assert.deepEqual(interpretarEscolha("dia vinte e dois de outubro às oito horas", agora), { dia: "2026-10-22", hora: "08:00" });
  assert.deepEqual(interpretarEscolha("15 10 2026 às 11h20", agora), { dia: "2026-10-15", hora: "11:20" });
  assert.deepEqual(interpretarEscolha("15/10 às oito horas e quarenta", agora), { dia: "2026-10-15", hora: "08:40" });
  assert.deepEqual(interpretarEscolha("opção dois", agora), { opcao: 2 });
  assert.deepEqual(interpretarEscolha("2", agora), { opcao: 2 });
  assert.equal(interpretarEscolha("quinta às três da tarde", agora).hora, "15:00");
  assert.ok(interpretarEscolha("terça-feira dia 15 de outubro", agora).erro);
  assert.ok(interpretarEscolha("31 de fevereiro de 2027", agora).erro);
  assert.ok(interpretarEscolha("não quero às oito", agora).erro);
  assert.ok(interpretarEscolha("às oito ou às nove", agora).erro);
  assert.ok(interpretarEscolha("quinta da semana que vem às oito", agora).erro);
});
test("áudio transcrito percorre o cadastro real e entende nascimento por extenso", async () => {
  let cadastro: CadastroConsulta = { id: "cadastro", etapa: "dados", paciente: {}, opcoes: [] };
  let entrega: DeliveryState | null = null;
  const transcricao = "Maria Exemplo, dezessete de dezembro de mil novecentos e noventa";
  const porta: PortaCadastroConsulta = { ativo: async () => true, ler: async () => cadastro,
    salvar: async d => { cadastro = d; }, vagas: async () => [], reservar: async () => { throw new Error("Não reservar"); },
    extrair: async texto => { assert.equal(texto, transcricao); return { nomeCompleto: "Maria Exemplo", nascimento: "dezessete de dezembro de mil novecentos e noventa" }; } };
  const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "Atendimento de testes", agendaConsultas: true,
    OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "gpt-4.1-mini", EVOLUTION_API_KEY: "teste", EVOLUTION_API_URL: "https://example.com",
    EVOLUTION_INSTANCE_NAME: "teste", REDIS_URL: "redis://localhost:6379" };
  const resultado = await processMessage({ identity: "audio", conversation: "teste", number: "5511999999999", timestamp: agora / 1000, text: "", audio: { id: "audio" } }, config, {
    read: async () => entrega, write: async d => { entrega = d; }, complete: async d => { entrega = d; }, history: async () => [], enabled: async () => true,
    transcribe: async () => transcricao, cadastroConsulta: (texto, iniciar) => conduzirCadastro(porta, "audio", texto, iniciar),
    generate: async () => { throw new Error("Não delegar dados ao prompt"); }, send: async (_config, _numero, texto) => { assert.match(texto, /endereço completo/); return "envio-mock"; },
  });
  assert.equal(resultado, "enviada");
  assert.equal(cadastro.paciente.nascimento, "1990-12-17");
});
test("nascimento falado é normalizado e data impossível tem erro compreensível", () => {
  assert.equal(normalizarCampo("nascimento", "dezessete de dezembro de mil novecentos e noventa"), "1990-12-17");
  assert.equal(normalizarCampo("nascimento", "17 12 1990"), "1990-12-17");
  assert.equal(normalizarCampo("numero", "cento e vinte e três"), "123");
  const resultado = pacienteSchema.shape.nascimento.safeParse(normalizarCampo("nascimento", "trinta e um de fevereiro de mil novecentos e noventa"));
  assert.equal(resultado.success, false);
  if (!resultado.success) assert.match(resultado.error.issues[0].message, /data de nascimento válida/);
});
test("escolha não reserva antes da conferência nem troca silenciosamente a data solicitada", async () => {
  const vagas = ["2026-10-15", "2026-10-22"].map((dia, i) => ({ id: String(i), inicio: `${dia}T08:00:00-03:00`, fim: `${dia}T08:40:00-03:00`, atualizadoEm: "", disponivel: true }));
  let estado: CadastroConsulta = { id: "cadastro", etapa: "horario", paciente: {}, opcoes: vagas };
  const porta: PortaCadastroConsulta = { agora: () => agora, ativo: async () => true, ler: async () => estado,
    salvar: async d => { estado = d; }, vagas: async () => vagas,
    reservar: async () => { throw new Error("Não pode reservar nesta etapa"); } };
  for (const texto of ["quinta às 15 horas", "terça às oito", "dia 29 de outubro às oito"]) {
    await conduzirCadastro(porta, texto, texto);
    assert.equal(estado.horario, undefined);
  }
  await conduzirCadastro(porta, "escolha", "dia vinte e dois de outubro às oito horas");
  assert.equal(estado.horario?.id, "1");
  assert.equal(estado.etapa, "dados");
});
test("espera oito segundos somente quando agenda está habilitada", () => {
  assert.equal(deveAguardarResposta(true, agora / 1000, agora + 7999), true);
  assert.equal(deveAguardarResposta(true, agora / 1000, agora + 8000), false);
  assert.equal(deveAguardarResposta(false, agora / 1000, agora), false);
});
