import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import type { SessaoAtiva } from "../auth/permissoes";
import { ErroDeNegocio } from "../acao";
import { novoFunil, novoMotivo, versaoCrm } from "./validacao";
import { atorCrm, auditarCrm, escopoFunil } from "./acesso";
import { motivosPerda } from "../db/schema/crm";
import { travaDeColisao, MSG_COLISAO } from "../db/soft-delete";

export async function criarFunil(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = novoFunil.parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "admin");
    const [funil] = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_funis(nome,modified_by) VALUES (${dados.nome},${ator.userId}) RETURNING id`));
    for (const [ordem, nome] of dados.etapas.entries()) await tx.execute(sql`INSERT INTO atendeia_funis_etapas(funil_id,nome,ordem,modified_by) VALUES (${funil.id},${nome},${ordem},${ator.userId})`);
    await auditarCrm(tx, ator, funil.id, "funil_criado", ["nome", "etapas"]); return funil.id;
  });
}
export async function criarMotivo(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = novoMotivo.parse(entrada);
  return banco.transaction(async tx => { const ator = await atorCrm(tx, sessao, "admin");
    const [motivo] = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_motivos_perda(nome,modified_by) VALUES (${dados.nome},${ator.userId}) RETURNING id`));
    await auditarCrm(tx, ator, motivo.id, "motivo_criado", ["nome"]); return motivo.id;
  });
}
export async function alterarMotivo(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = versaoCrm.extend({ nome: z.string().trim().min(1).max(120), excluir: z.boolean() }).parse(entrada);
  return banco.transaction(async tx => { const ator = await atorCrm(tx, sessao, "admin");
    const alterado = linhas(await tx.execute(sql`UPDATE atendeia_motivos_perda SET nome=${dados.nome},is_deleted=${dados.excluir},
      deleted_at=${dados.excluir ? new Date() : null},updated_at=clock_timestamp(),modified_by=${ator.userId}
      WHERE ${travaDeColisao(motivosPerda, dados.id, new Date(dados.updatedAt))} RETURNING id`));
    if (!alterado.length) throw new ErroDeNegocio(MSG_COLISAO);
    await auditarCrm(tx, ator, dados.id, dados.excluir ? "motivo_excluido" : "motivo_alterado", ["nome"]);
  });
}
export async function definirAcessos(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = z.strictObject({ usuarioId: z.uuid(), version: z.number().int().nonnegative(), funis: z.array(z.uuid()).max(100), motivo: z.string().trim().min(5).max(500) }).parse(entrada);
  return banco.transaction(async tx => { const ator = await atorCrm(tx, sessao, "admin");
    // Serializa as mudanças de acesso; os leitores também bloqueiam a linha do usuário.
    const [alvo] = linhas<{ role: string; version: number }>(await tx.execute(sql`SELECT role,version FROM atendeia_users WHERE id=${dados.usuarioId} AND is_deleted=false FOR UPDATE`));
    if (!alvo || alvo.role === "super_admin" || alvo.role === "admin") throw new ErroDeNegocio("Selecione um atendente ou visualizador.");
    if (alvo.version !== dados.version) throw new ErroDeNegocio(MSG_COLISAO);
    const antes = linhas<{ funil_id: string }>(await tx.execute(sql`SELECT funil_id FROM atendeia_funis_acessos WHERE usuario_id=${dados.usuarioId} AND is_deleted=false`)).map(a => a.funil_id);
    for (const id of dados.funis) if (!linhas(await tx.execute(sql`SELECT id FROM atendeia_funis WHERE id=${id} AND is_deleted=false`)).length) throw new ErroDeNegocio("Funil indisponível.");
    await tx.execute(sql`UPDATE atendeia_funis_acessos SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${ator.userId} WHERE usuario_id=${dados.usuarioId} AND is_deleted=false`);
    for (const id of new Set(dados.funis)) await tx.execute(sql`INSERT INTO atendeia_funis_acessos(funil_id,usuario_id,modified_by) VALUES (${id},${dados.usuarioId},${ator.userId})`);
    await tx.execute(sql`UPDATE atendeia_users SET version=version+1,updated_at=now(),modified_by=${ator.userId} WHERE id=${dados.usuarioId}`);
    await auditarCrm(tx, ator, dados.usuarioId, "acesso_funis_alterado", ["funis"], { motivo: dados.motivo, antes, depois: [...new Set(dados.funis)] });
  });
}
export async function catalogoCrm(banco: BancoSql, sessao: SessaoAtiva) {
  return banco.transaction(async tx => { const ator = await atorCrm(tx, sessao);
    const funis = linhas<{ id: string; nome: string }>(await tx.execute(sql`SELECT id,nome FROM atendeia_funis WHERE is_deleted=false AND ${escopoFunil(ator, sql`atendeia_funis.id`)} ORDER BY nome`));
    const etapas = linhas<{ id: string; funilId: string; nome: string; ordem: number }>(await tx.execute(sql`SELECT e.id,e.funil_id AS "funilId",e.nome,e.ordem FROM atendeia_funis_etapas e JOIN atendeia_funis f ON f.id=e.funil_id WHERE e.is_deleted=false AND f.is_deleted=false AND ${escopoFunil(ator, sql`f.id`)} ORDER BY e.ordem`));
    const motivos = linhas<{ id: string; nome: string; updatedAt: string }>(await tx.execute(sql`SELECT id,nome,updated_at AS "updatedAt" FROM atendeia_motivos_perda WHERE is_deleted=false ORDER BY nome`));
    const usuarios = linhas<{ id: string; nome: string; papel: string; version: number }>(await tx.execute(sql`SELECT id,name AS nome,role AS papel,version FROM atendeia_users WHERE is_deleted=false AND enabled=true ORDER BY name`));
    const tags = linhas<{ id: string; nome: string; cor: string }>(await tx.execute(sql`SELECT id,name AS nome,color AS cor FROM atendeia_tags WHERE is_deleted=false ORDER BY name`));
    return { funis, etapas, motivos: motivos.map(m => ({ ...m, updatedAt: new Date(m.updatedAt).toISOString() })), usuarios, tags, administrador: ["super_admin", "admin"].includes(ator.papel), podeEditar: ator.papel !== "visualizador" };
  });
}
