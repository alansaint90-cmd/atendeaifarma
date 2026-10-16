import test from "node:test";
import assert from "node:assert/strict";
import { extrairCamposCadastro } from "../src/lib/consultas/extracao";
import { normalizarCampo } from "../src/lib/consultas/coleta";
import { conduzirCadastro, type CadastroConsulta, type PortaCadastroConsulta } from "../src/lib/consultas/fluxo";
import type { AgentConfig } from "../src/lib/agent/config";

const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "Teste", OPENAI_API_KEY: "sk-test-only",
  OPENAI_MODEL: "gpt-4.1-mini", EVOLUTION_API_KEY: "teste", EVOLUTION_API_URL: "https://example.com",
  EVOLUTION_INSTANCE_NAME: "teste", REDIS_URL: "redis://localhost:6379" };
test("extração estruturada aceita trechos literais e descarta dados inventados", async () => {
  const resultado = await extrairCamposCadastro(config, "Maria Exemplo, 20/02/1990", ["nomeCompleto", "nascimento", "telefone"], async (_url, opcoes) => {
    const corpo = JSON.parse(String(opcoes?.body));
    assert.equal(corpo.store, false); assert.equal(corpo.tools[0].strict, true);
    assert.equal(corpo.tool_choice.name, "extrair_dados_paciente");
    return Response.json({ status: "completed", output: [{ type: "function_call", name: "extrair_dados_paciente",
      arguments: JSON.stringify({ nomeCompleto: "Maria Exemplo", nascimento: "20/02/1990", telefone: "+5571999999999" }) }] });
  });
  assert.deepEqual(resultado, { nomeCompleto: "Maria Exemplo", nascimento: "20/02/1990" });
  assert.equal(normalizarCampo("nascimento", "20 de fevereiro de 1990"), "1990-02-20");
  await assert.rejects(extrairCamposCadastro(config, "teste", ["nomeCompleto"], async () => Response.json({ status: "incomplete" })));
});
test("respostas parciais preservam campos e Camaçari não consulta nem reserva Salvador", async () => {
  let estado: CadastroConsulta | null = null;
  const porta: PortaCadastroConsulta = { ativo: async () => true, ler: async () => estado, salvar: async d => { estado = d; },
    vagas: async () => { throw new Error("Não consultar Salvador"); }, reservar: async () => { throw new Error("Não reservar Salvador"); },
    extrair: async texto => texto === "nome" ? { nomeCompleto: "Maria Exemplo" }
      : texto === "data inválida" ? { nascimento: "31/02/1990" }
      : texto === "data" ? { nascimento: "20/02/1990" }
      : { rua: "Rua Exemplo", numero: "10", bairro: "Centro", cidade: "Camaçari", uf: "BA" } };
  await conduzirCadastro(porta, "1", "Quero agendar", true);
  const parcial = await conduzirCadastro(porta, "2", "nome");
  assert.match(parcial!, /nascimento/); assert.doesNotMatch(parcial!, /nome completo/);
  await conduzirCadastro(porta, "3", "data inválida");
  assert.equal((await porta.ler())?.paciente.nascimento, undefined);
  assert.match((await conduzirCadastro(porta, "4", "data"))!, /endereço completo/);
  assert.match((await conduzirCadastro(porta, "5", "endereço"))!, /Salvador ou em Camaçari/);
  assert.equal((await porta.ler())?.paciente.cidade, "Camaçari", "cidade residencial não escolhe a clínica");
  assert.match((await conduzirCadastro(porta, "6", "Camaçari"))!, /3621-4575/);
  assert.equal((await porta.ler())?.etapa, "encerrado");
  assert.deepEqual((await porta.ler())?.paciente, {});
});
