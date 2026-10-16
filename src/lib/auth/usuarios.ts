import { sql } from "drizzle-orm";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { atorCrm } from "../crm/acesso";
import type { SessaoAtiva } from "./permissoes";
import { hashToken, novoToken } from "./repositorio";

const cadastro = z.strictObject({ nome: z.string().trim().min(2).max(120), email: z.email().max(254).trim().toLowerCase(),
  papel: z.enum(["admin", "operador"]), motivo: z.string().trim().min(5).max(500) });
const identidade = z.strictObject({ id: z.uuid(), version: z.number().int().min(0) });
const alteracao = cadastro.extend({ id: z.uuid(), version: z.number().int().min(0), ativo: z.boolean() });
export interface UsuarioResumo { id: string; nome: string; email: string; papel: string; ativo: boolean; version: number; pendente: boolean }
const campos = sql`id,name AS nome,email,role AS papel,enabled AS ativo,version,(password_hash IS NULL) AS pendente`;

export async function revogarAcessos(tx: TransacaoSql, usuario: string, ator: string) {
  await tx.execute(sql`UPDATE atendeia_sessions SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator}
    WHERE user_id=${usuario} AND is_deleted=false`);
  await tx.execute(sql`UPDATE atendeia_auth_desafios SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator}
    WHERE user_id=${usuario} AND is_deleted=false`);
  await tx.execute(sql`UPDATE atendeia_users_convites SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator}
    WHERE user_id=${usuario} AND is_deleted=false`);
}
async function auditar(tx: TransacaoSql, ator: string, alvo: string, acao: string, motivo: string, antes: object, depois: object) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields,details)
    VALUES (${ator},${acao},'usuario',${alvo},'[]'::jsonb,${JSON.stringify({ motivo, antes, depois })}::jsonb)`);
}
function permitir(ator: SessaoAtiva, papelAtual: string, papelNovo: string, alvo?: string) {
  if (alvo === ator.userId || papelAtual === "super_admin" || papelNovo === "super_admin"
    || (ator.papel !== "super_admin" && (papelAtual !== "operador" || papelNovo !== "operador"))) {
    throw new ErroDeNegocio("Você não pode alterar esse usuário ou conceder esse perfil.");
  }
}
async function convite(tx: TransacaoSql, usuario: string, ator: string) {
  const codigo = novoToken();
  await tx.execute(sql`UPDATE atendeia_users_convites SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator}
    WHERE user_id=${usuario} AND is_deleted=false`);
  await tx.execute(sql`INSERT INTO atendeia_users_convites(user_id,token_hash,expira_em,modified_by)
    VALUES (${usuario},${hashToken(codigo)},now()+interval '15 minutes',${ator})`);
  return codigo;
}
export async function listarUsuarios(banco: BancoSql, sessao: SessaoAtiva) {
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "admin");
    return linhas<UsuarioResumo>(await tx.execute(sql`SELECT ${campos} FROM atendeia_users WHERE is_deleted=false AND email IS NOT NULL
      AND (${ator.papel === "super_admin"} OR role='operador') ORDER BY lower(name) LIMIT 200`));
  });
}
export async function criarUsuario(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = cadastro.parse(entrada);
  try {
    return await banco.transaction(async tx => {
      const ator = await atorCrm(tx, sessao, "admin"); permitir(ator, dados.papel, dados.papel);
      const [usuario] = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_users(name,email,role,enabled,modified_by)
        VALUES (${dados.nome},${dados.email},${dados.papel},false,${ator.userId}) RETURNING id`));
      await auditar(tx, ator.userId, usuario.id, "usuario_convidado", dados.motivo, {}, { papel: dados.papel, ativo: false });
      return { convite: await convite(tx, usuario.id, ator.userId) };
    });
  } catch (erro) {
    const e = erro as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") throw new ErroDeNegocio("Já existe usuário com esse e-mail.");
    throw erro;
  }
}
export async function alterarUsuario(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = alteracao.parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "admin");
    const [alvo] = linhas<UsuarioResumo>(await tx.execute(sql`SELECT ${campos} FROM atendeia_users WHERE id=${dados.id} AND is_deleted=false FOR UPDATE`));
    if (!alvo || alvo.version !== dados.version) throw new ErroDeNegocio("Usuário alterado. Recarregue a lista.");
    permitir(ator, alvo.papel, dados.papel, alvo.id);
    if (dados.ativo && (alvo.pendente || !linhas(await tx.execute(sql`SELECT id FROM atendeia_users_passkeys WHERE user_id=${alvo.id} AND is_deleted=false`)).length)) {
      throw new ErroDeNegocio("O usuário precisa concluir o primeiro acesso e definir uma senha.");
    }
    await auditar(tx, ator.userId, alvo.id, "usuario_alterado", dados.motivo, { papel: alvo.papel, ativo: alvo.ativo }, { papel: dados.papel, ativo: dados.ativo });
    await tx.execute(sql`UPDATE atendeia_users SET name=${dados.nome},email=${dados.email},role=${dados.papel},enabled=${dados.ativo},
      version=version+1,updated_at=now(),modified_by=${ator.userId} WHERE id=${alvo.id} AND version=${dados.version} AND is_deleted=false`);
    await revogarAcessos(tx, alvo.id, ator.userId);
  });
}
export async function renovarConvite(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = identidade.extend({ motivo: z.string().trim().min(5).max(500) }).parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "admin");
    const [alvo] = linhas<UsuarioResumo>(await tx.execute(sql`SELECT ${campos} FROM atendeia_users WHERE id=${dados.id} AND is_deleted=false FOR UPDATE`));
    if (!alvo || alvo.version !== dados.version) throw new ErroDeNegocio("Usuário alterado. Recarregue a lista.");
    permitir(ator, alvo.papel, alvo.papel, alvo.id);
    await auditar(tx, ator.userId, alvo.id, "usuario_acesso_reiniciado", dados.motivo, { ativo: alvo.ativo }, { ativo: false });
    await revogarAcessos(tx, alvo.id, ator.userId);
    await tx.execute(sql`UPDATE atendeia_users_passkeys SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator.userId}
      WHERE user_id=${alvo.id} AND is_deleted=false`);
    await tx.execute(sql`UPDATE atendeia_users SET enabled=false,password_hash=NULL,version=version+1,updated_at=now(),modified_by=${ator.userId}
      WHERE id=${alvo.id} AND version=${dados.version} AND is_deleted=false`);
    return { convite: await convite(tx, alvo.id, ator.userId) };
  });
}
