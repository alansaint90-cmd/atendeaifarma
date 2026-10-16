import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { auditarIdentidade, criarSessao, limitarAuth, novoToken } from "./repositorio";
import { recusaLogin } from "./desafios";
import { conferirSenha, senhaEntrada } from "./senhas";

export const credenciaisSchema = z.strictObject({ email: z.email().max(254).trim().toLowerCase(), senha: senhaEntrada });
export async function autenticarSenha(banco: BancoSql, entrada: unknown) {
  const dados = credenciaisSchema.parse(entrada);
  let limitada = false;
  try { await limitarAuth(banco, `senha:conta:${dados.email}`, 5); } catch { limitada = true; }
  const [usuario] = linhas<{ id: string; hash: string | null; ativo: boolean }>(await banco.execute(sql`
    SELECT id,password_hash AS hash,enabled AS ativo FROM atendeia_users WHERE lower(email)=${dados.email} AND is_deleted=false`));
  const valida = await conferirSenha(dados.senha, usuario?.hash ?? null);
  if (!usuario?.ativo || !valida || limitada) {
    await auditarIdentidade(banco, usuario?.id ?? systemUserId, limitada ? "login_bloqueado" : "login_senha_recusado");
    throw recusaLogin();
  }
  return usuario.id;
}

export async function autenticarESessionarSenha(banco: BancoSql, entrada: unknown, lembrar = false) {
  const dados = credenciaisSchema.parse(entrada);
  const usuarioId = await autenticarSenha(banco, dados);
  const [usuario] = linhas<{ id: string; nome: string; email: string; papel: string }>(await banco.execute(sql`
    SELECT id,name AS nome,email,role AS papel FROM atendeia_users
    WHERE id=${usuarioId} AND enabled=true AND is_deleted=false
  `));
  if (!usuario) throw recusaLogin();
  const token = novoToken();
  const duracao = lembrar ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
  await banco.transaction(tx => criarSessao(tx, usuario.id, token, duracao, "login_senha"));
  return { token, duracao, usuario };
}
