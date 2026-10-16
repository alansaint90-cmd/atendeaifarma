import type { Transacao } from "@/lib/db";
import { auditoria } from "@/lib/db/schema/auditoria";

export type AcaoAuditada = "criar" | "atualizar" | "excluir";

interface RegistroDeAuditoria {
  userId: string;
  acao: AcaoAuditada;
  tabela: string;
  registroId: string;
  detalhes: string;
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
}

/**
 * Grava a trilha DENTRO da transacao da mutacao: ou as duas coisas acontecem,
 * ou nenhuma. Nunca registre senha, hash, token ou OTP em `dados_*`.
 */
export async function registrarAuditoria(tx: Transacao, r: RegistroDeAuditoria) {
  await tx.insert(auditoria).values({
    user_id: r.userId,
    acao: r.acao,
    tabela: r.tabela,
    registro_id: r.registroId,
    detalhes: r.detalhes,
    dados_anteriores: r.dadosAnteriores ?? null,
    dados_novos: r.dadosNovos ?? null,
  });
}
