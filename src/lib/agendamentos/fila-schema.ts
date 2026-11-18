import { z } from "zod";
export const alvoFila = z.strictObject({origem:z.enum(["individual","campanha","followup"]),id:z.string().min(1).max(200).regex(/^[a-zA-Z0-9:_-]+$/),versao:z.string().min(1).max(100)}).refine(v=>v.origem==="followup"?/^(arquivo:)?[a-f0-9]{64}$/.test(v.id)&&/^[a-f0-9]{64}$/.test(v.versao):z.uuid().safeParse(v.id).success&&/^\d+$/.test(v.versao),"Registro de fila inválido.");
export const operacaoFila = z.strictObject({acao:z.enum(["cancelar","lixeira","restaurar"]),alvos:z.array(alvoFila).min(1).max(5000)}).refine(d=>new Set(d.alvos.map(a=>a.origem+":"+a.id)).size===d.alvos.length,"Seleção duplicada.");
export type AlvoFila = z.infer<typeof alvoFila>;
export type AcaoFila = z.infer<typeof operacaoFila>["acao"];
export interface MensagemFila extends AlvoFila {data:string;telefone:string;instancia:string;mensagem:string;status:string;origemNome:string;lixeira:boolean;previsao:boolean;}
export const statusFila:Record<string,string>={pendente:"Pendente",enviando:"Em envio",enviado:"Enviado",cancelado:"Cancelado",incerto:"Verificar entrega",erro:"Erro",bloqueado:"Bloqueado"};
