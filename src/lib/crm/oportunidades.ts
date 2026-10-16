import { sql } from "drizzle-orm";
import { z } from "zod";
import { linhas, type BancoSql } from "../db/porta";
import type { SessaoAtiva } from "../auth/permissoes";
import { ErroDeNegocio } from "../acao";
import { novaOportunidade, fecharOportunidade, versaoCrm } from "./validacao";
import { atorCrm, auditarCrm, exigirFunil, escopoFunil } from "./acesso";
import { oportunidades } from "../db/schema/crm";
import { travaDeColisao, MSG_COLISAO } from "../db/soft-delete";

export async function criarOportunidade(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = novaOportunidade.parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "operador"); await exigirFunil(tx, ator, dados.funilId);
    if (!linhas(await tx.execute(sql`SELECT id FROM atendeia_funis_etapas WHERE id=${dados.etapaId} AND funil_id=${dados.funilId} AND is_deleted=false`)).length) throw new ErroDeNegocio("Etapa inválida para este funil.");
    const responsavel = await atorCrm(tx, { userId: dados.responsavelId, papel: "visualizador" }, "operador");
    await exigirFunil(tx, responsavel, dados.funilId);
    if (dados.contatoId && !linhas(await tx.execute(sql`SELECT id FROM atendeia_contacts WHERE id=${dados.contatoId} AND is_deleted=false`)).length) throw new ErroDeNegocio("Contato indisponível.");
    if (dados.canalId && !linhas(await tx.execute(sql`SELECT id FROM atendeia_channels WHERE id=${dados.canalId} AND is_deleted=false`)).length) throw new ErroDeNegocio("Canal indisponível.");
    const [item] = linhas<{ id: string }>(await tx.execute(sql`INSERT INTO atendeia_funis_oportunidades(titulo,valor,funil_id,etapa_id,responsavel_id,contato_id,canal_id,modified_by)
      VALUES (${dados.titulo},${dados.valor},${dados.funilId},${dados.etapaId},${dados.responsavelId},${dados.contatoId},${dados.canalId},${ator.userId}) RETURNING id`));
    for (const tag of new Set(dados.tags)) {
      if (!linhas(await tx.execute(sql`SELECT id FROM atendeia_tags WHERE id=${tag} AND is_deleted=false`)).length) throw new ErroDeNegocio("Tag indisponível.");
      await tx.execute(sql`INSERT INTO atendeia_funis_oportunidades_tags(oportunidade_id,tag_id,modified_by) VALUES (${item.id},${tag},${ator.userId})`);
    }
    await auditarCrm(tx, ator, item.id, "oportunidade_criada", ["titulo", "valor", "funil", "etapa", "responsavel", "tags"]); return item.id;
  });
}

export async function encerrarOportunidade(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = fecharOportunidade.parse(entrada);
  return banco.transaction(async tx => {
    const ator = await atorCrm(tx, sessao, "operador");
    if (linhas(await tx.execute(sql`SELECT id FROM atendeia_pedidos WHERE oportunidade_id=${dados.id} AND is_deleted=false`)).length) throw new ErroDeNegocio("Esta negociação é controlada pelo pedido. Confirme ou cancele na seção Pedidos.");
    const [anterior] = linhas<{ id: string; funil_id: string; etapa_id: string; responsavel_id: string; valor: string }>(await tx.execute(sql`
      SELECT * FROM atendeia_funis_oportunidades WHERE ${travaDeColisao(oportunidades, dados.id, new Date(dados.updatedAt))}
      AND status='aberta' AND ${escopoFunil(ator, sql`atendeia_funis_oportunidades.funil_id`)} FOR UPDATE`));
    if (!anterior) throw new ErroDeNegocio(MSG_COLISAO);
    await exigirFunil(tx, ator, anterior.funil_id);
    let motivo: string | null = null;
    if (dados.motivoId) {
      const [item] = linhas<{ nome: string }>(await tx.execute(sql`SELECT nome FROM atendeia_motivos_perda WHERE id=${dados.motivoId} AND is_deleted=false FOR SHARE`));
      if (!item) throw new ErroDeNegocio("Motivo indisponível."); motivo = item.nome;
    }
    await tx.execute(sql`UPDATE atendeia_funis_oportunidades SET status=${dados.status},fechado_em=clock_timestamp(),motivo_id=${dados.motivoId},
      observacao=${dados.observacao || null},updated_at=clock_timestamp(),modified_by=${ator.userId} WHERE id=${dados.id}`);
    await tx.execute(sql`INSERT INTO atendeia_funis_oportunidades_fechamentos(oportunidade_id,funil_id,etapa_anterior_id,responsavel_id,valor,status,motivo,observacao,modified_by)
      VALUES (${dados.id},${anterior.funil_id},${anterior.etapa_id},${anterior.responsavel_id},${anterior.valor},${dados.status},${motivo},${dados.observacao || null},${ator.userId})`);
    await auditarCrm(tx, ator, dados.id, `oportunidade_${dados.status}`, ["status", "fechado_em", "motivo", "observacao"]);
  });
}
export async function moverOportunidade(banco: BancoSql, sessao: SessaoAtiva, entrada: unknown) {
  const dados = versaoCrm.extend({ etapaId: z.uuid() }).parse(entrada);
  return banco.transaction(async tx => { const ator = await atorCrm(tx, sessao, "operador");
    const alterado = linhas(await tx.execute(sql`UPDATE atendeia_funis_oportunidades SET etapa_id=${dados.etapaId},updated_at=clock_timestamp(),modified_by=${ator.userId}
      WHERE ${travaDeColisao(oportunidades, dados.id, new Date(dados.updatedAt))} AND status='aberta' AND ${escopoFunil(ator, sql`atendeia_funis_oportunidades.funil_id`)}
      AND EXISTS(SELECT 1 FROM atendeia_funis f WHERE f.id=atendeia_funis_oportunidades.funil_id AND f.is_deleted=false)
      AND EXISTS(SELECT 1 FROM atendeia_funis_etapas e WHERE e.id=${dados.etapaId} AND e.funil_id=atendeia_funis_oportunidades.funil_id AND e.is_deleted=false) RETURNING id`));
    if (!alterado.length) throw new ErroDeNegocio(MSG_COLISAO);
    await auditarCrm(tx, ator, dados.id, "oportunidade_movida", ["etapa_id"]);
  });
}
