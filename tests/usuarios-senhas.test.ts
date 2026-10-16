import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { prepararSenha, conferirSenha } from "../src/lib/auth/senhas";
import { autenticarESessionarSenha, autenticarSenha } from "../src/lib/auth/login-senha";
import { criarUsuario, alterarUsuario, listarUsuarios, renovarConvite } from "../src/lib/auth/usuarios";
import { criarSessao, novoToken, lerSessao, hashToken } from "../src/lib/auth/repositorio";
import { mudarSenha } from "../src/lib/auth/trocar-senha";
import { contextoRequisicao } from "../src/lib/auth/contexto";
const hibpVazio: typeof fetch = async () => new Response("00000000000000000000000000000000000:0");

test("Argon2id usa salt único, preserva espaços e consulta vazamentos sem enviar a senha", async () => {
  const senha = ` ${randomBytes(24).toString("hex")} `;
  let destino = "";
  const um = await prepararSenha(senha, async url => { destino = String(url); return hibpVazio(url); });
  const dois = await prepararSenha(senha, hibpVazio);
  assert.notEqual(um.hash, dois.hash); assert.match(um.hash, /^\$argon2id\$/);
  assert.equal(await conferirSenha(senha, um.hash), true);
  assert.equal(await conferirSenha(senha.trim(), um.hash), false);
  assert.equal(await conferirSenha(senha, null), false);
  assert.equal(destino, `https://api.pwnedpasswords.com/range/${createHash("sha1").update(senha).digest("hex").toUpperCase().slice(0,5)}`);
  const sufixo = createHash("sha1").update(senha).digest("hex").toUpperCase().slice(5);
  await assert.rejects(prepararSenha(senha, async () => new Response(`${sufixo}:42`)), /vazamentos/);
  assert.ok((await prepararSenha(senha, async () => { throw new Error(); })).aviso);
  await assert.rejects(prepararSenha("x".repeat(257), hibpVazio));
});

test("usuários preservam hierarquia, colisão, auditoria e revogação; senha cria sessão individual", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const dono = (await cliente.query<{ id: string }>("INSERT INTO atendeia_users(name,email,role,enabled,modified_by) VALUES ('Dono','dono@example.test','super_admin',true,$1) RETURNING id", [systemUserId])).rows[0].id;
    const sessao = { userId: dono, papel: "super_admin" as const };
    await criarUsuario(banco, sessao, { nome: "Gerente", email: "gerente@example.test", papel: "admin", motivo: "Criação de teste" });
    const gerente = (await listarUsuarios(banco,sessao))[0];
    const gerenteId = (await cliente.query<{ id: string }>("SELECT id FROM atendeia_users WHERE email='gerente@example.test'")).rows[0].id;
    await cliente.query("UPDATE atendeia_users SET enabled=true WHERE id=$1", [gerenteId]);
    const gestor = { userId: gerenteId, papel: "admin" as const };
    await assert.rejects(criarUsuario(banco, gestor, { nome: "Escalação", email: "outro@example.test", papel: "admin", motivo: "Tentativa de escalada" }), /perfil/);
    await assert.rejects(criarUsuario(banco, sessao, { nome: "Escalação", email: "outro@example.test", papel: "super_admin", motivo: "Tentativa de escalada" }));
    const convite = await criarUsuario(banco, gestor, { nome: "SDR", email: "sdr@example.test", papel: "operador", motivo: "Criação de teste" });
    const [sdr] = await listarUsuarios(banco, gestor); assert.equal(sdr.papel, "operador");
    const senha = randomBytes(24).toString("hex"); const preparada = await prepararSenha(senha, hibpVazio);
    await cliente.query("UPDATE atendeia_users SET enabled=true,password_hash=$1 WHERE id=$2", [preparada.hash,sdr.id]);
    await cliente.query("INSERT INTO atendeia_users_passkeys(user_id,credencial_id,chave_publica,nome,modified_by) VALUES ($1,'simulada','chave','Teste',$1)", [sdr.id]);
    assert.equal(await autenticarSenha(banco, { email: sdr.email, senha }), sdr.id);
    const sessaoPorSenha = await autenticarESessionarSenha(banco, { email: sdr.email, senha }, true);
    assert.equal(sessaoPorSenha.usuario.id, sdr.id);
    assert.equal((await lerSessao(banco, sessaoPorSenha.token))?.userId, sdr.id);
    assert.equal((await cliente.query("SELECT id FROM atendeia_sessions WHERE is_deleted=false")).rows.length, 1);
    const recusas: string[] = [];
    for (const email of ["inexistente@example.test", sdr.email]) {
      try { await autenticarSenha(banco,{ email, senha: randomBytes(24).toString("hex") }); }
      catch (erro) { recusas.push((erro as Error).message); }
    }
    assert.equal(recusas[0],recusas[1]);
    for (let i=0;i<5;i++) await autenticarSenha(banco,{ email: sdr.email, senha: randomBytes(24).toString("hex") }).catch(()=>{});
    await assert.rejects(autenticarSenha(banco,{ email:sdr.email,senha }), { message: recusas[0] });
    const token = novoToken(); await banco.transaction(tx=>criarSessao(tx,sdr.id,token));
    const editado = { id:sdr.id,version:sdr.version,nome:sdr.nome,email:sdr.email,papel:"operador",ativo:false,motivo:"Suspensão de teste" };
    await alterarUsuario(banco,gestor,editado);
    assert.equal(await lerSessao(banco,token),null);
    await assert.rejects(alterarUsuario(banco,gestor,editado), /Recarregue/);
    assert.equal((await cliente.query("SELECT id FROM atendeia_users_convites WHERE token_hash=$1 AND is_deleted=false",[hashToken(convite.convite)])).rows.length,0);
    await assert.rejects(alterarUsuario(banco,sessao,{ ...editado,id:dono,version:0,papel:"admin" }), /perfil/);
    const novo = await renovarConvite(banco,gestor,{ id:sdr.id,version:1,motivo:"Recuperação solicitada" });
    assert.notEqual(novo.convite,convite.convite);
    assert.equal((await cliente.query("SELECT id FROM atendeia_users_passkeys WHERE user_id=$1 AND is_deleted=false",[sdr.id])).rows.length,0);
    const trilha = JSON.stringify((await cliente.query("SELECT details FROM atendeia_audit_logs")).rows);
    assert.ok(!trilha.includes(senha) && !trilha.includes(preparada.hash) && !trilha.includes(novo.convite));
    assert.ok(gerente);
  } finally { await cliente.close(); }
});

test("troca de senha confere a atual e encerra sessões sem aceitar userId do cliente", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const senha = randomBytes(24).toString("hex"); const hash = (await prepararSenha(senha,hibpVazio)).hash;
    const id = (await cliente.query<{ id: string }>("INSERT INTO atendeia_users(name,email,password_hash,enabled,role,modified_by) VALUES ('Teste','teste@example.test',$1,true,'operador',$2) RETURNING id",[hash,systemUserId])).rows[0].id;
    const sessao = { userId:id,papel:"operador" as const }; const token = novoToken();
    await banco.transaction(tx=>criarSessao(tx,id,token));
    const nova = randomBytes(24).toString("hex");
    await assert.rejects(mudarSenha(banco,sessao,{ atual:nova,nova },hibpVazio), /senha atual/);
    await assert.rejects(mudarSenha(banco,sessao,{ atual:senha,nova,userId:systemUserId },hibpVazio));
    await mudarSenha(banco,sessao,{ atual:senha,nova },hibpVazio);
    assert.equal(await lerSessao(banco,token),null);
    const armazenada = (await cliente.query<{ password_hash: string }>("SELECT password_hash FROM atendeia_users WHERE id=$1",[id])).rows[0].password_hash;
    assert.equal(await conferirSenha(nova,armazenada),true); assert.equal(await conferirSenha(senha,armazenada),false);
  } finally { await cliente.close(); }
});

test("IP não confia no encaminhamento sem configuração explícita de proxy", () => {
  const anterior=process.env.AUTH_TRUST_PROXY_HOPS;
  try {
    delete process.env.AUTH_TRUST_PROXY_HOPS;
    const req=new Request("https://atendeia.example",{headers:{"x-forwarded-for":"198.51.100.1, 192.0.2.1"}});
    assert.equal(contextoRequisicao(req).ip,null);
    process.env.AUTH_TRUST_PROXY_HOPS="1"; assert.equal(contextoRequisicao(req).ip,"192.0.2.1");
  } finally { if(anterior===undefined)delete process.env.AUTH_TRUST_PROXY_HOPS; else process.env.AUTH_TRUST_PROXY_HOPS=anterior; }
});
