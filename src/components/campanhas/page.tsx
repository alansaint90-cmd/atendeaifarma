"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { carregarCampanhas, gravarCampanha, iniciarCampanha, cancelarCampanha, detalharCampanha } from "@/lib/actions/campanhas";
import { LIMITE_ARQUIVO, tiposArquivo, statusDestinatario, type Campanha, type ContatoCampanha, type DadosCampanha } from "@/lib/farmacia/campanhas/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
type Detalhe = {id:string;nome:string;telefone:string;status:string;codigo:string|null};
export function CampanhasPage({ativoNaTela=true,aoVerAgendamentos}:{ativoNaTela?:boolean;aoVerAgendamentos?:()=>void}) {
 const [itens,setItens]=useState<Campanha[]>([]),[contatos,setContatos]=useState<ContatoCampanha[]>([]),[instancias,setInstancias]=useState<string[]>([]);
 const [instancia,setInstancia]=useState(""),[carregado,setCarregado]=useState(false),[ativo,setAtivo]=useState(false),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(""),[aviso,setAviso]=useState("");
 const [draft,setDraft]=useState<DadosCampanha|null>(null),[busca,setBusca]=useState(""),[confirmacao,setConfirmacao]=useState<{acao:"salvar"|"iniciar"|"cancelar";item?:Campanha}|null>(null),[detalhes,setDetalhes]=useState<Detalhe[]|null>(null);
 const requisicao=useRef(0),arquivoInput=useRef<HTMLInputElement>(null);
 const carregar=useCallback(async(chip?:string)=>{
  const numero=++requisicao.current;setOcupado(true);setErro("");
  try {const r=await carregarCampanhas(chip);if(numero!==requisicao.current)return;
   if(!r.ok){setItens([]);setContatos([]);setCarregado(false);setErro(r.erro);return;}setItens(r.dados.itens);setContatos(r.dados.contatos);setInstancias(r.dados.instancias);setInstancia(r.dados.instancia);setAtivo(r.dados.ativo);setCarregado(true);
  }catch{if(numero===requisicao.current){setItens([]);setContatos([]);setCarregado(false);setErro("Não foi possível carregar as campanhas.");}}finally{if(numero===requisicao.current)setOcupado(false);}
 },[]);
 useEffect(()=>{if(!ativoNaTela)return;const timer=setTimeout(()=>void carregar(),0);return()=>clearTimeout(timer);},[ativoNaTela,carregar]);
 async function anexar(file?:File){
  if(!file||!draft)return;setErro("");
  if(file.size>LIMITE_ARQUIVO||!tiposArquivo.includes(file.type as typeof tiposArquivo[number])){setErro("Use JPG, PNG, MP3, OGG ou PDF com até 2 MB.");if(arquivoInput.current)arquivoInput.current.value="";return;}
  try{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file);});setDraft(d=>d?{...d,arquivo:{nome:file.name,tipo:file.type as typeof tiposArquivo[number],base64}}:null);}catch{setErro("Não foi possível ler o arquivo.");}
 }
 async function confirmar(){
  if(!confirmacao)return;setOcupado(true);setErro("");
  try{const alvo=confirmacao.item;const r=confirmacao.acao==="salvar"?await gravarCampanha(draft):confirmacao.acao==="iniciar"?await iniciarCampanha({id:alvo!.id,version:alvo!.version}):await cancelarCampanha({id:alvo!.id,version:alvo!.version});
   if(!r.ok){setErro(r.erro);return;}setDraft(null);setAviso(confirmacao.acao==="salvar"?"Rascunho salvo. Revise a campanha e clique em Iniciar envio quando estiver pronto.":confirmacao.acao==="iniciar"?"Campanha iniciada. Acompanhe o resultado por contato.":"Os envios pendentes foram cancelados. Um envio já em andamento poderá terminar.");await carregar(instancia);
  }catch{setErro("Falha de conexão. Atualize a lista antes de tentar novamente.");}finally{setOcupado(false);setConfirmacao(null);}
 }
 const filtrados=contatos.filter(c=>(c.nome+" "+c.telefone).toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
 const selecionados=new Set(draft?.contatos??[]);
 return <div className="page-stack">
  <section className="page-head"><div><h1>Campanhas</h1><p>Converse novamente com quem já falou com sua equipe.</p></div><button className="primary" disabled={ocupado||!carregado||!instancias.length||!!draft} onClick={()=>{setBusca("");setAviso("");setDraft({id:crypto.randomUUID(),nome:"",instancia,mensagem:"",arquivo:null,contatos:[]});}}>+ Nova campanha</button></section>
  {erro&&<p role="alert" className="error-message">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
  {!carregado&&<p role="status">{ocupado?"Carregando campanhas…":"As campanhas ainda não foram carregadas."}</p>}
  {carregado&&!ativo&&<p role="status" className="followup-note">O processador está desativado. Você pode salvar rascunhos; os envios dependem da ativação no servidor.</p>}
  {draft&&<form className="panel campanha-editor" onSubmit={e=>{e.preventDefault();if(!draft.contatos.length){setErro("Selecione ao menos um contato.");return;}if(!draft.mensagem.trim()&&!draft.arquivo){setErro("Escreva uma mensagem ou anexe um arquivo.");return;}setConfirmacao({acao:"salvar"});}}>
   <div className="page-head"><div><h2>Nova campanha</h2><p>Prepare o conteúdo e escolha quem vai receber.</p></div><span className="badge">Rascunho</span></div>
   <div className="followup-grid"><label>Nome da campanha<input required maxLength={120} disabled={ocupado} value={draft.nome} onChange={e=>setDraft({...draft,nome:e.target.value})}/></label>
   <label>Chip de envio<select required value={draft.instancia} disabled={ocupado} onChange={e=>{setDraft({...draft,instancia:e.target.value,contatos:[]});setBusca("");void carregar(e.target.value);}}>{instancias.map(i=><option key={i}>{i}</option>)}</select></label></div>
   <label>Texto da mensagem<textarea rows={5} maxLength={6000} disabled={ocupado} placeholder="Escreva a mensagem da campanha" value={draft.mensagem} onChange={e=>setDraft({...draft,mensagem:e.target.value})}/></label>
   <label>Anexar arquivo<input ref={arquivoInput} type="file" accept={tiposArquivo.join(",")} disabled={ocupado} onChange={e=>void anexar(e.target.files?.[0])}/><small>Imagem JPG/PNG, áudio MP3/OGG ou documento PDF. Um arquivo de até 2 MB por campanha.</small></label>
   {draft.arquivo&&<div className="campanha-preview"><strong>{draft.arquivo.nome}</strong>
    {draft.arquivo.tipo.startsWith("image/")&&<Image unoptimized width={480} height={240} src={`data:${draft.arquivo.tipo};base64,${draft.arquivo.base64}`} alt="Prévia do anexo da campanha"/>}
    {draft.arquivo.tipo.startsWith("audio/")&&<audio controls src={`data:${draft.arquivo.tipo};base64,${draft.arquivo.base64}`}/>}
    <button className="secondary" type="button" disabled={ocupado} onClick={()=>{setDraft({...draft,arquivo:null});if(arquivoInput.current)arquivoInput.current.value="";}}>Remover anexo</button></div>}
   <fieldset className="campanha-contatos"><legend>Destinatários</legend><p>Somente contatos com mensagem recebida neste chip. Não é possível importar listas ou digitar números novos.</p>
    <div className="page-head"><label>Buscar contato<input value={busca} placeholder="Nome ou telefone da base" disabled={ocupado} onChange={e=>setBusca(e.target.value)}/></label><strong aria-live="polite">{selecionados.size} de {contatos.length} selecionados</strong></div>
    <div className="feature-actions"><button type="button" className="secondary" disabled={ocupado||!contatos.length} onClick={()=>setDraft({...draft,contatos:contatos.map(c=>c.id)})}>Selecionar todos ({contatos.length})</button><button type="button" className="secondary" disabled={ocupado||!selecionados.size} onClick={()=>setDraft({...draft,contatos:[]})}>Limpar seleção</button></div>
    <div className="campanha-lista">{filtrados.map(c=><label className="campanha-contato" key={c.id}><input type="checkbox" disabled={ocupado} checked={selecionados.has(c.id)} onChange={e=>setDraft({...draft,contatos:e.target.checked?[...draft.contatos,c.id]:draft.contatos.filter(id=>id!==c.id)})}/><span>{c.nome}<small>{c.telefone}</small></span></label>)}</div>
    {!filtrados.length&&<p>{contatos.length?"Nenhum contato encontrado para essa busca.":"Nenhum contato com conversa recebida neste chip."}</p>}
   </fieldset>
   <div className="campanha-preview"><h3>Prévia do texto</h3><p className="campanha-texto">{draft.mensagem||"Campanha apenas com anexo."}</p><small>O rascunho não envia mensagens. O envio começa apenas após sua confirmação em Iniciar envio.</small></div>
   <div className="feature-actions"><button className="primary" disabled={ocupado}>Salvar rascunho</button><button type="button" className="secondary" disabled={ocupado} onClick={()=>setDraft(null)}>Descartar rascunho</button></div>
  </form>}
  {carregado&&<article className="panel"><div className="page-head"><h2>Suas campanhas</h2><button className="secondary" disabled={ocupado} onClick={()=>void carregar(instancia)}>Atualizar resultados</button></div>
   {!itens.length?<p className="feature-empty">Nenhuma campanha criada. Comece em Nova campanha.</p>:<div className="table"><table><thead><tr><th>Campanha</th><th>Conteúdo</th><th>Status</th><th>Destinatários</th><th>Ações</th></tr></thead><tbody>{itens.map(c=><tr key={c.id}><td><strong>{c.nome}</strong><small>{c.instancia}</small></td><td><details><summary>{c.arquivoNome||c.mensagem.slice(0,60)}</summary><p className="campanha-texto">{c.mensagem}</p>{c.arquivoNome&&<p>Anexo: {c.arquivoNome}</p>}</details></td>
    <td><span className="badge">{c.status==="rascunho"?"Rascunho":c.status==="cancelada"?"Cancelada":c.pendentes?"Em andamento":c.incertos?"Concluída · verificar entregas":"Concluída"}</span></td><td>{c.enviados} enviados / {c.total}<small>{c.pendentes} pendentes · {c.incertos} a verificar · {c.bloqueados} bloqueados</small></td>
    <td><div className="feature-actions">{c.status==="rascunho"&&<button className="primary" disabled={ocupado||!ativo} onClick={()=>setConfirmacao({acao:"iniciar",item:c})}>Iniciar envio</button>}{c.status!=="cancelada"&&(c.status==="rascunho"||c.pendentes>0)&&<button className="secondary" disabled={ocupado} onClick={()=>setConfirmacao({acao:"cancelar",item:c})}>Cancelar campanha</button>}
    <button className="secondary" disabled={ocupado} onClick={async()=>{setOcupado(true);try{const r=await detalharCampanha(c.id);if(r.ok)setDetalhes(r.dados);else setErro(r.erro);}catch{setErro("Não foi possível carregar os destinatários.");}finally{setOcupado(false);}}}>Ver destinatários</button></div></td></tr>)}</tbody></table></div>}
   <p className="followup-note">Envios de campanhas são espaçados em pelo menos 10 segundos por chip. “Enviado” confirma aceitação pela Evolution, não leitura. Entregas incertas não são reenviadas automaticamente.</p>
   {aoVerAgendamentos&&<button type="button" className="secondary" onClick={aoVerAgendamentos}>Ver mensagens agendadas</button>}
  </article>}
  {detalhes&&<article className="panel"><div className="page-head"><h2>Resultado por contato</h2><button className="secondary" onClick={()=>setDetalhes(null)}>Fechar resultados</button></div><div className="table"><table><thead><tr><th>Contato</th><th>Telefone</th><th>Status</th></tr></thead><tbody>{detalhes.map(d=><tr key={d.id}><td>{d.nome}</td><td>{d.telefone}</td><td>{statusDestinatario[d.status]}{d.codigo&&<small>{d.codigo}</small>}</td></tr>)}</tbody></table></div></article>}
  <ModalConfirmacaoBlock aberto={!!confirmacao} titulo={confirmacao?.acao==="salvar"?"Salvar rascunho":confirmacao?.acao==="iniciar"?"Iniciar campanha":"Cancelar campanha"}
   mensagem={confirmacao?.acao==="salvar"?`Salvar “${draft?.nome}” para ${draft?.contatos.length} contatos? Nenhuma mensagem será enviada agora.`:confirmacao?.acao==="iniciar"?`Enviar “${confirmacao.item?.nome}” para ${confirmacao.item?.total} contatos pelo chip ${confirmacao.item?.instancia}? Confira o conteúdo antes de iniciar.`:"Cancelar todos os envios pendentes? Mensagens já enviadas não serão desfeitas, e um envio em andamento poderá terminar."}
   onConfirmar={()=>void confirmar()} onCancelar={()=>setConfirmacao(null)} carregando={ocupado}/>
 </div>;
}
