import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { receberOperacao } from "../src/lib/operacao/receber";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { apagarConversaOperacional, conversaApagadaAposMensagem } from "../src/lib/operacao/apagar-conversa";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

test("apagar conversa preserva dados, exige gestor atual, versão e auditoria atômica", async t => {
  const cliente = new PGlite(), banco = drizzle(cliente), autor = randomUUID();
  const sessao = { userId: autor, papel: "admin" as const };
  const instante = Math.floor(Date.now() / 1000) - 10;
  const evento = (id: string, timestamp = instante, saida = false): EvolutionEvent => ({ event: "messages.upsert", instance: "exclusao-ficticia",
    data: { key: { id, fromMe: saida, remoteJid: "5511999990001@s.whatsapp.net" }, messageTimestamp: timestamp, message: { conversation: "Mensagem fictícia" } } });
  try {
    await applyMigrations(banco);
    await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES($1,'Gestor de teste','admin',true,$2)", [autor, systemUserId]);
    await receberOperacao(banco, evento("original"));
    const original = (await consultarOperacao(banco)).conversas[0], entrada = { id: original.id, version: original.version };
    await t.test("entrada estrita e papel ativo do banco, inclusive sessão administrativa antiga", async () => {
      await assert.rejects(apagarConversaOperacional(banco, sessao, { ...entrada, papel: "admin" }));
      await assert.rejects(apagarConversaOperacional(banco, sessao, { id: "inválido", version: 0 }));
      await cliente.query("UPDATE atendeia_users SET role='operador' WHERE id=$1", [autor]);
      await assert.rejects(apagarConversaOperacional(banco, sessao, entrada), /Sem permissão/);
      await cliente.query("UPDATE atendeia_users SET role='admin',enabled=false WHERE id=$1", [autor]);
      await assert.rejects(apagarConversaOperacional(banco, sessao, entrada), /Sem permissão/);
      await cliente.query("UPDATE atendeia_users SET enabled=true WHERE id=$1", [autor]);
    });
    await t.test("mensagem recebida altera a versão e impede apagar estado antigo", async () => {
      await receberOperacao(banco, evento("nova"));
      await assert.rejects(apagarConversaOperacional(banco, sessao, entrada), /Registro alterado/);
      entrada.version = (await consultarOperacao(banco)).conversas[0].version;
    });
    await t.test("reserva de mensagem humana já iniciada bloqueia exclusão", async () => {
      await cliente.query("INSERT INTO atendeia_atendimento_envios(conversa_id,chave,modified_by) VALUES($1,$2,$3)", [entrada.id, randomUUID(), autor]);
      await assert.rejects(apagarConversaOperacional(banco, sessao, entrada), /mensagem em envio/);
      await cliente.query("UPDATE atendeia_atendimento_envios SET status='incerto' WHERE conversa_id=$1 AND is_deleted=false", [entrada.id]);
    });
    await t.test("falha da auditoria reverte a exclusão inteira", async () => {
      await cliente.exec("CREATE FUNCTION recusar_exclusao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='conversa_apagada' THEN RAISE EXCEPTION 'falha fictícia'; END IF; RETURN NEW; END $$; CREATE TRIGGER recusar_exclusao BEFORE INSERT ON atendeia_audit_logs FOR EACH ROW EXECUTE FUNCTION recusar_exclusao();");
      await assert.rejects(apagarConversaOperacional(banco, sessao, entrada));
      assert.equal((await consultarOperacao(banco)).conversas.length, 1);
      await cliente.exec("DROP TRIGGER recusar_exclusao ON atendeia_audit_logs; DROP FUNCTION recusar_exclusao();");
    });
    await apagarConversaOperacional(banco, sessao, entrada);
    const resumo = await consultarOperacao(banco);
    assert.equal(resumo.conversas.length, 0); assert.equal(resumo.totalContatos, 1);
    assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE conversation_id=$1 AND is_deleted=false", [entrada.id])).rows.length, 2);
    assert.equal((await cliente.query("SELECT id FROM atendeia_conversations WHERE id=$1 AND is_deleted=true AND status='closed' AND modified_by=$2", [entrada.id, autor])).rows.length, 1);
    assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE entity_id=$1 AND action='conversa_apagada' AND modified_by=$2 AND is_deleted=false", [entrada.id, autor])).rows.length, 1);
    await assert.rejects(apagarConversaOperacional(banco, sessao, entrada), /Registro alterado/);
    assert.equal(await conversaApagadaAposMensagem(banco, "exclusao-ficticia", "5511999990001", instante), true);
    assert.equal(await conversaApagadaAposMensagem(banco, "outro-chip", "5511999990001", instante), false);
    assert.equal(await conversaApagadaAposMensagem(banco, "exclusao-ficticia", "5511999990001", instante + 100), false);
    await t.test("replay, histórico antigo e eco de saída não recriam atendimento apagado", async () => {
      await receberOperacao(banco, evento("original"));
      await receberOperacao(banco, evento("historico-antigo"));
      await receberOperacao(banco, evento("eco-de-saida", Math.floor(Date.now() / 1000) + 1, true));
      // Simula legado anterior ao recibo, sem remover registros.
      await cliente.query("INSERT INTO atendeia_messages(conversation_id,provider_message_id,direction,sender_type,content,modified_by) VALUES($1,'legado','inbound','contact','Legado',$2)", [entrada.id, systemUserId]);
      await receberOperacao(banco, evento("legado", Math.floor(Date.now() / 1000) + 1));
      assert.equal((await consultarOperacao(banco)).conversas.length, 0);
    });
    await receberOperacao(banco, evento("novo-atendimento", Math.floor(Date.now() / 1000) + 2));
    const nova = (await consultarOperacao(banco)).conversas;
    assert.equal(nova.length, 1); assert.notEqual(nova[0].id, entrada.id); assert.equal(nova[0].mensagens.length, 1);
    await t.test("apagar um atendimento antigo não bloqueia outro aberto para o mesmo contato", async () => {
      const outroEvento = (id: string): EvolutionEvent => ({ event: "messages.upsert", instance: "exclusao-ficticia", data: {
        key: { id, fromMe: false, remoteJid: "5511999990002@s.whatsapp.net" }, messageTimestamp: instante,
        message: { conversation: "Outro atendimento fictício" } } });
      await receberOperacao(banco, outroEvento("anterior"));
      const antiga = (await consultarOperacao(banco)).conversas.find(c => c.telefone === "+5511999990002")!;
      await cliente.query("UPDATE atendeia_conversations SET status='closed',version=version+1 WHERE id=$1 AND is_deleted=false", [antiga.id]);
      await receberOperacao(banco, outroEvento("outro-aberto"));
      const abertas = (await consultarOperacao(banco)).conversas;
      const atual = abertas.find(c => c.telefone === "+5511999990002" && c.id !== antiga.id)!;
      await apagarConversaOperacional(banco, sessao, { id: antiga.id, version: antiga.version + 1 });
      const identidade = (id: string) => createHash("sha256").update(`exclusao-ficticia:${id}`).digest("hex");
      assert.equal(await conversaApagadaAposMensagem(banco, "exclusao-ficticia", "5511999990002", instante, identidade("outro-aberto")), false);
      assert.equal(await conversaApagadaAposMensagem(banco, "exclusao-ficticia", "5511999990002", instante, identidade("anterior")), true);
      await receberOperacao(banco, outroEvento("continua-no-atual"));
      assert.equal((await consultarOperacao(banco)).conversas.find(c => c.id === atual.id)?.mensagens.length, 2);
    });
  } finally { await cliente.close(); }
});
