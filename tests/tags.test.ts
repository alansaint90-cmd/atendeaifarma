import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { listTags, mutateTag } from "../src/lib/tags/repository";

test("tags persistem cor, validam nomes, auditam e preservam registros excluídos", async () => {
  const client = new PGlite(); const database = drizzle(client);
  try {
    await applyMigrations({ transaction: work => database.transaction(tx => work(tx)) });
    const created = await mutateTag(database, { name: "Atleta", color: "#AABBCC" });
    assert.equal(created.color, "#aabbcc");
    await assert.rejects(mutateTag(database, { name: "atleta", color: "#aabbcc" }), /existe uma tag/);
    const changed = await mutateTag(database, { name: "Cliente", color: "#123456" }, { id: created.id, version: created.version });
    assert.equal(changed.version, created.version + 1);
    await assert.rejects(mutateTag(database, null, { id: created.id, version: created.version }, true), /outra sessão/);
    await mutateTag(database, null, { id: changed.id, version: changed.version }, true);
    assert.equal((await listTags(database)).some(tag => tag.id === created.id), false);
    const row = await client.query<{ is_deleted: boolean }>("SELECT is_deleted FROM atendeia_tags WHERE id=$1", [created.id]);
    assert.equal(row.rows[0].is_deleted, true);
    const audit = await client.query("SELECT id FROM atendeia_audit_logs WHERE entity_id=$1", [created.id]);
    assert.equal(audit.rows.length, 3);
    await mutateTag(database, { name: "Cliente", color: "#123456" });
    await assert.rejects(mutateTag(database, { name: "Inválida", color: "red" }));
    await client.query("UPDATE atendeia_settings_actors SET is_deleted=true WHERE id='bootstrap-admin'");
    await assert.rejects(mutateTag(database, { name: "Sem permissão", color: "#123456" }), /Administrador indisponível/);
  } finally { await client.close(); }
});
