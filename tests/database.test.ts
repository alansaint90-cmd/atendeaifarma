import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { bootstrapSql, systemUserId } from "../src/lib/db/bootstrap";

test("migrações PostgreSQL preservam credenciais e impõem integridade", async t => {
  const client = new PGlite();
  const database = drizzle(client);
  const migrate = () => applyMigrations({ transaction: work => database.transaction(tx => work(tx)) });
  try {
    await client.exec(bootstrapSql);
    await client.query("INSERT INTO atendeia_integration_settings(id, encrypted_payload, modified_by, version) VALUES ('integrations', 'existing-encrypted-secret', 'bootstrap-admin', 5)");
    await migrate();
    await migrate();

    await t.test("cria todas as tabelas com auditoria e FK RESTRICT", async () => {
      const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'atendeia_%'");
      assert.equal(tables.rows.length, 45);
      for (const nome of ["atendeia_agenda_horarios", "atendeia_agenda_horarios_reservas"]) assert.ok(tables.rows.some(tabela => tabela.table_name === nome));
      for (const { table_name } of tables.rows) {
        const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table_name]);
        for (const expected of ["created_at", "updated_at", "deleted_at", "is_deleted", "modified_by"]) assert.ok(columns.rows.some(row => row.column_name === expected), `${table_name}: ${expected}`);
        const fks = await client.query<{ confdeltype: string }>("SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid=$1::regclass", [table_name]);
        assert.ok(fks.rows.length > 0, table_name);
        assert.ok(fks.rows.every(row => row.confdeltype === "r"));
      }
    });

    await t.test("reexecução preserva segredos e não duplica seeds", async () => {
      const rows = await client.query<{ encrypted_payload: string; version: number }>("SELECT encrypted_payload,version FROM atendeia_integration_settings");
      assert.deepEqual(rows.rows, [{ encrypted_payload: "existing-encrypted-secret", version: 5 }]);
      assert.equal((await client.query("SELECT id FROM atendeia_departments WHERE is_deleted=false")).rows.length, 4);
      assert.equal((await client.query("SELECT id FROM atendeia_users WHERE enabled=true")).rows.length, 0);
    });

    await t.test("rejeita referências inválidas e permite reutilização após exclusão lógica", async () => {
      await assert.rejects(client.query("INSERT INTO atendeia_contacts(name, modified_by) VALUES ('Invalid', '00000000-0000-4000-8000-000000000099')"));
      await client.query("INSERT INTO atendeia_contacts(name,phone,modified_by) VALUES ('Original','+5571999999999',$1)", [systemUserId]);
      await assert.rejects(client.query("INSERT INTO atendeia_contacts(name,phone,modified_by) VALUES ('Duplicate','+5571999999999',$1)", [systemUserId]));
      await client.query("UPDATE atendeia_contacts SET is_deleted=true,deleted_at=now(),updated_at=now(),version=version+1 WHERE phone='+5571999999999'");
      await client.query("INSERT INTO atendeia_contacts(name,phone,modified_by) VALUES ('Replacement','+5571999999999',$1)", [systemUserId]);
      await assert.rejects(client.query("INSERT INTO atendeia_contacts(name,phone,modified_by) VALUES ('Invalid phone','abcdef',$1)", [systemUserId]));
    });

    await t.test("conversas e mensagens conservam identidade e histórico", async () => {
      const contact = (await client.query<{ id: string }>("SELECT id FROM atendeia_contacts WHERE is_deleted=false LIMIT 1")).rows[0].id;
      const channel = (await client.query<{ id: string }>("INSERT INTO atendeia_channels(name,instance_name,modified_by) VALUES ('Test','test-instance',$1) RETURNING id", [systemUserId])).rows[0].id;
      const args = [channel, contact, systemUserId];
      const conversation = (await client.query<{ id: string }>("INSERT INTO atendeia_conversations(channel_id,contact_id,remote_jid,modified_by) VALUES ($1,$2,'test@s.whatsapp.net',$3) RETURNING id", args)).rows[0].id;
      await assert.rejects(client.query("INSERT INTO atendeia_conversations(channel_id,contact_id,remote_jid,modified_by) VALUES ($1,$2,'test@s.whatsapp.net',$3)", args));
      const insert = "INSERT INTO atendeia_messages(conversation_id,provider_message_id,direction,sender_type,content,modified_by) VALUES ($1,'external-1','inbound','contact','Olá',$2)";
      await client.query(insert, [conversation, systemUserId]);
      await assert.rejects(client.query(insert, [conversation, systemUserId]));
      await client.query("UPDATE atendeia_conversations SET status='closed',closed_at=now(),updated_at=now(),version=version+1 WHERE id=$1", [conversation]);
      await client.query("INSERT INTO atendeia_conversations(channel_id,contact_id,remote_jid,modified_by) VALUES ($1,$2,'test@s.whatsapp.net',$3)", args);
    });

    await t.test("recusa migração alterada sem sobrescrever histórico", async () => {
      await client.query("UPDATE atendeia_migrations SET checksum='tampered'");
      await assert.rejects(migrate(), /Migração aplicada foi modificada/);
    });
  } finally { await client.close(); }
});
