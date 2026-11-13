"use client";
/* eslint-disable @next/next/no-img-element -- Prévia local de arquivo selecionado, sem upload público. */
import { useEffect,useRef,useState,type ReactNode } from "react";
import { LIMITE_MIDIA_MANUAL,type MidiaManual } from "@/lib/farmacia/midia-manual";
import { MenuCompositor,IconeCompositor } from "./menu-compositor";

function Icone({tipo}:{tipo:"microfone"|"imagem"|"audio"}){
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tipo==="microfone"?<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>:tipo==="imagem"?<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>:<><path d="M9 18V5l12-2v13M9 8l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>}</svg>;
}
export function AnexoManual({ocupado,alterar,avisar,aoGravar,children,podeEnviar,bloquearEnvio=false,emoji}:{ocupado:boolean;alterar:(midia:MidiaManual|null)=>void;avisar:(texto:string)=>void;aoGravar:(valor:boolean)=>void;children:ReactNode;podeEnviar:boolean;bloquearEnvio?:boolean;emoji:(valor:string)=>void}){
  const imagem=useRef<HTMLInputElement>(null),audio=useRef<HTMLInputElement>(null),documento=useRef<HTMLInputElement>(null),gravador=useRef<MediaRecorder|null>(null),fluxo=useRef<MediaStream|null>(null);
  const ativo=useRef(true),descartar=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [gravando,setGravando]=useState(false),[previa,setPrevia]=useState<{url:string;tipo:string}|null>(null);
  const [lendo,setLendo]=useState(false);
  useEffect(()=>{aoGravar(gravando||lendo);},[aoGravar,gravando,lendo]);
  const parar=()=>{if(timer.current)clearTimeout(timer.current);fluxo.current?.getTracks().forEach(t=>t.stop());};
  useEffect(()=>{ativo.current=true;return()=>{ativo.current=false;descartar.current=true;if(gravador.current?.state==="recording")gravador.current.stop();if(timer.current)clearTimeout(timer.current);fluxo.current?.getTracks().forEach(t=>t.stop());};},[]);
  useEffect(()=>()=>{if(previa)URL.revokeObjectURL(previa.url);},[previa]);
  async function preparar(arquivo:Blob,tipo:MidiaManual["tipo"]){
    const mime=arquivo.type.split(";")[0];
    const formatos={image:["image/jpeg","image/png","image/webp"],audio:["audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav"],video:["video/mp4","video/webm"],document:["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]};
    if(!arquivo.size||arquivo.size>LIMITE_MIDIA_MANUAL||!formatos[tipo].includes(mime)){avisar("Escolha uma imagem JPG/PNG/WebP, vídeo MP4/WebM, documento PDF/DOCX ou áudio compatível de até 2 MB.");return;}
    setLendo(true);
    try{const base64=await new Promise<string>((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(String(leitor.result).split(",")[1]);leitor.onerror=reject;leitor.readAsDataURL(arquivo);});
      if(!ativo.current)return;alterar({tipo,mime:mime as MidiaManual["mime"],base64});setPrevia({url:URL.createObjectURL(arquivo),tipo});avisar("");
    }catch{if(ativo.current)avisar("Não foi possível ler o arquivo. Selecione novamente.");}finally{if(ativo.current)setLendo(false);}
  }
  async function gravar(){
    if(gravador.current?.state==="recording"){gravador.current.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){avisar("Este navegador não permite gravar. Use HTTPS e permita o microfone, ou anexe um áudio.");return;}
    setLendo(true);
    try{
      const mime=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime){avisar("Formato de gravação não suportado. Anexe um áudio.");return;}
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!ativo.current){stream.getTracks().forEach(t=>t.stop());return;}
      fluxo.current=stream;descartar.current=false;const partes:Blob[]=[];let tamanho=0;
      const r=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});gravador.current=r;
      r.ondataavailable=e=>{tamanho+=e.data.size;if(tamanho>LIMITE_MIDIA_MANUAL){descartar.current=true;avisar("O áudio excedeu 2 MB. Grave uma mensagem mais curta.");if(r.state==="recording")r.stop();}else partes.push(e.data);};
      r.onstop=()=>{parar();if(!ativo.current)return;setGravando(false);aoGravar(false);if(!descartar.current)void preparar(new Blob(partes,{type:mime}),"audio");};
      r.onerror=()=>{descartar.current=true;parar();if(ativo.current){setGravando(false);aoGravar(false);avisar("Não foi possível concluir a gravação. Tente novamente.");}};
      r.start(1000);setGravando(true);aoGravar(true);avisar("Gravando… Clique em Parar para ouvir antes de enviar. Limite: 60 segundos.");timer.current=setTimeout(()=>{if(r.state==="recording")r.stop();},60000);
    }catch{parar();if(ativo.current)avisar("Não foi possível acessar o microfone. Confira a permissão do navegador.");}finally{if(ativo.current)setLendo(false);}
  }
  return <div className="anexo-manual">
    {previa&&<div className="anexo-manual-previa">{previa.tipo==="image"?<img src={previa.url} alt="Imagem selecionada para enviar"/>:previa.tipo==="audio"?<audio src={previa.url} controls aria-label="Ouvir áudio antes de enviar"/>:previa.tipo==="video"?<video src={previa.url} controls aria-label="Vídeo selecionado para enviar"/>:<span>Documento selecionado · PDF/DOCX</span>}<button type="button" disabled={ocupado||gravando||lendo} onClick={()=>{setPrevia(null);alterar(null);}}>Remover anexo</button></div>}
    <div className="compositor-barra">
      <MenuCompositor rotulo="Adicionar anexo" icone={<IconeCompositor tipo="mais"/>} desabilitado={ocupado||lendo||gravando}>{fechar=><><button type="button" onClick={()=>{fechar();documento.current?.click();}}>Documento</button><button type="button" onClick={()=>{fechar();imagem.current?.click();}}>Fotos e vídeos</button><button type="button" onClick={()=>{fechar();audio.current?.click();}}>Áudio</button><small>Até 2 MB por arquivo</small></>}</MenuCompositor>
      <MenuCompositor rotulo="Inserir emoji" icone={<IconeCompositor tipo="emoji"/>} desabilitado={ocupado||lendo||gravando}>{fechar=><div className="compositor-emojis">{["😀","😊","👍","❤️","🙏","✅","👋","💊","📦","🚚","💜","🎉"].map(valor=><button type="button" key={valor} aria-label={`Inserir ${valor}`} onClick={()=>{emoji(valor);fechar();}}>{valor}</button>)}</div>}</MenuCompositor>
      {children}
      {podeEnviar&&!gravando?<button type="submit" className="compositor-enviar" aria-label="Enviar pelo WhatsApp" title="Enviar pelo WhatsApp" disabled={ocupado||lendo||bloquearEnvio}><IconeCompositor tipo="enviar"/></button>:<button type="button" aria-label={gravando?"Parar gravação":"Gravar áudio"} title={gravando?"Parar gravação":"Gravar áudio"} aria-pressed={gravando} disabled={ocupado||lendo} onClick={()=>void gravar()}><Icone tipo="microfone"/>{gravando&&"Parar"}</button>}
    </div>
    <input ref={imagem} type="file" hidden aria-label="Arquivo de imagem" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void preparar(f,f.type.startsWith("video/")?"video":"image");}}/>
    <input ref={audio} type="file" hidden aria-label="Arquivo de áudio" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void preparar(f,"audio");}}/>
    <input ref={documento} type="file" hidden aria-label="Arquivo de documento" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void preparar(f,"document");}}/>
  </div>;
}
