import { administradorHttp } from "@/lib/auth/acesso-http";
import { db } from "@/lib/db/client";
import { recuperarFotoConversa } from "@/lib/farmacia/foto-conversa";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer" };

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const acesso=await administradorHttp("operador");
  if(acesso.erro)return new Response(null,{status:acesso.erro,headers});
  try {
    const {id}=await params;
    const foto=await recuperarFotoConversa(db(),acesso.sessao,id);
    if(foto)return new Response(null,{status:302,headers:{...headers,Location:foto}});
  } catch {
    // Mantém o avatar com iniciais quando a foto ou a integração estiver indisponível.
  }
  return new Response(null,{status:404,headers});
}
