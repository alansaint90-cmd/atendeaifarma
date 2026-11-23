"use client";
import { useEffect,useRef,useState } from "react";
import Link from "next/link";
import { alterarPausaAtendimento,assumirAtendimento,enviarMensagemManual,validarCanalAtendimento } from "@/lib/actions/atendimento-farmacia";
import { AnexoManual } from "./anexo-manual";
import type { MidiaManual } from "@/lib/farmacia/midia-manual";
import { MenuCompositor,IconeCompositor } from "./menu-compositor";
export function AtendimentoManual({id,version,comEquipe,atualizar}:{id:string;version?:number;comEquipe?:boolean;atualizar:()=>void|Promise<void>}) {
  const [texto,setTexto]=useState("");const [erro,setErro]=useState("");const [ocupado,setOcupado]=useState(false);
  const [chave,setChave]=useState(()=>crypto.randomUUID());
  const [midia,setMidia]=useState<MidiaManual|null>(null),[gravando,setGravando]=useState(false);const enviando=useRef(false);
  const [aviso,setAviso]=useState("");const campo=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(!aviso)return;const timer=setTimeout(()=>setAviso(""),4000);return()=>clearTimeout(timer);},[aviso]);
  const assumir=async(assumir:boolean)=>{setOcupado(true);setErro("");setAviso("");try{const r=await assumirAtendimento({id,assumir});if(r.ok)setAviso(assumir?"Conversa assumida. A IA está pausada.":"Conversa devolvida à IA.");else setErro(r.erro);atualizar();}catch{setErro("Não foi possível alterar o atendimento. Confira a conexão e tente novamente.");}finally{setOcupado(false);}};
  const alterarPausa=async(pausar:boolean)=>{
    if(version===undefined)return;
    setOcupado(true);setErro("");setAviso("");
    try {
      const resultado=await alterarPausaAtendimento({id,version,pausar});
      if(!resultado.ok)setErro(resultado.erro);
      else if(pausar)setAviso("IA pausada nesta conversa.");
      else setAviso(comEquipe?"Pausa removida. Use Devolver à IA para liberar a conversa da equipe.":"Pausa da IA removida nesta conversa.");
      await atualizar();
    } catch {setErro("Não foi possível alterar a pausa da IA. Tente novamente.");}
    finally {setOcupado(false);}
  };
  const validar=async()=>{setOcupado(true);try{const r=await validarCanalAtendimento(id);setErro(r.ok?r.dados:r.erro);}catch{setErro("Não foi possível validar o canal. Tente novamente.");}finally{setOcupado(false);}};
  return <div className="farmacia atendimento-manual"><div className="compositor-acoes">
    <MenuCompositor rotulo="Ações do atendimento" icone={<IconeCompositor tipo="acoes"/>} desabilitado={ocupado||gravando}>{fechar=><>
      <button type="button" onClick={()=>{fechar();void assumir(true);}}>Assumir conversa</button>
      <button type="button" onClick={()=>{fechar();void assumir(false);}}>Devolver à IA</button>
      {version!==undefined&&<>
        <button type="button" onClick={()=>{fechar();void alterarPausa(true);}}>Pausar IA</button>
        <button type="button" onClick={()=>{fechar();void alterarPausa(false);}}>Despausar IA</button>
      </>}
      <button type="button" onClick={()=>{fechar();void validar();}}>Validar canal</button><Link href="/?view=pedidos">Pedidos</Link>
    </>}</MenuCompositor>
    {aviso&&<span className="compositor-aviso" role="status">{aviso}</span>}</div>
    {erro&&<p role="status">{erro}</p>}
    <form onSubmit={e=>{e.preventDefault();if(enviando.current||gravando||(!texto.trim()&&!midia)||(midia?.tipo==="audio"&&!!texto.trim()))return;enviando.current=true;setOcupado(true);const entrada=midia?{id,texto,chave,midia}:{id,texto,chave};void enviarMensagemManual(entrada).then(r=>{if(r.ok){setTexto("");setMidia(null);setChave(crypto.randomUUID());setErro("");setAviso("Mensagem enviada.");atualizar();}else setErro(r.erro);}).catch(()=>setErro("Resultado incerto. Confira o histórico antes de reenviar.")).finally(()=>{enviando.current=false;setOcupado(false);});}}>
      <AnexoManual key={chave} ocupado={ocupado} alterar={setMidia} avisar={setErro} aoGravar={setGravando} podeEnviar={!!texto.trim()||!!midia} bloquearEnvio={midia?.tipo==="audio"&&!!texto.trim()} emoji={valor=>{const el=campo.current,inicio=el?.selectionStart??texto.length,fim=el?.selectionEnd??texto.length;if(texto.length-(fim-inicio)+valor.length>(midia?1024:4000))return;setTexto(texto.slice(0,inicio)+valor+texto.slice(fim));queueMicrotask(()=>{el?.focus();el?.setSelectionRange(inicio+valor.length,inicio+valor.length);});}}>
        <textarea ref={campo} aria-label={midia?.tipo==="image"?"Legenda da imagem":"Mensagem do atendente"} rows={1} placeholder="Digite uma mensagem" disabled={ocupado||gravando} value={texto} maxLength={midia?1024:4000} required={!midia} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
      </AnexoManual>
    </form>{midia?.tipo==="audio"&&texto.trim()&&<p role="status">Envie ou apague o texto antes de enviar o áudio.</p>}</div>;
}
