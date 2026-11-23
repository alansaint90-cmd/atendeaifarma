import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { registrarEnvioIa } from "../src/lib/operacao/atribuir-ia";
import { receberOperacao } from "../src/lib/operacao/receber";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { assumirConversa, estadoPausaIa } from "../src/lib/farmacia/atendimento";
import { recuperarAudioHistorico, decodificarAudioHistorico } from "../src/lib/farmacia/audio-historico";
import { configurarAgenteFarmacia } from "../src/lib/farmacia/configuracao-agente";
import { chatbotExample } from "../src/lib/chatbots/defaults";

const settings = { AI_ENABLED: "true" as const, OPENAI_API_KEY: "sk-teste-ficticio", OPENAI_MODEL: "modelo", REDIS_URL: "redis://localhost:6379",
  EVOLUTION_API_URL: "https://evolution.example.invalid", EVOLUTION_API_KEY: "chave-ficticia", EVOLUTION_INSTANCE_NAME: "chip-teste" };
const ogg = Buffer.from("OggSconteudo-ficticio");

test("configuração da farmácia evita identificação obrigatória em chatbots antigos sem regravar o prompt", () => {
  const bot = { ...chatbotExample, perguntarNome: true, context: "Você é Débora.", openingMessages: ["Antes de começarmos, qual seu nome?"] };
  const config = configurarAgenteFarmacia(settings, bot);
  assert.equal(config.success, true);
  assert.equal(config.data?.perguntarNome, false); assert.equal(config.data?.openingMessages, undefined);
  assert.match(config.data!.AI_SYSTEM_PROMPT, /Farmácia WE/); assert.match(config.data!.AI_SYSTEM_PROMPT, /Débora/);
  assert.equal(bot.perguntarNome, true); assert.deepEqual(bot.openingMessages, ["Antes de começarmos, qual seu nome?"]);
});

test("áudio histórico valida formato, assinatura, base64 canônico e tamanho", () => {
  assert.equal(decodificarAudioHistorico({ base64: ogg.toString("base64"), mimetype: "audio/ogg; codecs=opus" }).mime, "audio/ogg");
  for (const entrada of [
    { base64: ogg.toString("base64"), mimetype: "text/html" },
    { base64: Buffer.from("conteudo sem assinatura").toString("base64"), mimetype: "audio/ogg" },
    { base64: ogg.toString("base64") + "\n", mimetype: "audio/ogg" },
    { base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"), mimetype: "audio/ogg" },
    { url: "https://example.invalid/audio" },
  ]) assert.throws(() => decodificarAudioHistorico(entrada));
});

test("histórico grava resposta sem eco, deduplica e recupera áudio apenas para operador ativo", async t => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  const ator = { userId: randomUUID(), papel: "operador" as const };
  const receber = (id: string, saida = false, audio = false) => receberOperacao(banco, { event: "messages.upsert", instance: "chip-teste", data: {
    key: { id, fromMe: saida, remoteJid: "5511999990001@s.whatsapp.net" }, messageTimestamp: Math.floor(Date.now() / 1000),
    message: audio ? { audioMessage: {} } : { conversation: saida ? "Resposta do agente" : "Olá" },
  } });
  try {
    await applyMigrations(banco);
    await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Operador fictício','operador',true,$2)", [ator.userId, systemUserId]);
    await receber("entrada");
    const instanteEntrada = (await cliente.query<{ instante: number }>("SELECT extract(epoch FROM sent_at)::int instante FROM atendeia_messages WHERE provider_message_id='entrada' AND is_deleted=false")).rows[0].instante;
    const origem = { identidade: createHash("sha256").update("chip-teste:entrada").digest("hex"), instante: instanteEntrada };
    await t.test("envio confirmado aparece sem webhook de saída; repetição e eco não duplicam", async () => {
      await registrarEnvioIa(banco, "chip-teste", "resposta", { numero: "5511999990001", texto: "Resposta do agente", origem });
      const antes = await consultarOperacao(banco);
      assert.equal(antes.conversas[0].mensagens.length, 2);
      assert.equal(antes.conversas[0].mensagens[1].conteudo, "Resposta do agente");
      assert.equal(antes.conversas[0].mensagens[1].direcao, "outbound");
      await registrarEnvioIa(banco, "chip-teste", "resposta", { numero: "5511999990001", texto: "Resposta do agente", origem });
      await receber("resposta", true);
      const depois = await consultarOperacao(banco);
      assert.equal(depois.conversas[0].mensagens.length, 2); assert.equal(depois.conversas[0].version, antes.conversas[0].version);
      await receber("eco-primeiro", true);
      await registrarEnvioIa(banco, "chip-teste", "eco-primeiro", { numero: "5511999990001", texto: "Resposta do agente", origem });
      const bot = await cliente.query<{ sender_type: string }>("SELECT sender_type FROM atendeia_messages WHERE provider_message_id='eco-primeiro' AND is_deleted=false");
      assert.equal(bot.rows[0].sender_type, "bot");
      assert.equal((await consultarOperacao(banco)).conversas[0].mensagens.length, 3);
    });
    await t.test("eco anterior permite pausar a conversa e reentrega não desrespeita a devolução à IA", async () => {
      const conteudo={numero:"5511999990001",texto:"A equipe vai dar continuidade à entrega.",origem,encaminharEntrega:true as const};
      await receber("eco-encaminhamento",true);
      await registrarEnvioIa(banco,"chip-teste","eco-encaminhamento",conteudo);
      const [encaminhada]=(await consultarOperacao(banco)).conversas;
      assert.equal(encaminhada.aguardaHumano,true);
      assert.equal((await estadoPausaIa(banco,"chip-teste",conteudo.numero))?.bloqueada,true);
      await assumirConversa(banco,ator,{id:encaminhada.id,assumir:false});
      await registrarEnvioIa(banco,"chip-teste","eco-encaminhamento",conteudo);
      assert.equal((await estadoPausaIa(banco,"chip-teste",conteudo.numero))?.bloqueada,false);
      const auditoria=await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='entrega_encaminhada_equipe' AND entity_id=$1 AND is_deleted=false",[encaminhada.id]);
      assert.equal(auditoria.rows.length,1);
    });
    await t.test("falha da auditoria reverte recibo e resposta", async () => {
      await cliente.exec("CREATE FUNCTION impedir_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='mensagem_ia_registrada' THEN RAISE EXCEPTION 'falha fictícia'; END IF; RETURN NEW; END $$; CREATE TRIGGER impedir_auditoria BEFORE INSERT ON atendeia_audit_logs FOR EACH ROW EXECUTE FUNCTION impedir_auditoria();");
      await assert.rejects(registrarEnvioIa(banco, "chip-teste", "falha", { numero: "5511999990001", texto: "Teste", origem }));
      assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE provider_message_id='falha' AND is_deleted=false")).rows.length, 0);
      assert.equal((await cliente.query("SELECT id FROM atendeia_envios_ia WHERE provider_message_id='falha' AND is_deleted=false")).rows.length, 0);
    });
    await t.test("áudios recebidos e enviados têm metadados e recuperação autenticada sem URL remota", async () => {
      for (const saida of [false, true]) {
        await receber(`audio-${saida}`, saida, true);
        const resumo = await consultarOperacao(banco);
        const mensagem = resumo.conversas[0].mensagens.find(m => m.tipo === "audio" && m.direcao === (saida ? "outbound" : "inbound"))!;
        assert.equal(mensagem.audioDisponivel, true);
        let chamadas = 0;
        const request: typeof fetch = async (url, init) => {
          chamadas++; assert.equal(String(url), settings.EVOLUTION_API_URL + "/chat/getBase64FromMediaMessage/chip-teste");
          assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
          assert.equal(JSON.parse(String(init?.body)).message.key.fromMe, saida);
          return Response.json({ base64: ogg.toString("base64"), mimetype: "audio/ogg" });
        };
        const deps = { settings: async () => settings, request };
        assert.deepEqual((await recuperarAudioHistorico(banco, ator, mensagem.id, deps)).bytes, new Uint8Array(ogg));
        assert.equal(chamadas, 1);
        await cliente.query("UPDATE atendeia_users SET enabled=false,version=version+1,updated_at=now() WHERE id=$1", [ator.userId]);
        await assert.rejects(recuperarAudioHistorico(banco, ator, mensagem.id, deps), /Sem permissão/);
        assert.equal(chamadas, 1);
        await cliente.query("UPDATE atendeia_users SET enabled=true,version=version+1,updated_at=now() WHERE id=$1", [ator.userId]);
        await assert.rejects(recuperarAudioHistorico(banco, ator, mensagem.id, { settings: async () => ({ ...settings, EVOLUTION_INSTANCE_NAME: "outro" }), request }));
        assert.equal(chamadas, 1);
        await assert.rejects(recuperarAudioHistorico(banco, ator, mensagem.id, { settings: async () => settings, request: async () => Response.json({ base64: "invalido", mimetype: "audio/ogg" }) }));
      }
    });
    await t.test("fechamento/exclusão não são revertidos por registro tardio nem liberam mídia", async () => {
      const resumo = await consultarOperacao(banco);
      const audio = resumo.conversas[0].mensagens.find(m => m.tipo === "audio")!;
      await cliente.query("UPDATE atendeia_conversations SET status='closed',version=version+1,updated_at=now() WHERE is_deleted=false");
      await registrarEnvioIa(banco, "chip-teste", "tardio", { numero: "5511999990001", texto: "Teste", origem });
      assert.equal((await consultarOperacao(banco)).conversas[0].mensagens.length, resumo.conversas[0].mensagens.length);
      await receber("nova-conversa");
      await registrarEnvioIa(banco, "chip-teste", "nao-transferir-historico", { numero: "5511999990001", texto: "Resposta antiga", origem });
      assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE provider_message_id='nao-transferir-historico' AND is_deleted=false")).rows.length, 0);
      await cliente.query("UPDATE atendeia_conversations SET is_deleted=true,deleted_at=now(),version=version+1,updated_at=now() WHERE is_deleted=false");
      await registrarEnvioIa(banco, "chip-teste", "excluido", { numero: "5511999990001", texto: "Teste", origem });
      assert.equal((await consultarOperacao(banco)).conversas.length, 0);
      const request: typeof fetch = async () => { throw new Error("Não pode consultar o provedor"); };
      await assert.rejects(recuperarAudioHistorico(banco, ator, audio.id, { settings: async () => settings, request }));
    });
  } finally { await cliente.close(); }
});
