import { sql } from "drizzle-orm";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { linhas, type BancoSql } from "../db/porta";
import { consumirDesafio, guardarDesafio, recusaLogin } from "./desafios";
import { auditarIdentidade, criarSessao, hashToken, limitarAuth, novoToken } from "./repositorio";
import { prepararSenha } from "./senhas";

export function configuracaoPasskey(origem = process.env.AUTH_ORIGIN) {
  if (!origem) throw recusaLogin();
  const url = new URL(origem);
  if (url.origin !== origem || url.username || url.password || (url.protocol !== "https:" && url.hostname !== "localhost")) throw recusaLogin();
  return { expectedOrigin: url.origin, expectedRPID: url.hostname };
}

export async function iniciarLogin(banco: BancoSql, origem?: string, usuario?: string) {
  const config = configuracaoPasskey(origem);
  await limitarAuth(banco, "login:global", 120);
  const options = await generateAuthenticationOptions({ rpID: config.expectedRPID, userVerification: "required" });
  return { options, token: await guardarDesafio(banco, options.challenge, "login", usuario) };
}

export async function iniciarRegistro(banco: BancoSql, convite: string, origem?: string, senha?: string) {
  const config = configuracaoPasskey(origem);
  await limitarAuth(banco, "registro:global", 30);
  if (!/^[A-Za-z0-9_-]{43}$/.test(convite)) throw recusaLogin();
  await limitarAuth(banco, `convite:${hashToken(convite)}`, 5);
  const [usuario] = linhas<{ id: string; convite: string; nome: string }>(await banco.execute(sql`
    SELECT u.id,u.name AS nome,c.id AS convite FROM atendeia_users_convites c JOIN atendeia_users u ON c.user_id=u.id
    WHERE c.token_hash=${hashToken(convite)} AND c.is_deleted=false AND c.usado_em IS NULL AND c.expira_em>now()
    AND u.is_deleted=false AND u.enabled=false
    AND NOT EXISTS(SELECT 1 FROM atendeia_users_passkeys p WHERE p.user_id=u.id AND p.is_deleted=false)`));
  if (!usuario) throw recusaLogin();
  const preparada = await prepararSenha(senha ?? "");
  await banco.transaction(async tx => {
    const conviteValido = linhas(await tx.execute(sql`SELECT id FROM atendeia_users_convites WHERE id=${usuario.convite}
      AND is_deleted=false AND usado_em IS NULL AND expira_em>now() FOR UPDATE`));
    if (!conviteValido.length) throw recusaLogin();
    const alterado = linhas(await tx.execute(sql`UPDATE atendeia_users SET password_hash=${preparada.hash},updated_at=now(),version=version+1,modified_by=${usuario.id}
      WHERE id=${usuario.id} AND enabled=false AND is_deleted=false RETURNING id`));
    if (!alterado.length) throw recusaLogin();
    await auditarIdentidade(tx, usuario.id, "senha_inicial_definida");
  });
  const options = await generateRegistrationOptions({ rpName: "Atende AI", rpID: config.expectedRPID,
    userName: usuario.id, userDisplayName: usuario.nome, userID: new TextEncoder().encode(usuario.id),
    attestationType: "none", authenticatorSelection: { residentKey: "required", userVerification: "required" } });
  return { options, token: await guardarDesafio(banco, options.challenge, "registro", usuario.id, usuario.convite), aviso: preparada.aviso };
}

/** Conclui o primeiro acesso somente com senha, sem solicitar ou salvar passkey. */
export async function concluirRegistroSenha(banco: BancoSql, convite: string, senha: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(convite)) throw recusaLogin();
  await limitarAuth(banco, "registro:senha", 30);
  await limitarAuth(banco, `convite:${hashToken(convite)}`, 5);
  const preparada = await prepararSenha(senha);
  const sessao = novoToken();
  await banco.transaction(async tx => {
    const [usuario] = linhas<{ id: string; convite: string }>(await tx.execute(sql`
      SELECT u.id,c.id AS convite FROM atendeia_users_convites c
      JOIN atendeia_users u ON c.user_id=u.id
      WHERE c.token_hash=${hashToken(convite)} AND c.is_deleted=false AND c.usado_em IS NULL
        AND c.expira_em>now() AND u.is_deleted=false AND u.enabled=false
      FOR UPDATE OF c,u
    `));
    if (!usuario) throw recusaLogin();
    const usados = linhas(await tx.execute(sql`UPDATE atendeia_users_convites SET usado_em=now(),updated_at=now()
      WHERE id=${usuario.convite} AND is_deleted=false AND usado_em IS NULL AND expira_em>now() RETURNING id`));
    if (!usados.length) throw recusaLogin();
    const ativado = linhas(await tx.execute(sql`UPDATE atendeia_users SET password_hash=${preparada.hash},enabled=true,
      updated_at=now(),version=version+1,modified_by=${usuario.id}
      WHERE id=${usuario.id} AND enabled=false AND is_deleted=false RETURNING id`));
    if (!ativado.length) throw recusaLogin();
    await auditarIdentidade(tx, usuario.id, "senha_inicial_definida");
    await criarSessao(tx, usuario.id, sessao, 86400, "login_primeiro_acesso");
  });
  return { sessao, aviso: preparada.aviso };
}

export async function concluirRegistro(banco: BancoSql, token: string, resposta: RegistrationResponseJSON, origem?: string) {
  const config = configuracaoPasskey(origem);
  await limitarAuth(banco, "registro:conclusao", 30);
  const desafio = await consumirDesafio(banco, token, "registro");
  const resultado = await verifyRegistrationResponse({ response: resposta, expectedChallenge: desafio.challenge, ...config, requireUserVerification: true });
  if (!resultado.verified || !resultado.registrationInfo.userVerified || !desafio.userId || !desafio.conviteId) throw recusaLogin();
  const usuario = desafio.userId; const credencial = resultado.registrationInfo.credential; const sessao = novoToken();
  await banco.transaction(async tx => {
    const usados = linhas(await tx.execute(sql`UPDATE atendeia_users_convites SET usado_em=now(),updated_at=now()
      WHERE id=${desafio.conviteId} AND user_id=${usuario} AND is_deleted=false AND usado_em IS NULL AND expira_em>now() RETURNING id`));
    if (!usados.length) throw recusaLogin();
    const ativos = linhas(await tx.execute(sql`UPDATE atendeia_users SET enabled=true,updated_at=now(),version=version+1,modified_by=${usuario}
      WHERE id=${usuario} AND enabled=false AND is_deleted=false RETURNING id`));
    if (!ativos.length) throw recusaLogin();
    await tx.execute(sql`INSERT INTO atendeia_users_passkeys(user_id,credencial_id,chave_publica,contador,nome,modified_by)
      VALUES (${usuario},${credencial.id},${Buffer.from(credencial.publicKey).toString("base64url")},${credencial.counter},'Passkey inicial',${usuario})`);
    await auditarIdentidade(tx, usuario, "passkey_cadastrada");
    await criarSessao(tx, usuario, sessao);
  });
  return sessao;
}

export async function concluirLogin(banco: BancoSql, token: string, resposta: AuthenticationResponseJSON, origem?: string) {
  const config = configuracaoPasskey(origem);
  await limitarAuth(banco, "login:conclusao", 120);
  const desafio = await consumirDesafio(banco, token, "login");
  await limitarAuth(banco, `credencial:${resposta.id}`, 10);
  const [credencial] = linhas<{ id: string; userId: string; chave: string; contador: number }>(await banco.execute(sql`
    SELECT p.id,p.user_id AS "userId",p.chave_publica AS chave,p.contador FROM atendeia_users_passkeys p JOIN atendeia_users u ON u.id=p.user_id
    WHERE p.credencial_id=${resposta.id} AND p.is_deleted=false AND u.is_deleted=false AND u.enabled=true`));
  if (!credencial) throw recusaLogin();
  if (desafio.userId && desafio.userId !== credencial.userId) throw recusaLogin();
  const resultado = await verifyAuthenticationResponse({ response: resposta, expectedChallenge: desafio.challenge, ...config,
    requireUserVerification: true, credential: { id: resposta.id, publicKey: Buffer.from(credencial.chave, "base64url"), counter: Number(credencial.contador) } });
  if (!resultado.verified || !resultado.authenticationInfo.userVerified) throw recusaLogin();
  const sessao = novoToken();
  await banco.transaction(async tx => {
    const ativo = linhas(await tx.execute(sql`SELECT id FROM atendeia_users WHERE id=${credencial.userId} AND enabled=true AND is_deleted=false FOR UPDATE`));
    if (!ativo.length) throw recusaLogin();
    const atualizada = linhas(await tx.execute(sql`UPDATE atendeia_users_passkeys SET contador=${resultado.authenticationInfo.newCounter},updated_at=now()
      WHERE id=${credencial.id} AND contador=${credencial.contador} AND is_deleted=false RETURNING id`));
    if (!atualizada.length) throw recusaLogin();
    await criarSessao(tx, credencial.userId, sessao);
  });
  return sessao;
}
