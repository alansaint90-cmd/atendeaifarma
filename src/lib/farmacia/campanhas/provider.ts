import { z } from "zod";
import { sendReply, ProviderError } from "../../agent/providers";
import type { AgentConfig } from "../../agent/config";
import type { EnvioCampanha } from "./repository";
import { validarArquivo } from "./schema";
export async function enviarCampanha(config: Pick<AgentConfig,"EVOLUTION_API_URL"|"EVOLUTION_API_KEY"|"EVOLUTION_INSTANCE_NAME">, item: EnvioCampanha, request = fetch,permitido:()=>Promise<boolean>=async()=>true) {
 const arquivo = item.arquivo;
 validarArquivo(arquivo);if(!await permitido())throw new ProviderError("campanha_destinatario_indisponivel");
 if (!arquivo) return sendReply(config,item.telefone.slice(1),item.mensagem,request);
 const audio = arquivo.tipo.startsWith("audio/");
 if (audio && item.mensagem) await sendReply(config,item.telefone.slice(1),item.mensagem,request);
 if(!await permitido())throw new ProviderError("campanha_destinatario_indisponivel");
 const endpoint = audio ? "sendWhatsAppAudio" : "sendMedia";
 const body = audio ? { number:item.telefone.slice(1),audio:arquivo.base64,encoding:true } : { number:item.telefone.slice(1),mediatype:arquivo.tipo.startsWith("image/") ? "image" : "document",mimetype:arquivo.tipo,fileName:arquivo.nome,caption:item.mensagem,media:arquivo.base64 };
 let response: Response;
 try { response = await request(config.EVOLUTION_API_URL.replace(/\/$/,"")+"/message/"+endpoint+"/"+encodeURIComponent(config.EVOLUTION_INSTANCE_NAME),{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),headers:{apikey:config.EVOLUTION_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)}); }
 catch { throw new ProviderError("campanha_envio_incerto"); }
 if (!response.ok) throw new ProviderError("campanha_http_"+response.status);
 const parsed = z.object({key:z.object({id:z.string().min(1).max(200)})}).safeParse(await response.json().catch(()=>null));
 if (!parsed.success) throw new ProviderError("campanha_confirmacao_ausente");
 return parsed.data.key.id;
}
