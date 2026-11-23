import { sql } from "drizzle-orm";
import { z } from "zod";
import { jsonLimitado } from "../agent/audio";
import type { SessaoAtiva } from "../auth/permissoes";
import { linhas, type BancoSql } from "../db/porta";
import { effectiveSettings } from "../settings/repository";
import { configurarCanalManual } from "./canal-manual";
import { autorizar } from "./comum";

type Canal = ReturnType<typeof configurarCanalManual>;
const perfilSchema=z.object({wuid:z.string().max(100).optional(),profilePictureUrl:z.string().max(2048).nullable()});

function fotoHttps(url:string|null) {
  if(!url||!URL.canParse(url))return null;
  const foto=new URL(url);
  const hostAutorizado=["whatsapp.net","fbcdn.net","fbsbx.com"].some(host=>foto.hostname===host||foto.hostname.endsWith(`.${host}`));
  return hostAutorizado&&foto.protocol==="https:"&&!foto.username&&!foto.password&&!foto.port?foto.href:null;
}

/** Armazena só URLs por um curto período e compartilha consultas simultâneas do mesmo contato. */
export function criarConsultaFoto(request:typeof fetch=fetch,agora=Date.now) {
  const cache=new Map<string,{ate:number;foto:Promise<string|null>}>();
  return async ({config,numero}:Canal) => {
    const chave=JSON.stringify([config.EVOLUTION_API_URL,config.EVOLUTION_INSTANCE_NAME,numero]);
    const entrada=cache.get(chave);
    if(entrada&&entrada.ate>agora())return entrada.foto;
    if(cache.size>=256) {
      const antiga=cache.keys().next().value;
      if(antiga!==undefined)cache.delete(antiga);
    }
    const foto=(async()=>{
      try {
        const resposta=await request(`${config.EVOLUTION_API_URL.replace(/\/$/,"")}/chat/fetchProfilePictureUrl/${encodeURIComponent(config.EVOLUTION_INSTANCE_NAME)}`,{
          method:"POST",headers:{apikey:config.EVOLUTION_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({number:numero}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
        });
        if(!resposta.ok)return null;
        const perfil=perfilSchema.safeParse(await jsonLimitado(resposta,8192));
        if(!perfil.success||(perfil.data.wuid&&perfil.data.wuid!==`${numero}@s.whatsapp.net`))return null;
        return fotoHttps(perfil.data.profilePictureUrl);
      } catch {return null;}
    })();
    cache.set(chave,{ate:agora()+120000,foto});
    return foto;
  };
}

const dependenciasPadrao={settings:effectiveSettings,consultarFoto:criarConsultaFoto()};

export async function recuperarFotoConversa(banco:BancoSql,ator:SessaoAtiva,entrada:unknown,dependencias=dependenciasPadrao) {
  const id=z.uuid().parse(entrada);
  const vinculo=()=>banco.transaction(async tx=>{
    await autorizar(tx,ator,"operador");
    return linhas<{instancia:string;jid:string;contatoId:string}>(await tx.execute(sql`
      SELECT ch.instance_name instancia,c.remote_jid jid,p.id "contatoId"
      FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id
      JOIN atendeia_contacts p ON p.id=c.contact_id
      WHERE c.id=${id} AND ch.provider='evolution' AND c.is_deleted=false AND ch.is_deleted=false AND p.is_deleted=false`))[0];
  });
  const conversa=await vinculo();
  if(!conversa||!/^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(conversa.jid))return null;
  const canal=configurarCanalManual(await dependencias.settings(),conversa.instancia,`+${conversa.jid.split("@")[0]}`);
  const url=await dependencias.consultarFoto(canal);
  if(!url)return null;
  const atual=await vinculo();
  if(atual?.contatoId!==conversa.contatoId||atual.instancia!==conversa.instancia||atual.jid!==conversa.jid)return null;
  return fotoHttps(url);
}
