import { sql } from "drizzle-orm";
import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { linhas, type BancoSql } from "../db/porta";
import { atorCrm } from "../crm/acesso";
import type { SessaoAtiva } from "./permissoes";
import { configuracaoPasskey } from "./passkeys";
import { consumirDesafio, guardarDesafio, recusaLogin } from "./desafios";
import { auditarIdentidade, limitarAuth } from "./repositorio";
import { conferirSenha } from "./senhas";
import { revogarAcessos } from "./usuarios";

export async function iniciarFator(banco: BancoSql, sessao: SessaoAtiva, senha: string) {
  await limitarAuth(banco, `fator:${sessao.userId}`, 5);
  const [usuario] = linhas<{ nome: string; hash: string | null }>(await banco.execute(sql`SELECT name AS nome,password_hash AS hash
    FROM atendeia_users WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false`));
  if (!usuario || !await conferirSenha(senha, usuario.hash)) throw recusaLogin();
  const existentes = linhas<{ id: string }>(await banco.execute(sql`SELECT credencial_id AS id FROM atendeia_users_passkeys
    WHERE user_id=${sessao.userId} AND is_deleted=false`));
  const options = await generateRegistrationOptions({ rpName: "Atende AI", rpID: configuracaoPasskey().expectedRPID,
    userName: sessao.userId, userDisplayName: usuario.nome, userID: new TextEncoder().encode(sessao.userId),
    attestationType: "none", excludeCredentials: existentes, authenticatorSelection: { residentKey: "required", userVerification: "required" } });
  return { options, token: await guardarDesafio(banco, options.challenge, "fator", sessao.userId) };
}
export async function concluirFator(banco: BancoSql, sessao: SessaoAtiva, token: string, resposta: RegistrationResponseJSON) {
  const desafio = await consumirDesafio(banco, token, "fator");
  if (desafio.userId !== sessao.userId) throw recusaLogin();
  const resultado = await verifyRegistrationResponse({ response: resposta, expectedChallenge: desafio.challenge, ...configuracaoPasskey(), requireUserVerification: true });
  if (!resultado.verified || !resultado.registrationInfo.userVerified) throw recusaLogin();
  const credencial = resultado.registrationInfo.credential;
  await banco.transaction(async tx => {
    await atorCrm(tx, sessao);
    await tx.execute(sql`INSERT INTO atendeia_users_passkeys(user_id,credencial_id,chave_publica,contador,nome,modified_by)
      VALUES (${sessao.userId},${credencial.id},${Buffer.from(credencial.publicKey).toString("base64url")},${credencial.counter},'Passkey adicional',${sessao.userId})`);
    await auditarIdentidade(tx, sessao.userId, "passkey_adicionada");
    await revogarAcessos(tx, sessao.userId, sessao.userId);
  });
}
