import { z } from "zod";
import { administradorHttp } from "@/lib/auth/acesso-http";
import { origemHttpPermitida } from "@/lib/auth/origem-http";
import { db } from "@/lib/db/client";
import { executar } from "@/lib/acao";
import { consultarProdutos, salvarProduto, entradaEstoque, ajustarEstoque, historicoProduto } from "@/lib/farmacia/catalogo";
import { criarPedido, executarPedido } from "@/lib/farmacia/pedidos";
import { listarPedidos, painelFarmacia } from "@/lib/farmacia/consultas";

export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
type Contexto={params:Promise<{recurso:string}>};
export async function GET(req:Request,{params}:Contexto) {
  const acesso=await administradorHttp("operador"); if(acesso.erro)return json({erro:"Não autorizado."},acesso.erro);
  const {recurso}=await params;const q=new URL(req.url).searchParams;
  const r=await executar(async()=>{
    if(recurso==="produtos")return consultarProdutos(db(),acesso.sessao,{termo:q.get("termo")??"",categoria:q.get("categoria")??"",disponibilidade:q.get("disponibilidade")??"todos",ordenar:q.get("ordenar")??"nome",pagina:Number(q.get("pagina")??1)});
    if(recurso==="pedidos")return listarPedidos(db(),acesso.sessao,{status:q.get("status")??"",pagina:Number(q.get("pagina")??1),...(q.has("id")?{id:q.get("id")}: {})});
    if(recurso==="historico")return historicoProduto(db(),acesso.sessao,q.get("produtoId"));
    if(recurso==="dashboard")return painelFarmacia(db(),acesso.sessao);
    return null;
  });return json(r,r.ok ? (r.dados===null ? 404 : 200):400);
}
export async function POST(req:Request,{params}:Contexto) {
  const acesso=await administradorHttp("operador");if(acesso.erro)return json({erro:"Não autorizado."},acesso.erro);
  if(!origemHttpPermitida(req))return json({erro:"Origem não autorizada."},403);
  if(req.headers.get("content-type")?.split(";")[0]!=="application/json")return json({erro:"Envie JSON."},415);
  const {recurso}=await params;
  const r=await executar(async()=>{
    const reader=req.body?.getReader();const decoder=new TextDecoder();let texto="",tamanho=0;
    if(reader)while(true){const parte=await reader.read();if(parte.done)break;tamanho+=parte.value.byteLength;if(tamanho>65536){await reader.cancel();throw new Error("Corpo excedido");}texto+=decoder.decode(parte.value,{stream:true});}
    texto+=decoder.decode();
    const v:unknown=JSON.parse(texto);z.record(z.string(),z.unknown()).parse(v);
    if(recurso==="produtos")return salvarProduto(db(),acesso.sessao,v);
    if(recurso==="entradas")return entradaEstoque(db(),acesso.sessao,v);
    if(recurso==="ajustes")return ajustarEstoque(db(),acesso.sessao,v);
    if(recurso==="pedidos")return criarPedido(db(),acesso.sessao,v);
    if(recurso==="pedido-acoes")return executarPedido(db(),acesso.sessao,v);
    return null;
  });return json(r,r.ok ? (r.dados===null ? 404 : 200):400);
}
