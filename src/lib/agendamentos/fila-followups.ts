import { randomUUID } from "node:crypto";
import { z } from "zod";
import type Redis from "ioredis";
import { agentKeys } from "../agent/redis";
import { digest } from "../agent/message";
import { followupQueue } from "../followups/queue";
import { followupDaInstancia } from "../evolution/instancias";
import type { IntegrationSettings } from "../settings/schema";
import { ErroDeNegocio } from "../acao";
import type { MensagemFila, AlvoFila, AcaoFila } from "./fila-schema";
const prefix="atendeia:{evolution}:followup:";
const arquivo="atendeia:{evolution}:followups-admin-arquivo";
const auditoria="atendeia:{evolution}:followups-admin-auditoria";
const jobSchema=z.object({instance:z.string().optional(),conversation:z.string(),identity:z.string(),number:z.string().regex(/^[1-9]\d{6,14}$/),started:z.number(),index:z.number().int().min(0).max(2),due:z.number().min(0).max(253402300799000),revision:z.string(),status:z.enum(["aguardando","enviando"])});
export async function listarFilaFollowups(client:Redis,settings:IntegrationSettings):Promise<MensagemFila[]> {
 const conversas=await client.zrange(followupQueue,"0","-1");
 const raws=conversas.length?await client.mget(...conversas.map(c=>prefix+c)):[];
 const itens:MensagemFila[]=[];
 for(const raw of raws){
  if(!raw)continue;let parsed;try{parsed=jobSchema.safeParse(JSON.parse(raw));}catch{continue;}if(!parsed.success)continue;
  const job=parsed.data;const instancia=job.instance??settings.EVOLUTION_INSTANCE_NAME??"";const config=followupDaInstancia(settings,instancia);
  itens.push({origem:"followup",id:job.conversation,versao:digest(raw),data:new Date(job.due).toISOString(),telefone:"+"+job.number,instancia,mensagem:job.revision===config.revision?config.steps[job.index].text:"Configuração alterada: o processador não enviará esta versão.",status:job.status==="enviando"?"enviando":"pendente",origemNome:`Follow-up · etapa ${job.index+1}`,lixeira:false,previsao:false});
 }
 for(const [id,raw] of Object.entries(await client.hgetall(arquivo))){try{const item=JSON.parse(raw) as MensagemFila;itens.push({...item,id,versao:digest(raw)});}catch{continue;}}
 return itens;
}
export async function modificarFilaFollowup(client:Redis,alvo:AlvoFila,acao:AcaoFila,snapshot:MensagemFila,autor="sistema") {
 const token=randomUUID();
 if(!await client.set(agentKeys.lock,token,"PX",30000,"NX"))throw new ErroDeNegocio("O processador está concluindo um envio. Atualize e tente novamente.");
 try{
  if(alvo.id.startsWith("arquivo:")){
   const raw=await client.hget(arquivo,alvo.id);if(!raw||digest(raw)!==alvo.versao)throw new ErroDeNegocio("O follow-up mudou. Atualize a lista.");
   const item=JSON.parse(raw) as MensagemFila;
   if(acao==="cancelar"||(acao==="restaurar"?!item.lixeira:item.lixeira))throw new ErroDeNegocio("Operação não disponível para esse follow-up.");
   if(await client.eval("if redis.call('GET',KEYS[1]) ~= ARGV[1] or redis.call('HGET',KEYS[2],ARGV[2]) ~= ARGV[3] then return 0 end redis.call('HSET',KEYS[2],ARGV[2],ARGV[4]); redis.call('XADD',KEYS[3],'*','autor',ARGV[5],'acao',ARGV[6],'registro',ARGV[2]); return 1",3,agentKeys.lock,arquivo,auditoria,token,alvo.id,raw,JSON.stringify({...item,lixeira:acao==="lixeira"}),autor,acao)!==1)throw new ErroDeNegocio("O registro mudou. Atualize a lista.");return;
  }
  const raw=await client.get(prefix+alvo.id);if(!raw||digest(raw)!==alvo.versao)throw new ErroDeNegocio("O follow-up mudou ou já foi processado. Atualize a lista.");
  const job=jobSchema.parse(JSON.parse(raw));
  if(job.status==="enviando")throw new ErroDeNegocio("Esse follow-up já está em envio. Confira o resultado antes de alterar.");
  if(acao==="restaurar")throw new ErroDeNegocio("O follow-up não está na lixeira.");
  const id="arquivo:"+digest(raw);
  const salvo=JSON.stringify({...snapshot,id,status:"cancelado",lixeira:acao==="lixeira"});
  const script="if redis.call('GET',KEYS[1]) ~= ARGV[1] or redis.call('GET',KEYS[2]) ~= ARGV[2] then return 0 end redis.call('HSET',KEYS[4],ARGV[4],ARGV[5]); redis.call('DEL',KEYS[2]); redis.call('ZREM',KEYS[3],ARGV[3]); redis.call('XADD',KEYS[5],'*','autor',ARGV[6],'acao',ARGV[7],'registro',ARGV[4]); return 1";
  if(await client.eval(script,5,agentKeys.lock,prefix+alvo.id,followupQueue,arquivo,auditoria,token,raw,alvo.id,id,salvo,autor,acao)!==1)throw new ErroDeNegocio("O follow-up mudou. Atualize a lista.");
 }finally{await client.eval("if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end",1,agentKeys.lock,token);}
}
