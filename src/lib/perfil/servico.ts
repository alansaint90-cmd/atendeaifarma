import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { atorCrm } from "../crm/acesso";
import { linhas, type BancoSql } from "../db/porta";
import type { SessaoAtiva } from "../auth/permissoes";
import { perfilSchema, validarFotoPerfil } from "../validators/perfil";

export interface DadosPerfil { nome: string; email: string; celular: string; foto: string | null; version: number }
type LinhaPerfil = { name: string; email: string; phone: string | null; avatar_data: string | null; version: number };

export async function lerPerfil(banco: BancoSql, sessao: SessaoAtiva): Promise<DadosPerfil> {
  const [linha] = linhas<LinhaPerfil>(await banco.execute(sql`SELECT name,email,phone,avatar_data,version FROM atendeia_users
    WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false`));
  if (!linha || !linha.email) throw new ErroDeNegocio("Cadastro indisponível. Entre novamente.");
  return { nome: linha.name, email: linha.email, celular: linha.phone ?? "", foto: linha.avatar_data, version: linha.version };
}

export async function atualizarPerfil(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown): Promise<DadosPerfil> {
  const dados = perfilSchema.parse(entrada);
  validarFotoPerfil(dados.foto);
  return banco.transaction(async tx => {
    await atorCrm(tx, sessao);
    const [anterior] = linhas<LinhaPerfil>(await tx.execute(sql`SELECT name,email,phone,avatar_data,version FROM atendeia_users
      WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false FOR UPDATE`));
    if (!anterior || !anterior.email) throw new ErroDeNegocio("Cadastro indisponível. Entre novamente.");
    if (anterior.version !== dados.version) throw new ErroDeNegocio("Seu cadastro mudou em outra sessão. Recarregue a página.");
    const campos = [anterior.name !== dados.nome && "nome", (anterior.phone ?? "") !== dados.celular && "celular", anterior.avatar_data !== dados.foto && "foto"].filter((campo): campo is string => Boolean(campo));
    if (!campos.length) return { nome: anterior.name, email: anterior.email, celular: anterior.phone ?? "", foto: anterior.avatar_data, version: anterior.version };
    const [atualizado] = linhas<{ version: number }>(await tx.execute(sql`UPDATE atendeia_users SET name=${dados.nome},phone=${dados.celular || null},avatar_data=${dados.foto},
      version=version+1,updated_at=now(),modified_by=${sessao.userId}
      WHERE id=${sessao.userId} AND version=${dados.version} AND enabled=true AND is_deleted=false RETURNING version`));
    if (!atualizado) throw new ErroDeNegocio("Seu cadastro mudou em outra sessão. Recarregue a página.");
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields,details)
      VALUES (${sessao.userId},'perfil_atualizado','usuario',${sessao.userId},${JSON.stringify(campos)}::jsonb,'{}'::jsonb)`);
    return { nome: dados.nome, email: anterior.email, celular: dados.celular, foto: dados.foto, version: atualizado.version };
  });
}
