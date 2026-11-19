import { z } from "zod";
export const LIMITE_ARQUIVO = 2 * 1024 * 1024;
export const tiposArquivo = ["image/jpeg", "image/png", "audio/mpeg", "audio/ogg", "application/pdf"] as const;
export const arquivoCampanha = z.strictObject({ nome: z.string().trim().min(1).max(120).regex(/^[^<>\x00-\x1f/\\]+$/u), tipo: z.enum(tiposArquivo), base64: z.string().min(4).max(Math.ceil(LIMITE_ARQUIVO / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/u) });
export const campanhaSchema = z.strictObject({ id: z.uuid(), nome: z.string().trim().min(1).max(120), intervaloSegundos: z.number().int("Use segundos inteiros.").min(5, "O intervalo mínimo é de 5 segundos.").max(3600, "O intervalo máximo é de 3600 segundos.").default(10), instancia: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}_. -]+$/u), mensagem: z.string().trim().max(6000), arquivo: arquivoCampanha.nullable(), contatos: z.array(z.uuid()).min(1, "Selecione ao menos um contato.").max(5000).refine(ids => new Set(ids).size === ids.length, "Contatos duplicados.") }).refine(d => Boolean(d.mensagem || d.arquivo), "Escreva uma mensagem ou anexe um arquivo.").refine(d=>!d.arquivo||d.arquivo.tipo.startsWith("audio/")||d.mensagem.length<=1024,"A legenda do anexo deve ter até 1024 caracteres.");
export type ArquivoCampanha = z.infer<typeof arquivoCampanha>;
export type DadosCampanha = z.input<typeof campanhaSchema>;
export interface ContatoCampanha { id: string; nome: string; telefone: string }
export interface Campanha { intervaloSegundos: number; id: string; nome: string; instancia: string; mensagem: string; arquivoNome: string | null; status: "rascunho" | "ativa" | "cancelada"; version: number; total: number; pendentes: number; enviados: number; incertos: number; bloqueados: number }
export const identidadeCampanha = z.strictObject({ id: z.uuid(), version: z.number().int().min(0) });
export const statusDestinatario: Record<string,string> = { pendente: "Pendente", enviando: "Em envio", enviado: "Enviado", incerto: "Verificar entrega", bloqueado: "Bloqueado", cancelado: "Cancelado" };
export function validarArquivo(arquivo: ArquivoCampanha | null) {
 if (!arquivo) return;
 const bytes = Buffer.from(arquivo.base64, "base64");
 if (bytes.length > LIMITE_ARQUIVO || bytes.toString("base64") !== arquivo.base64) throw new Error("Arquivo inválido ou maior que 2 MB.");
 const valido = arquivo.tipo === "image/png" ? bytes.subarray(0,8).toString("hex") === "89504e470d0a1a0a"
 : arquivo.tipo === "image/jpeg" ? bytes.subarray(0,3).toString("hex") === "ffd8ff"
 : arquivo.tipo === "application/pdf" ? bytes.subarray(0,5).toString() === "%PDF-"
 : arquivo.tipo === "audio/ogg" ? bytes.subarray(0,4).toString() === "OggS"
 : bytes.subarray(0,3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
 if (!valido) throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");
}
