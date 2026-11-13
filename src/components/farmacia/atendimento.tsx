"use client";
import { useRef,useState } from "react";
import Link from "next/link";
import { assumirAtendimento,enviarMensagemManual,validarCanalAtendimento } from "@/lib/actions/atendimento-farmacia";
import { AnexoManual } from "./anexo-manual";
import type { MidiaManual } from "@/lib/farmacia/midia-manual";
export function AtendimentoManual({id,atualizar}:{id:string;atualizar:()=>void}) {
  const [texto,setTexto]=useState("");const [erro,setErro]=useState("");const [ocupado,setOcupado]=useState(false);
  const [chave,setChave]=useState(()=>crypto.randomUUID());
  const [midia,setMidia]=useState<MidiaManual|null>(null),[gravando,setGravando]=useState(false);const enviando=useRef(false);
  const assumir=async(assumir:boolean)=>{setOcupado(true);try{const r=await assumirAtendimento({id,assumir});setErro(r.ok?assumir?"Conversa assumida. A IA está pausada.":"Conversa devolvida à IA. A pausa de segurança de mensagens manuais ainda pode estar ativa.":r.erro);atualizar();}catch{setErro("Não foi possível alterar o atendimento. Confira a conexão e tente novamente.");}finally{setOcupado(false);}};
  const validar=async()=>{setOcupado(true);try{const r=await validarCanalAtendimento(id);setErro(r.ok?r.dados:r.erro);}catch{setErro("Não foi possível validar o canal. Tente novamente.");}finally{setOcupado(false);}};
  return <div className="farmacia atendimento-manual"><div className="farmacia-toolbar"><button disabled={ocupado||gravando} onClick={()=>void assumir(true)}>Assumir conversa</button><button disabled={ocupado||gravando} onClick={()=>void assumir(false)}>Devolver à IA</button><button disabled={ocupado||gravando} onClick={()=>void validar()}>Validar canal</button><Link href="/?view=pedidos">Pedidos</Link></div>
    {erro&&<p role="status">{erro}</p>}<AnexoManual key={chave} ocupado={ocupado} alterar={setMidia} avisar={setErro} aoGravar={setGravando}/>
    <form onSubmit={e=>{e.preventDefault();if(enviando.current||gravando)return;enviando.current=true;setOcupado(true);const entrada=midia?{id,texto,chave,midia}:{id,texto,chave};void enviarMensagemManual(entrada).then(r=>{if(r.ok){setTexto("");setMidia(null);setChave(crypto.randomUUID());setErro("Mensagem enviada.");atualizar();}else setErro(r.erro);}).catch(()=>setErro("Resultado incerto. Confira o histórico antes de reenviar.")).finally(()=>{enviando.current=false;setOcupado(false);});}}>
      <label>{midia?.tipo==="image"?"Legenda da imagem":"Mensagem do atendente"}<textarea rows={2} placeholder={midia?.tipo==="audio"?"O áudio é enviado separado do texto":"Digite sua mensagem"} disabled={ocupado||gravando} value={texto} maxLength={midia?1024:4000} required={!midia} onChange={e=>setTexto(e.target.value)}/></label><button className="primary" disabled={ocupado||gravando||(!texto.trim()&&!midia)|| (midia?.tipo==="audio"&&!!texto.trim())} type="submit">Enviar pelo WhatsApp</button>
    </form>{midia?.tipo==="audio"&&texto.trim()&&<p role="status">Envie ou apague o texto antes de enviar o áudio.</p>}</div>;
}
