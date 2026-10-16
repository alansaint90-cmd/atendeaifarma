"use client";
import { useState } from "react";
import Link from "next/link";
import { assumirAtendimento,enviarMensagemManual } from "@/lib/actions/atendimento-farmacia";
export function AtendimentoManual({id,atualizar}:{id:string;atualizar:()=>void}) {
  const [texto,setTexto]=useState("");const [erro,setErro]=useState("");const [ocupado,setOcupado]=useState(false);
  const [chave,setChave]=useState(()=>crypto.randomUUID());
  const assumir=async(assumir:boolean)=>{setOcupado(true);try{const r=await assumirAtendimento({id,assumir});setErro(r.ok?assumir?"Conversa assumida. A IA está pausada.":"Conversa devolvida à IA. A pausa de segurança de mensagens manuais ainda pode estar ativa.":r.erro);atualizar();}finally{setOcupado(false);}};
  return <div className="farmacia"><div className="farmacia-toolbar"><button disabled={ocupado} onClick={()=>void assumir(true)}>Assumir conversa</button><button disabled={ocupado} onClick={()=>void assumir(false)}>Devolver à IA</button><Link href="/?view=pedidos">Pedidos</Link></div>
    {erro&&<p role="status">{erro}</p>}<form onSubmit={e=>{e.preventDefault();setOcupado(true);void enviarMensagemManual({id,texto,chave}).then(r=>{if(r.ok){setTexto("");setChave(crypto.randomUUID());setErro("Mensagem enviada.");atualizar();}else setErro(r.erro);}).catch(()=>setErro("Resultado incerto. Confira o histórico antes de reenviar.")).finally(()=>setOcupado(false));}}>
      <label>Mensagem do atendente<textarea value={texto} maxLength={4000} required onChange={e=>setTexto(e.target.value)}/></label><button className="primary" disabled={ocupado||!texto.trim()} type="submit">Enviar pelo WhatsApp</button>
    </form></div>;
}
