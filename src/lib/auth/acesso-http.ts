import { obterSessao } from "./sessao";
import { temPermissao } from "./permissoes";
import { auditarIdentidade } from "./repositorio";
import { db } from "../db/client";
import type { Papel } from "../db/schema/_enums";

export async function administradorHttp(papelMinimo: Papel = "super_admin") {
  const sessao = await obterSessao();
  if (!sessao) return { erro: 401 as const };
  if (!temPermissao(sessao, papelMinimo)) {
    await auditarIdentidade(db(), sessao.userId, "acesso_403");
    return { erro: 403 as const };
  }
  return { sessao };
}
