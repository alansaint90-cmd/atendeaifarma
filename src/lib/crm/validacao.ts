import { z } from "zod";
import { STATUS_OPORTUNIDADE } from "../db/schema/_enums";
const id = z.uuid();
const nome = z.string().trim().min(1, "Informe um nome.").max(120);
export const novoFunil = z.strictObject({ nome, etapas: z.array(nome).min(1).max(30).refine(itens => new Set(itens.map(v => v.toLowerCase())).size === itens.length, "Etapas repetidas.") });
export const novoMotivo = z.strictObject({ nome });
export const versaoCrm = z.strictObject({ id, updatedAt: z.iso.datetime() });
export const novaOportunidade = z.strictObject({ titulo: nome, valor: z.string().regex(/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/, "Use valor como 1500.00."),
  funilId: id, etapaId: id, responsavelId: id, contatoId: id.nullable().default(null), canalId: id.nullable().default(null), tags: z.array(id).max(30).default([]) });
export const fecharOportunidade = versaoCrm.extend({ status: z.enum(["ganha", "perdida"]), motivoId: id.nullable(), observacao: z.string().trim().max(2000).default("") })
  .refine(v => v.status === "perdida" ? !!v.motivoId : !v.motivoId, "Selecione o motivo somente para perdas.");
export const filtrosCrm = z.strictObject({ funilId: id.optional(), etapaId: id.optional(), responsavelId: id.optional(), canalId: id.optional(),
  status: z.enum(STATUS_OPORTUNIDADE).optional(), motivoId: id.optional(), tags: z.array(id).max(30).default([]),
  criadoDe: z.iso.datetime().optional(), criadoAte: z.iso.datetime().optional(), fechadoDe: z.iso.datetime().optional(), fechadoAte: z.iso.datetime().optional(),
  pagina: z.number().int().min(1).max(10000).default(1) });
export type FiltrosCrm = z.infer<typeof filtrosCrm>;
