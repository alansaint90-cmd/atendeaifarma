import { ErroDeNegocio } from "@/lib/acao";
import { PAPEIS, type Papel } from "@/lib/db/schema/_enums";
import type { TransacaoSql } from "../db/porta";

export interface SessaoAtiva {
  userId: string;
  papel: Papel;
}

/**
 * UNICA checagem de permissao do projeto: o papel da sessao alcanca o papel
 * minimo exigido? (`PAPEIS` vai do maior para o menor privilegio.)
 * A matriz "qual papel minimo para cada acao" fica em docs/rbac.md.
 */
export function temPermissao(sessao: SessaoAtiva | null, papelMinimo: Papel): boolean {
  if (!sessao) return false;
  const atual = PAPEIS.indexOf(sessao.papel);
  const minimo = PAPEIS.indexOf(papelMinimo);
  return atual >= 0 && minimo >= 0 && atual <= minimo;
}

export async function exigirPermissao(sessao: SessaoAtiva, papelMinimo: Papel, banco?: TransacaoSql): Promise<void> {
  if (!temPermissao(sessao, papelMinimo)) {
    const { auditarIdentidade } = await import("./repositorio");
    await auditarIdentidade(banco ?? (await import("../db/client")).db(), sessao.userId, "acesso_403");
    throw new ErroDeNegocio("Sem permissao para esta acao.");
  }
}
