import { z } from "zod";
import { ErroDeNegocio } from "../acao";
import { ProviderError } from "../agent/providers";
import type { AgentConfig } from "../agent/config";

export const LIMITE_MIDIA_MANUAL=2*1024*1024;
export const midiaManualSchema=z.strictObject({tipo:z.enum(["image","audio"]),mime:z.enum(["image/jpeg","image/png","image/webp","audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav"]),base64:z.string().min(4).max(Math.ceil(LIMITE_MIDIA_MANUAL/3)*4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)});
export type MidiaManual=z.infer<typeof midiaManualSchema>;
export function validarMidiaManual(entrada:unknown):MidiaManual{
  const v=midiaManualSchema.parse(entrada),b=Buffer.from(v.base64,"base64");
  const prefixo=(hex:string)=>b.subarray(0,hex.length/2).toString("hex")===hex;
  const assinatura=v.mime==="image/jpeg"?prefixo("ffd8ff"):v.mime==="image/png"?prefixo("89504e470d0a1a0a"):v.mime==="image/webp"?b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP":v.mime==="audio/webm"?prefixo("1a45dfa3"):v.mime==="audio/ogg"?prefixo("4f676753"):v.mime==="audio/mp4"?b.toString("ascii",4,8)==="ftyp":v.mime==="audio/wav"?b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WAVE":prefixo("494433")||(b[0]===255&&(b[1]&224)===224);
  if(!b.length||b.length>LIMITE_MIDIA_MANUAL||b.toString("base64")!==v.base64||!v.mime.startsWith(`${v.tipo}/`)||!assinatura)throw new ErroDeNegocio("Arquivo inválido. Envie uma imagem ou áudio válido de até 2 MB.");
  return v;
}
export async function enviarMidiaManual(config:Pick<AgentConfig,"EVOLUTION_API_URL"|"EVOLUTION_API_KEY"|"EVOLUTION_INSTANCE_NAME">,numero:string,midia:MidiaManual,texto:string,request=fetch){
  validarMidiaManual(midia);
  if(!/^[1-9]\d{6,14}$/.test(numero))throw new ProviderError("envio_invalido");
  const caminho=midia.tipo==="audio"?"sendWhatsAppAudio":"sendMedia";
  const corpo=midia.tipo==="audio"?{number:numero,audio:midia.base64,encoding:true}:{number:numero,mediatype:"image",mimetype:midia.mime,media:midia.base64,caption:texto,fileName:`imagem.${midia.mime.split("/")[1]}`};
  let r:Response;
  try{r=await request(`${config.EVOLUTION_API_URL.replace(/\/$/,"")}/message/${caminho}/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`,{method:"POST",headers:{apikey:config.EVOLUTION_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(corpo),redirect:"error",signal:AbortSignal.timeout(45000)});}catch{throw new ProviderError("evolution_envio_incerto");}
  if(!r.ok)throw new ProviderError(`evolution_http_${r.status}`);
  const p=z.object({key:z.object({id:z.string().min(1).max(200)})}).safeParse(await r.json().catch(()=>null));
  if(!p.success)throw new ProviderError("evolution_confirmacao_ausente");return p.data.key.id;
}
