import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { receberOperacao } from "../src/lib/operacao/receber";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { mensagensOperacionais } from "../src/lib/operacao/evento";
import type { EvolutionEvent } from "../src/lib/evolution/schema";

const mensagem = (id: string, saida = false) => ({
  key: { id, fromMe: saida, remoteJid: "123456789012345@lid", remoteJidAlt: "5571999999999@s.whatsapp.net" },
  pushName: saida ? "Meu negócio" : "Contato de teste", messageTimestamp: Math.floor(Date.now() / 1000),
  message: { conversation: saida ? "Como posso ajudar?" : "Olá" },
});
const evento = (id: string, saida = false): EvolutionEvent => ({ event: "messages.upsert", instance: "teste", data: mensagem(id, saida) });

test("operacional grava dados reais, deduplica, audita e respeita exclusão lógica", async t => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    await t.test("banco novo apresenta zero, sem exemplos", async () => {
      const resumo = await consultarOperacao(banco);
      assert.equal(resumo.abertas, 0); assert.equal(resumo.pendentes, 0); assert.equal(resumo.taxaResposta, 0);
      assert.equal(resumo.totalContatos, 0); assert.deepEqual(resumo.contatos, []); assert.deepEqual(resumo.conversas, []);
      assert.equal(resumo.volume.length, 7); assert.ok(resumo.volume.every(dia => dia.total === 0));
    });
    await t.test("LID usa telefone alternativo; reentrega não duplica contagens", async () => {
      await receberOperacao(banco, evento("entrada-1")); await receberOperacao(banco, evento("entrada-1"));
      const resumo = await consultarOperacao(banco);
      assert.equal(resumo.totalContatos, 1); assert.equal(resumo.abertas, 1); assert.equal(resumo.pendentes, 1);
      assert.equal(resumo.contatos[0].telefone, "+5571999999999"); assert.equal(resumo.conversas[0].mensagens.length, 1);
      assert.equal(resumo.volume.reduce((total, dia) => total + dia.total, 0), 1);
      const auditorias = await cliente.query<{ quantidade: number }>("SELECT count(*)::int quantidade FROM atendeia_audit_logs WHERE is_deleted=false");
      assert.equal(auditorias.rows[0].quantidade, 6);
    });
    await t.test("saída não renomeia contato; replay após fechamento não reabre conversa", async () => {
      const dado = mensagem("saida-1", true); dado.messageTimestamp += 1;
      await receberOperacao(banco, { event: "messages.upsert", instance: "teste", data: dado });
      let resumo = await consultarOperacao(banco);
      assert.equal(resumo.taxaResposta, 100); assert.equal(resumo.pendentes, 0);
      assert.equal(resumo.contatos[0].nome, "Contato de teste");
      await cliente.query("UPDATE atendeia_conversations SET status='closed',version=version+1,updated_at=now() WHERE is_deleted=false");
      await receberOperacao(banco, evento("entrada-1"));
      resumo = await consultarOperacao(banco); assert.equal(resumo.abertas, 0); assert.equal(resumo.conversas.length, 1);
      await receberOperacao(banco, evento("entrada-2"));
      resumo = await consultarOperacao(banco); assert.equal(resumo.abertas, 1); assert.equal(resumo.conversas.length, 2);
      await cliente.query("UPDATE atendeia_contacts SET is_deleted=true,deleted_at=now(),updated_at=now(),version=version+1 WHERE is_deleted=false");
      resumo = await consultarOperacao(banco);
      assert.equal(resumo.totalContatos, 0); assert.equal(resumo.abertas, 0); assert.equal(resumo.conversas.length, 0);
      assert.ok(resumo.volume.every(dia => dia.total === 0));
    });
    await t.test("falha reverte recibo e histórico juntos", async () => {
      await cliente.exec("CREATE FUNCTION falhar_mensagem() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de teste'; END $$; CREATE TRIGGER falhar BEFORE INSERT ON atendeia_messages FOR EACH ROW EXECUTE FUNCTION falhar_mensagem();");
      await assert.rejects(receberOperacao(banco, evento("falha-1")));
      const identidade = mensagensOperacionais(evento("falha-1"))[0].identidade;
      assert.equal((await cliente.query("SELECT id FROM atendeia_webhook_recebimentos WHERE identidade=$1 AND is_deleted=false", [identidade])).rows.length, 0);
    });
  } finally { await cliente.close(); }
});

test("grupos, LID sem telefone, protocolos e timestamp futuro não criam contatos", () => {
  const grupo = mensagem("grupo"); grupo.key.remoteJid = "123@g.us";
  const lid = mensagem("lid"); lid.key.remoteJidAlt = "123@lid";
  const futuro = mensagem("futuro"); futuro.messageTimestamp += 3600;
  for (const dado of [grupo, lid, futuro, { ...mensagem("protocolo"), message: { protocolMessage: {} } }]) {
    assert.deepEqual(mensagensOperacionais({ event: "messages.upsert", instance: "teste", data: dado }), []);
  }
  assert.deepEqual(mensagensOperacionais({ ...evento("status"), event: "messages.update" }), []);
});

test("lotes e mídia guardam campos operacionais sem URL, chave ou binário", () => {
  const dado = { ...mensagem("imagem"), message: { imageMessage: { caption: "Foto", url: "privada", mediaKey: "segredo" } } };
  const resultado = mensagensOperacionais({ event: "messages.upsert", instance: "teste", data: [mensagem("texto"), dado] });
  assert.equal(resultado.length, 2); assert.equal(resultado[1].tipo, "image"); assert.equal(resultado[1].conteudo, "Foto");
  assert.ok(!JSON.stringify(resultado).includes("segredo")); assert.ok(!JSON.stringify(resultado).includes("privada"));
});
