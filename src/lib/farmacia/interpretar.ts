import { z } from "zod";
import type { AgentConfig } from "../agent/config";
import { ProviderError, type Turn } from "../agent/providers";
import { instrucoesInterpretacaoFarmacia } from "./prompt";
import { pagamentoSchema } from "./pagamento";
const acoes=["buscar","criar_pedido","reservar","consultar_pedido","humano","saudacao","esclarecer","adicionar","finalizar","pagamento"] as const;
export const intencaoSchema=z.strictObject({acao:z.enum(acoes),pagamento:pagamentoSchema.nullable().default(null),
  termo:z.string().max(120),pedidoId:z.string().max(36),campo:z.enum(["","produto","concentracao","apresentacao","quantidade","escolha"]).default(""),itens:z.array(z.strictObject({produtoId:z.uuid(),quantidade:z.number().int().min(1).max(10000)})).max(50)});
export interface ContextoFarmacia { conversaId:string;contatoId:string;produtos:{id:string;nome:string;concentracao:string;apresentacao:string}[];pedidos:{id:string;numero:string;status:string;etapa?:string;pagamento?:string|null}[] }
export async function interpretarIntencao(config:AgentConfig,historico:Turn[],texto:string,contexto:ContextoFarmacia,request=fetch) {
  const properties={acao:{type:"string",enum:acoes},pagamento:{anyOf:[{type:"null"},{type:"object",properties:{forma:{type:"string",enum:["pix","dinheiro","cartao"]},troco:{type:"string",enum:["pendente","nao","sim"]},valor:{type:"string"}},required:["forma","troco","valor"],additionalProperties:false}]},termo:{type:"string"},pedidoId:{type:"string"},campo:{type:"string",enum:["","produto","concentracao","apresentacao","quantidade","escolha"]},itens:{type:"array",items:{type:"object",properties:{produtoId:{type:"string"},quantidade:{type:"integer"}},required:["produtoId","quantidade"],additionalProperties:false}}};
  let response:Response;
  try { response=await request("https://api.openai.com/v1/responses",{method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${config.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:config.OPENAI_MODEL,store:false,max_output_tokens:900,parallel_tool_calls:false,tool_choice:{type:"function",name:"atender_farmacia"},
      tools:[{type:"function",name:"atender_farmacia",strict:true,parameters:{type:"object",properties,required:Object.keys(properties),additionalProperties:false},description:"Seleciona operação comercial. Não confirma pagamento nem valida receita."}],
      instructions:instrucoesInterpretacaoFarmacia(config.AI_SYSTEM_PROMPT??""),
      input:[{role:"developer",content:JSON.stringify(contexto)},...historico.slice(-8).map(t=>({role:t.role,content:t.content})),{role:"user",content:texto}]})});
  }catch{throw new ProviderError("openai_conexao");}
  if(!response.ok)throw new ProviderError(`openai_http_${response.status}`);
  const envelope=z.object({status:z.literal("completed"),output:z.array(z.object({type:z.string(),name:z.string().optional(),arguments:z.string().optional()}))}).parse(await response.json());
  const chamadas=envelope.output.filter(i=>i.type==="function_call");
  if(chamadas.length!==1||chamadas[0].name!=="atender_farmacia")throw new ProviderError("farmacia_acao_invalida");
  return intencaoSchema.parse(JSON.parse(chamadas[0].arguments??"null"));
}
