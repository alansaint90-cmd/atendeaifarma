import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import { atorCrm } from "../crm/acesso";
import type { SessaoAtiva } from "./permissoes";
import { auditarIdentidade, limitarAuth } from "./repositorio";
import { conferirSenha, novaSenha, prepararSenha } from "./senhas";
import { revogarAcessos } from "./usuarios";

export async function mudarSenha(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown, request = fetch) {
  const dados = z.strictObject({ atual: z.string().max(256), nova: novaSenha }).parse(entrada);
  await limitarAuth(banco, `troca-senha:${sessao.userId}`, 5);
  const [usuario] = linhas<{ hash: string | null }>(await banco.execute(sql`SELECT password_hash AS hash FROM atendeia_users
    WHERE id=${sessao.userId} AND enabled=true AND is_deleted=false`));
  if (!usuario || (usuario.hash ? !await conferirSenha(dados.atual, usuario.hash) : dados.atual !== "")) {
    throw new ErroDeNegocio("Não foi possível alterar a senha. Confira a senha atual.");
  }
  const preparada = await prepararSenha(dados.nova, request);
  await banco.transaction(async tx => {
    await atorCrm(tx, sessao);
    const linhasAtualizadas = linhas(await tx.execute(sql`UPDATE atendeia_users SET password_hash=${preparada.hash},version=version+1,updated_at=now(),modified_by=${sessao.userId}
      WHERE id=${sessao.userId} AND is_deleted=false AND password_hash IS NOT DISTINCT FROM ${usuario.hash} RETURNING id`));
    if (!linhasAtualizadas.length) throw new ErroDeNegocio("A senha mudou em outra sessão. Entre novamente.");
    await auditarIdentidade(tx, sessao.userId, "senha_alterada");
    await revogarAcessos(tx, sessao.userId, sessao.userId);
  });
  return { aviso: preparada.aviso };
}
