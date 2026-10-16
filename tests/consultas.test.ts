import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { consultarHorarios, reservarConsulta, cancelarConsulta, listarConsultas } from "../src/lib/consultas/repository";
import { horariosDoDia, proximasQuintas } from "../src/lib/consultas/calendario";
import { pacienteSchema, type PacienteConsulta } from "../src/lib/consultas/schema";
import { conduzirCadastro, mensagensDaConsulta, type CadastroConsulta, type PortaCadastroConsulta } from "../src/lib/consultas/fluxo";
import { ErroDeNegocio } from "../src/lib/acao";
import { consultarResumoAgenda } from "../src/lib/consultas/resumo";

const paciente: PacienteConsulta = { nomeCompleto: "Paciente Exemplo", telefone: "+5571999999999", nascimento: "1990-02-20", cep: "41810011",
  rua: "Rua de Teste", numero: "10", complemento: "", bairro: "Bairro Teste", cidade: "Salvador", uf: "BA" };
const dia = () => proximasQuintas(Date.now() + 7 * 86400000)[0];
const contexto = () => ({ instancia: "teste", origem: "conversa-teste", identidade: randomUUID(), autor: systemUserId });

test("oferece somente vagas de quinta e entende horário com pergunta sem sair da agenda", async () => {
  for (const escolha of ["11 e 20 pode ser ?", "11h20", "às 11:20", "quero 11h20"]) {
    let estado: CadastroConsulta | null = null;
    const vagas = horariosDoDia(dia()).map(p => ({ id: randomUUID(), ...p, atualizadoEm: new Date().toISOString(), disponivel: true }));
    const porta: PortaCadastroConsulta = { ativo: async () => true, ler: async () => estado, salvar: async d => { estado = d; },
      vagas: async () => vagas, reservar: async () => { throw new Error("Não pode reservar sem cadastro"); } };
    const menu = await conduzirCadastro(porta, "inicio", "Quais horários livres?", true);
    assert.match(menu!, /quintas-feiras/);
    const mensagens = mensagensDaConsulta(menu!);
    assert.equal(mensagens.length, 3);
    assert.match(mensagens[0], /👇$/u);
    assert.match(mensagens[1], /^1\. /u);
    assert.doesNotMatch(mensagens[1], /Qual desses/);
    assert.match(mensagens[2], /^Qual desses horários você prefere\?/u);
    assert.doesNotMatch(menu!, /informe outra data|dia específico|aguarde/i);
    assert.equal(await conduzirCadastro(porta, "preco", "Quanto custa?"), null);
    assert.match((await conduzirCadastro(porta, "escolha", escolha))!, /nome completo/);
    const salvo = await porta.ler(); assert.equal(salvo?.horario?.id, vagas[5].id);
  }
});

test("agenda gera seis horários de quinta, incluindo consulta que começa às 11h20", () => {
  const horarios = horariosDoDia(dia());
  assert.equal(horarios.length, 6);
  assert.deepEqual(horarios.map(h => h.inicio.slice(11,16)), ["11:00","11:40","12:20","13:00","13:40","14:20"]);
  assert.ok(horarios.every(h => Date.parse(h.fim) - Date.parse(h.inicio) === 2400000));
  assert.throws(() => horariosDoDia("2026-10-13", Date.parse("2026-10-12T00:00:00Z")), /quintas/);
  assert.deepEqual(horariosDoDia("2026-10-15", Date.parse("2026-10-15T18:00:00Z")), [], "quinta à tarde segue para a próxima semana");
});
test("cadastro exige todos os dados e não aceita data impossível, futura ou CEP incompleto", () => {
  for (const campo of ["nomeCompleto","nascimento","rua","numero","bairro","cidade"] as const) {
    assert.equal(pacienteSchema.safeParse({ ...paciente, [campo]: "" }).success, false, campo);
  }
  for (const nascimento of ["2026-02-30", "2999-01-01"]) assert.equal(pacienteSchema.safeParse({ ...paciente, nascimento }).success, false);
  assert.equal(pacienteSchema.safeParse({ ...paciente, nomeCompleto: "Nome" }).success, false);
  assert.equal(pacienteSchema.safeParse({ ...paciente, cep: "123" }).success, false);
  assert.equal(pacienteSchema.safeParse({ ...paciente, telefone: "", cep: "", uf: "" }).success, true);
  assert.equal(pacienteSchema.parse({ ...paciente, telefone: undefined, cep: undefined }).telefone, "");
});
test("reserva persiste paciente, bloqueia duplicidade entre chips, audita e cancela com trava", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const vagas = await consultarHorarios(banco, dia()); assert.equal(vagas.length, 6);
    assert.equal((await consultarHorarios(banco, dia())).length, 6);
    const pedido = { horarioId: vagas[0].id, paciente, dadosConferidos: true };
    for (const campo of ["nomeCompleto", "nascimento", "rua", "bairro"] as const) {
      await assert.rejects(reservarConsulta(banco, { ...pedido, paciente: { ...paciente, [campo]: "" } }, contexto()));
    }
    await assert.rejects(reservarConsulta(banco, { ...pedido, dadosConferidos: false }, contexto()));
    const origem = contexto(); const reserva = await reservarConsulta(banco, pedido, origem);
    const referencia = Date.parse(`${dia()}T07:00:00-03:00`);
    const resumo = await consultarResumoAgenda(banco, referencia);
    assert.equal(resumo.confirmadas, 1); assert.equal(resumo.livres.length, 5);
    assert.deepEqual(resumo.proximas, [{ id: reserva.id, nome: paciente.nomeCompleto, inicio: vagas[0].inicio }]);
    assert.equal(resumo.livres.includes(vagas[0].inicio), false);
    assert.equal(reserva.nomeCompleto, paciente.nomeCompleto);
    assert.equal((await reservarConsulta(banco, pedido, origem)).id, reserva.id, "repetição não cria outra consulta");
    await assert.rejects(reservarConsulta(banco, pedido, { ...contexto(), instancia: "segundo-chip" }), /ocupado/);
    const livres = (await consultarHorarios(banco, dia())).filter(v => v.disponivel);
    assert.equal(livres.length, 5); assert.equal(livres[0].id, vagas[1].id);
    const disputa = await Promise.allSettled([reservarConsulta(banco, { ...pedido, horarioId: vagas[2].id }, contexto()),
      reservarConsulta(banco, { ...pedido, horarioId: vagas[2].id }, { ...contexto(), instancia: "chip-b" })]);
    assert.equal(disputa.filter(r => r.status === "fulfilled").length, 1);
    const log = await cliente.query<{ action: string; changed_fields: string[] }>("SELECT action,changed_fields FROM atendeia_audit_logs WHERE entity_id=$1", [reserva.id]);
    assert.equal(log.rows[0].action, "consulta_confirmada"); assert.deepEqual(log.rows[0].changed_fields, []);
    await assert.rejects(cancelarConsulta(banco, { id: reserva.id, atualizadoEm: new Date(0).toISOString() }, systemUserId), /alterada/);
    await cancelarConsulta(banco, { id: reserva.id, atualizadoEm: reserva.atualizadoEm }, systemUserId);
    assert.equal((await consultarHorarios(banco, dia()))[0].disponivel, true);
    assert.equal((await listarConsultas(banco, dia()))[0].status, "cancelada");
    const aposCancelar = await consultarResumoAgenda(banco, referencia);
    assert.equal(aposCancelar.confirmadas, 1, "a reserva disputada permanece; a cancelada não conta");
    assert.equal(aposCancelar.livres.includes(vagas[0].inicio), true);
    assert.equal(aposCancelar.proximas.some(c => c.id === reserva.id), false);
    const tarde = await consultarResumoAgenda(banco, Date.parse(`${dia()}T12:00:00-03:00`));
    assert.notEqual(tarde.dia, dia()); assert.equal(tarde.livres.length, 6);
    await reservarConsulta(banco, pedido, contexto());
    assert.equal((await listarConsultas(banco, dia())).length, 3);
    const semOpcionais = await reservarConsulta(banco, { ...pedido, horarioId: vagas[5].id, paciente: { ...paciente, telefone: "", cep: "", uf: "" } }, contexto());
    assert.equal(semOpcionais.telefone, ""); assert.equal(semOpcionais.cep, "");
  } finally { await cliente.close(); }
});
test("WhatsApp coleta além do histórico curto e só reserva após conferência explícita", async () => {
  let estado: CadastroConsulta | null = null; let reservas = 0; let ativo = true;
  const periodo = horariosDoDia(dia())[0];
  const vaga = { id: randomUUID(), ...periodo, atualizadoEm: new Date().toISOString(), disponivel: true };
  const porta: PortaCadastroConsulta = { ler: async () => estado, salvar: async d => { estado = structuredClone(d); }, ativo: async () => ativo,
    extrair: async (texto, campos) => { assert.ok(!campos.includes("uf")); return texto === "identificação" ? { nomeCompleto: paciente.nomeCompleto, nascimento: "20/02/1990" }
      : { rua: paciente.rua, numero: paciente.numero, bairro: paciente.bairro, cidade: paciente.cidade, complemento: "perto da praça" }; },
    vagas: async () => [vaga], reservar: async (dados, identidade) => { reservas++; assert.equal(dados.dadosConferidos, true);
      assert.equal(dados.paciente.telefone, ""); assert.equal(dados.paciente.cep, "");
      assert.equal(dados.paciente.uf, "");
      return { ...dados.paciente, id: identidade, horarioId: vaga.id, instancia: "teste", ...periodo, atualizadoEm: new Date().toISOString(), status: "confirmada" }; } };
  assert.match((await conduzirCadastro(porta, "inicio", "Quero agendar", true))!, /nome completo.*nascimento/);
  const entradas = ["identificação", "endereço", "Salvador", "1"];
  for (let i = 0; i < entradas.length; i++) {
    const resposta = await conduzirCadastro(porta, `dado-${i}`, entradas[i]);
    assert.equal(await conduzirCadastro(porta, `dado-${i}`, entradas[i]), resposta, "evento repetido não avança campo");
    assert.equal(reservas, 0);
    if (i === 0) { assert.match(resposta!, /endereço completo/); assert.doesNotMatch(resposta!, /UF|estado/); }
    if (i === 1) assert.match(resposta!, /Salvador ou em Camaçari/);
    if (i === 2) assert.match(resposta!, /horários livres/);
    if (i === 3) {
      const partes = mensagensDaConsulta(resposta!);
      assert.equal(partes.length, 3);
      assert.equal(partes[0], "Confira os dados antes de agendar.");
      assert.match(partes[1], /^Nome: Paciente Exemplo\nData de nascimento: 20\/02\/1990/);
      assert.match(partes[1], /Endereço:.*\nData da consulta em Salvador:/);
      assert.doesNotMatch(partes[1], /Telefone:|CEP|Confirma pra gente/);
      assert.match(partes[2], /^Os dados e o horário estão corretos\? Confirma pra gente concluir o nosso agendamento\?/);
    }
  }
  assert.match((await conduzirCadastro(porta, "duvida", "já agendou?")) ?? "fora do cadastro", /fora do cadastro/);
  ativo = false; await assert.rejects(conduzirCadastro(porta, "pausa", "confirmo")); assert.equal(reservas, 0);
  ativo = true;
  assert.match((await conduzirCadastro(porta, "ressalva", "sim, mas o endereço está errado"))!, /Confira os dados/);
  assert.equal(reservas, 0);
  const confirmacao = (await conduzirCadastro(porta, "confirmacao", "Sim, está tudo certo."))!;
  assert.match(confirmacao, /^Consulta confirmada:\nDia: \d{2}\/\d{2}\/\d{4}\nHorário: 08:00 \(horário de Brasília\)\nNome do paciente: Paciente Exemplo\nProtocolo:/);
  assert.match(confirmacao, /O seu cadastro foi registrado em nosso sistema\./);
  assert.equal(mensagensDaConsulta(confirmacao).length, 2);
  assert.equal(mensagensDaConsulta(confirmacao)[1], "Chegue 20 minutos antes para fazer o cadastro presencial e agilizar seu atendimento.");
  await conduzirCadastro(porta, "confirmacao", "confirmo"); assert.equal(reservas, 1);
});
test("vaga ocupada durante o cadastro oferece próxima vaga e exige nova concordância", async () => {
  const vagas = horariosDoDia(dia()).slice(0,2).map(p => ({ id: randomUUID(), ...p, atualizadoEm: new Date().toISOString(), disponivel: true }));
  let estado: CadastroConsulta = { id: randomUUID(), etapa: "conferencia", opcoes: vagas, horario: vagas[0], paciente };
  let tentativas = 0;
  const porta: PortaCadastroConsulta = { ativo: async () => true, ler: async () => structuredClone(estado), salvar: async d => { estado = d; },
    vagas: async () => [vagas[1]], reservar: async dados => {
      tentativas++; if (dados.horarioId === vagas[0].id) throw new ErroDeNegocio("Horário ocupado.");
      return { ...paciente, id: randomUUID(), horarioId: vagas[1].id, instancia: "teste", inicio: vagas[1].inicio, fim: vagas[1].fim, atualizadoEm: new Date().toISOString(), status: "confirmada" };
    } };
  const resposta = await conduzirCadastro(porta, "confirmacao-1", "confirmo");
  assert.match(resposta!, /ocupado/); assert.doesNotMatch(resposta!, /Consulta confirmada/);
  assert.equal(estado.paciente.nomeCompleto, paciente.nomeCompleto);
  assert.match((await conduzirCadastro(porta, "nova-opcao", "1"))!, /Confira os dados/);
  assert.equal(tentativas, 1);
  assert.match((await conduzirCadastro(porta, "confirmacao-2", "confirmo"))!, /Consulta confirmada/);
  assert.equal(tentativas, 2);
});
