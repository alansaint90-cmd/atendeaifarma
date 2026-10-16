import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { provisionarProprietario } from "../src/lib/auth/provisionamento-proprietario";

test("reemite convite somente para proprietário inativo sem passkey e com o mesmo e-mail", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    await provisionarProprietario(banco, { nome: "Allan Nascimento", email: "alansaint90@gmail.com", token: "a".repeat(43), reiniciar: false });
    await assert.rejects(provisionarProprietario(banco, { nome: "Allan Nascimento", email: "alansaint90@gmail.com", token: "b".repeat(43), reiniciar: false }), /Já existe proprietário/);
    await provisionarProprietario(banco, { nome: "Allan Nascimento", email: "alansaint90@gmail.com", token: "c".repeat(43), reiniciar: true });
    const convites = await cliente.query<{ quantidade: number }>("SELECT count(*)::int AS quantidade FROM atendeia_users_convites WHERE is_deleted=false");
    assert.equal(convites.rows[0].quantidade, 1);
    await assert.rejects(provisionarProprietario(banco, { nome: "Allan Nascimento", email: "outro@gmail.com", token: "d".repeat(43), reiniciar: true }), /Já existe proprietário/);
    await cliente.query("UPDATE atendeia_users SET enabled=true WHERE role='super_admin'");
    await assert.rejects(provisionarProprietario(banco, { nome: "Allan Nascimento", email: "alansaint90@gmail.com", token: "e".repeat(43), reiniciar: true }), /Já existe proprietário/);
  } finally { await cliente.close(); }
});
