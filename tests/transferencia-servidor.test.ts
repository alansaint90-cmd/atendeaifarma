import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { receberOperacao } from "../src/lib/operacao/receber";
import { transferirAtendimento } from "../src/lib/operacao/transferir";
import { consultarOperacao } from "../src/lib/operacao/consultas";
import { atendimentoHumanoAtivo } from "../src/lib/farmacia/atendimento";

test("transferência muda somente o setor e atendimento do chip solicitado e registra auditoria", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    for (const instance of ["chip-a", "chip-b"]) await receberOperacao(banco, { instance, event: "messages.upsert", data: {
      key: { id: "entrada", fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" },
      messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: "Quero um atendente" } } });
    await transferirAtendimento(banco, "chip-b", "5511999999999", "Suporte");
    const { rows } = await cliente.query<{ instance_name: string; status: string; name: string | null }>(`SELECT ch.instance_name,c.status,d.name
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      LEFT JOIN atendeia_departments d ON d.id=c.department_id ORDER BY ch.instance_name`);
    assert.deepEqual(rows, [{ instance_name: "chip-a", status: "open", name: null }, { instance_name: "chip-b", status: "pending", name: "Suporte" }]);
    const trilha = await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='atendimento_transferido'");
    assert.equal(trilha.rows.length, 1);
    await assert.rejects(transferirAtendimento(banco, "chip-a", "5511999999999", "Inexistente"));
    await transferirAtendimento(banco, "chip-a", "5511999999999", "Suporte", "estoque_indisponivel");
    await transferirAtendimento(banco, "chip-a", "5511999999999", "Suporte", "estoque_indisponivel");
    assert.equal(await atendimentoHumanoAtivo(banco,"chip-a","5511999999999"),true);
    const painel=await consultarOperacao(banco);
    assert.equal(painel.conversas.find(c=>c.canal==="chip-a")?.aguardaHumano,true);
    assert.equal(painel.conversas.find(c=>c.canal==="chip-b")?.aguardaHumano,false);
    assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='estoque_indisponivel_equipe_notificada'")).rows.length,1);
    assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE direction='outbound'")).rows.length,0,"Notificação é interna; nenhuma mensagem de transferência é criada para o WhatsApp.");
    await cliente.exec(`CREATE FUNCTION recusar_notificacao_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='estoque_indisponivel_equipe_notificada' THEN RAISE EXCEPTION 'Falha simulada'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER recusar_notificacao_teste BEFORE INSERT ON atendeia_audit_logs FOR EACH ROW EXECUTE FUNCTION recusar_notificacao_teste();`);
    await assert.rejects(transferirAtendimento(banco,"chip-b","5511999999999","Suporte","estoque_indisponivel"));
    assert.equal(await atendimentoHumanoAtivo(banco,"chip-b","5511999999999"),false,"Falha na auditoria desfaz a pausa e a notificação juntas.");
  } finally { await cliente.close(); }
});
