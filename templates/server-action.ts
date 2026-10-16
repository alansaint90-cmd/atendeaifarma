/**
 * TEMPLATE-OURO: Server Actions de uma entidade (CRUD centralizado).
 * Copie para src/lib/actions/<entidade>.ts. TODA a regra da entidade mora aqui;
 * telas so chamam estas funcoes.
 *
 * Cada action: sessao -> permissao -> Zod -> transacao (mutacao + auditoria)
 * -> revalidatePath. Server Action e um POST alcancavel direto: valide tudo.
 */
"use server";

import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ErroDeNegocio, executar } from "@/lib/acao";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { exigirPermissao } from "@/lib/auth/permissoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { db } from "@/lib/db";
import { contratosLancamentos as tabela } from "@/lib/db/schema/contratos-lancamentos";
import { MSG_COLISAO, marcaDeExclusao, travaDeColisao, vivos } from "@/lib/db/soft-delete";
import {
  idSchema,
  instanteSchema,
  lancamentoEdicaoSchema,
  lancamentoSchema,
} from "@/lib/validators/contratos-lancamentos";

const NOME_TABELA = "contratos_lancamentos";
const ROTA = "/lancamentos";

/** Leitura para Server Component: lanca em falha (cai no error.tsx). */
export async function listar() {
  const sessao = await exigirSessao();
  await exigirPermissao(sessao, "visualizador");
  return db.select().from(tabela).where(vivos(tabela)).orderBy(desc(tabela.created_at));
}

export async function criar(dados: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "operador");
    // Campo a campo: nunca espalhe o corpo da requisicao sobre a linha.
    const { contrato_id, descricao, valor } = lancamentoSchema.parse(dados);

    const criado = await db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(tabela)
        .values({ contrato_id, descricao, valor, modified_by: sessao.userId })
        .returning();
      await registrarAuditoria(tx, {
        userId: sessao.userId,
        acao: "criar",
        tabela: NOME_TABELA,
        registroId: linha.id,
        detalhes: `Criou lancamento "${linha.descricao}"`,
        dadosNovos: linha,
      });
      return linha;
    });
    revalidatePath(ROTA);
    return criado;
  });
}

/** `updatedAtOriginal` = o `updated_at` que a tela recebeu ao abrir o registro. */
export async function atualizar(id: unknown, dados: unknown, updatedAtOriginal: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "operador");
    const alvo = idSchema.parse(id);
    const versao = instanteSchema.parse(updatedAtOriginal);
    const { descricao, valor } = lancamentoEdicaoSchema.parse(dados);

    const atualizado = await db.transaction(async (tx) => {
      const [anterior] = await tx.select().from(tabela).where(travaDeColisao(tabela, alvo, versao));
      if (!anterior) throw new ErroDeNegocio(MSG_COLISAO);

      const [linha] = await tx
        .update(tabela)
        .set({ descricao, valor, updated_at: new Date(), modified_by: sessao.userId })
        .where(travaDeColisao(tabela, alvo, versao))
        .returning();
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);

      await registrarAuditoria(tx, {
        userId: sessao.userId,
        acao: "atualizar",
        tabela: NOME_TABELA,
        registroId: alvo,
        detalhes: `Alterou lancamento "${anterior.descricao}"`,
        dadosAnteriores: anterior,
        dadosNovos: linha,
      });
      return linha;
    });
    revalidatePath(ROTA);
    return atualizado;
  });
}

/** Soft delete, com a mesma trava de colisao da edicao. */
export async function excluir(id: unknown, updatedAtOriginal: unknown) {
  return executar(async () => {
    const sessao = await exigirSessao();
    await exigirPermissao(sessao, "admin");
    const alvo = idSchema.parse(id);
    const versao = instanteSchema.parse(updatedAtOriginal);

    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(tabela)
        .set(marcaDeExclusao(sessao.userId))
        .where(travaDeColisao(tabela, alvo, versao))
        .returning();
      if (!linha) throw new ErroDeNegocio(MSG_COLISAO);

      await registrarAuditoria(tx, {
        userId: sessao.userId,
        acao: "excluir",
        tabela: NOME_TABELA,
        registroId: alvo,
        detalhes: `Excluiu (logico) lancamento "${linha.descricao}"`,
        dadosAnteriores: linha,
      });
    });
    revalidatePath(ROTA);
    return { id: alvo };
  });
}
