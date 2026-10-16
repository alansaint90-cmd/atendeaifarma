import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { receberOperacao } from "../src/lib/operacao/receber";
import { transferirAtendimento } from "../src/lib/operacao/transferir";

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
  } finally { await cliente.close(); }
});
