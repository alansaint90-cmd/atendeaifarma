import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { receberOperacao } from "../src/lib/operacao/receber";
import { registrarEnvioIa } from "../src/lib/operacao/atribuir-ia";
import { consultarPainel } from "../src/lib/operacao/painel";
import type { BancoSql } from "../src/lib/db/porta";
import type { EvolutionEvent } from "../src/lib/evolution/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

function evento(instancia: string, id: string, saida: boolean, telefone: string): EvolutionEvent {
  return { event: "messages.upsert", instance: instancia, data: {
    key: { id, fromMe: saida, remoteJid: `${telefone}@s.whatsapp.net` },
    pushName: "Contato real de teste", messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: saida ? "Resposta" : "Olá" },
  } };
}
function filtro(canalId: string | null = null) {
  return { inicio: new Date(Date.now() - 86400000).toISOString(), fim: new Date(Date.now() + 86400000).toISOString(), fuso: "UTC", canalId };
}

test("parâmetros de data do painel são strings compatíveis com postgres-js", async () => {
  const dialect = new PgDialect();
  let consultas = 0;
  let instantes = 0;
  const banco = { transaction: async (trabalho: (tx: { execute: (consulta: SQL) => Promise<unknown> }) => Promise<unknown>) =>
    trabalho({ execute: async consulta => {
      const { params } = dialect.sqlToQuery(consulta);
      for (const parametro of params) {
        assert.ok(!(parametro instanceof Date), "SQL cru não deve enviar Date ao driver");
        if (typeof parametro === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(parametro)) instantes++;
      }
      consultas++;
      if (consultas === 3) return [{ abertas: 0, pendentes: 0, ia: 0, humano: 0 }];
      if (consultas === 4) return [{ novas: 0, ia: 0, humano: 0 }];
      return [];
    } }) } as unknown as BancoSql;
  await consultarPainel(banco, filtro());
  assert.ok(instantes >= 10, "período, gráfico e contatos devem usar datas serializadas");
});

test("painel filtra período e canal sem atribuir envio genérico à IA ou humano", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    await receberOperacao(banco, evento("chip-a", "entrada-a", false, "5571999999999"));
    await receberOperacao(banco, evento("chip-a", "saida-sem-autoria", true, "5571999999999"));
    let painel = await consultarPainel(banco, filtro());
    assert.equal(painel.novas, 1);
    assert.equal(painel.atendimentoIa, 0);
    assert.equal(painel.atendimentoHumano, 0);
    await registrarEnvioIa(banco, "chip-a", "saida-ia-antes");
    await receberOperacao(banco, evento("chip-a", "saida-ia-antes", true, "5571999999999"));
    await receberOperacao(banco, evento("chip-a", "saida-ia-depois", true, "5571999999999"));
    await registrarEnvioIa(banco, "chip-a", "saida-ia-depois");
    painel = await consultarPainel(banco, filtro());
    assert.equal(painel.atendimentoIa, 1);
    assert.equal(painel.atendidasIa, 1);
    assert.equal(painel.atendimentoHumano, 0);
    assert.equal(painel.evolucao.reduce((soma, dia) => soma + dia.ia, 0), 1);
    await cliente.query("UPDATE atendeia_messages SET sender_type='agent',version=version+1,updated_at=now() WHERE provider_message_id='saida-sem-autoria'");
    painel = await consultarPainel(banco, filtro());
    assert.equal(painel.atendimentoHumano, 1);
    assert.equal(painel.atendidasHumano, 1);
    assert.equal(painel.totalAtendidas, 1, "a mesma conversa atendida por IA e humano conta uma vez no denominador");
    await receberOperacao(banco, evento("chip-b", "entrada-b", false, "5571888888888"));
    const canalA = painel.canais.find(canal => canal.nome === "chip-a")?.id;
    assert.ok(canalA);
    painel = await consultarPainel(banco, filtro(canalA));
    assert.equal(painel.novas, 1);
    assert.equal(painel.atendidasIa, 1);
    assert.equal(painel.contatos.length, 1);
    const passado = { inicio: new Date(Date.now() - 3 * 86400000).toISOString(),
      fim: new Date(Date.now() - 2 * 86400000).toISOString(), fuso: "UTC", canalId: canalA };
    assert.equal((await consultarPainel(banco, passado)).novas, 0);
    await assert.rejects(consultarPainel(banco, { ...filtro(), inicio: filtro().fim }), /início anterior/);
    assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='mensagem_identificada_ia'")).rows.length, 1);
  } finally { await cliente.close(); }
});

test("falha na consulta identifica a etapa sem expor detalhes do banco", async () => {
  const banco = { transaction: async (trabalho: (tx: { execute: () => Promise<never> }) => Promise<unknown>) =>
    trabalho({ execute: async () => { throw Object.assign(new Error("DATABASE_URL=segredo"), { code: "42P01" }); } }) } as unknown as BancoSql;
  const registrar = console.error;
  const avisos: string[] = [];
  console.error = (...partes: unknown[]) => { avisos.push(partes.join(" ")); };
  try {
    await assert.rejects(consultarPainel(banco, filtro()), erro => {
      assert.match(String(erro), /etapa P01/);
      assert.doesNotMatch(String(erro), /segredo/);
      return true;
    });
    assert.match(avisos.join(" "), /P01; SQLSTATE 42P01/);
    assert.doesNotMatch(avisos.join(" "), /segredo/);
  } finally { console.error = registrar; }
});

test("painel informa o SQLSTATE da causa interna de uma falha na etapa P04", async () => {
  let consultas = 0;
  const banco = { transaction: async (trabalho: (tx: { execute: () => Promise<unknown> }) => Promise<unknown>) =>
    trabalho({ execute: async () => {
      consultas++;
      if (consultas === 1) return [];
      if (consultas === 2) return [{ id: crypto.randomUUID(), nome: "canal" }];
      if (consultas === 3) return [{ abertas: 0, pendentes: 0, ia: 0, humano: 0 }];
      throw Object.assign(new Error("Consulta protegida"), { cause: Object.assign(new Error("detalhe privado"), { code: "42703" }) });
    } }) } as unknown as BancoSql;
  const registrar = console.error;
  const avisos: string[] = [];
  console.error = (...partes: unknown[]) => { avisos.push(partes.join(" ")); };
  try {
    await assert.rejects(consultarPainel(banco, filtro()), /etapa P04, código 42703/);
    assert.match(avisos.join(" "), /P04; SQLSTATE 42703/);
    assert.doesNotMatch(avisos.join(" "), /detalhe privado/);
  } finally { console.error = registrar; }
});
