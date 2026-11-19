"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarFilaMensagens, alterarFilaMensagens } from "@/lib/actions/fila-mensagens";
import { statusFila, type MensagemFila, type AcaoFila } from "@/lib/agendamentos/fila-schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
import { MenuFila } from "./menu-fila";
import { AgendamentosPage } from "./page";
const formatar=(iso:string)=>new Date(iso).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const chave=(m:MensagemFila)=>m.origem+":"+m.id;
const podeCancelar=(m:MensagemFila)=>!m.lixeira&&m.status==="pendente";
const podeMover=(m:MensagemFila)=>m.status!=="enviando";
export function CentralMensagensPage({ativoNaTela=true}:{ativoNaTela?:boolean}){
 const [individuais,setIndividuais]=useState(false);
 const [itens,setItens]=useState<MensagemFila[]|null>(null),[avisos,setAvisos]=useState<string[]>([]),[ativo,setAtivo]=useState(false),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(""),[mensagem,setMensagem]=useState("");
 const [busca,setBusca]=useState(""),[status,setStatus]=useState(""),[origem,setOrigem]=useState(""),[lixeira,setLixeira]=useState(false),[pagina,setPagina]=useState(0),[selecao,setSelecao]=useState<string[]>([]);
 const [confirmacao,setConfirmacao]=useState<{acao:AcaoFila;itens:MensagemFila[]}|null>(null);
 const carregar=useCallback(async()=>{setOcupado(true);setErro("");try{const r=await carregarFilaMensagens();if(!r.ok){setItens(null);setErro(r.erro);return;}setItens(r.dados.itens);setAvisos(r.dados.avisos);setAtivo(r.dados.ativo);}catch{setItens(null);setErro("Não foi possível carregar a fila. Tente atualizar.");}finally{setOcupado(false);}},[]);
 useEffect(()=>{if(!ativoNaTela)return;const timer=setTimeout(()=>void carregar(),0);return()=>clearTimeout(timer);},[ativoNaTela,carregar]);
 const filtrados=(itens??[]).filter(i=>i.lixeira===lixeira&&(!status||i.status===status)&&(!origem||i.origem===origem)&&`${i.telefone} ${i.instancia} ${i.mensagem} ${i.origemNome}`.toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
 const selecionados=filtrados.filter(i=>selecao.includes(chave(i)));
 const atual=Math.min(pagina,Math.max(0,Math.ceil(filtrados.length/20)-1));
 function preparar(acao:AcaoFila,lista:MensagemFila[]){const alvos=lista.filter(i=>acao==="cancelar"?podeCancelar(i):podeMover(i));if(!alvos.length){setErro("Nenhum envio elegível para essa operação.");return;}setConfirmacao({acao,itens:alvos});}
 async function confirmar(){if(!confirmacao)return;setOcupado(true);setErro("");let alterados=0,naoAlterados=0,erroOperacao="";const avisosLote=new Set<string>();
  try{for(let inicio=0;inicio<confirmacao.itens.length;inicio+=5000){
   try{const r=await alterarFilaMensagens({acao:confirmacao.acao,alvos:confirmacao.itens.slice(inicio,inicio+5000).map(({id,origem,versao})=>({id,origem,versao}))});
    if(!r.ok){erroOperacao=r.erro;break;}alterados+=r.dados.alterados;naoAlterados+=r.dados.naoAlterados;r.dados.avisos.forEach(a=>avisosLote.add(a));
   }catch{erroOperacao="Conexão interrompida. Atualize a fila para conferir os resultados antes de repetir a operação.";break;}
  }
  const semConfirmacao=confirmacao.itens.length-alterados-naoAlterados;
  await carregar();setSelecao([]);setErro(erroOperacao);setMensagem(`${alterados} registro(s) alterado(s). ${naoAlterados} não alterado(s).${semConfirmacao?` ${semConfirmacao} sem confirmação; confira a fila.`:""} ${[...avisosLote].join(" ")}`);
  }finally{setOcupado(false);setConfirmacao(null);}
 }
 function limpar(){setPagina(0);setSelecao([]);}
 const verbos={cancelar:"Cancelar envio",lixeira:"Mover para a lixeira",restaurar:"Restaurar registro"};
 if(individuais)return <div className="page-stack"><button className="secondary" onClick={()=>{setIndividuais(false);void carregar();}}>Voltar à central unificada</button><AgendamentosPage ativoNaTela={ativoNaTela}/></div>;
 return <div className="page-stack"><section className="page-head"><div><h1>Mensagens agendadas</h1><p>Acompanhe campanhas, follow-ups e envios individuais na mesma fila.</p></div><div className="feature-actions"><button className="primary" disabled={ocupado} onClick={()=>setIndividuais(true)}>+ Novo agendamento</button><button className="secondary" disabled={ocupado} onClick={()=>void carregar()}>Atualizar lista</button><button className="secondary" aria-pressed={lixeira} onClick={()=>{setLixeira(!lixeira);limpar();}}>{lixeira?"Voltar à lista":"Lixeira"}</button></div></section>
  {erro&&<p role="alert" className="error-message">{erro}</p>}{mensagem&&<p role="status">{mensagem}</p>}{avisos.map(a=><p role="status" key={a} className="followup-note">{a}</p>)}
  {!itens&&!erro&&<p role="status">Carregando fila de mensagens…</p>}
  {itens&&<article className="panel"><div className="page-head"><div className="agendamento-filtros"><label>Buscar<input placeholder="Telefone, chip, mensagem ou campanha" value={busca} onChange={e=>{setBusca(e.target.value);limpar();}}/></label>
   <label>Status<select value={status} onChange={e=>{setStatus(e.target.value);limpar();}}><option value="">Todos</option>{Object.entries(statusFila).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   <label>Origem<select value={origem} onChange={e=>{setOrigem(e.target.value);limpar();}}><option value="">Todas</option><option value="campanha">Campanhas</option><option value="followup">Follow-ups</option><option value="individual">Individuais</option></select></label></div>
   <MenuFila rotulo="Opções da lista">
    {!lixeira&&<><button disabled={ocupado||!selecionados.some(podeCancelar)} onClick={()=>preparar("cancelar",selecionados)}>Cancelar selecionadas ({selecionados.filter(podeCancelar).length})</button><button disabled={ocupado||!filtrados.some(podeCancelar)||!!avisos.length} onClick={()=>preparar("cancelar",filtrados)}>Cancelar todas deste filtro</button></>}
    <button disabled={ocupado||!selecionados.some(podeMover)} onClick={()=>preparar(lixeira?"restaurar":"lixeira",selecionados)}>{lixeira?"Restaurar selecionadas":"Mover selecionadas para a lixeira"}</button>
    <button disabled={ocupado||!filtrados.some(podeMover)||!!avisos.length} onClick={()=>preparar(lixeira?"restaurar":"lixeira",filtrados)}>{lixeira?"Restaurar todas deste filtro":"Mover todas deste filtro para a lixeira"}</button>
   </MenuFila></div>
   {!ativo&&<p className="followup-note">Processador desativado no servidor. A fila é exibida, mas os envios dependem da ativação.</p>}
   <p aria-live="polite">{lixeira?"Lixeira · ":""}{filtrados.length} registros · {selecionados.length} selecionados</p>
   <div className="table fila-tabela"><table><colgroup><col style={{width:40}}/><col style={{width:150}}/><col style={{width:140}}/><col style={{width:90}}/><col/><col style={{width:115}}/><col style={{width:155}}/><col style={{width:60}}/></colgroup><thead><tr><th><input type="checkbox" aria-label="Selecionar todas deste filtro" checked={!!filtrados.length&&filtrados.every(i=>selecao.includes(chave(i)))} onChange={e=>setSelecao(e.target.checked?filtrados.map(chave):[])}/></th><th>Data e hora</th><th>Telefone</th><th>Chip</th><th>Mensagem</th><th>Status</th><th>Origem</th><th><span className="sr-only">Opções</span></th></tr></thead>
    <tbody>{filtrados.slice(atual*20,atual*20+20).map(i=><tr key={chave(i)}><td><input type="checkbox" aria-label={`Selecionar ${i.origemNome} para ${i.telefone}`} checked={selecao.includes(chave(i))} onChange={e=>setSelecao(e.target.checked?[...selecao,chave(i)]:selecao.filter(k=>k!==chave(i)))}/></td><td>{formatar(i.data)}{i.previsao&&<small>Horário previsto</small>}</td><td>{i.telefone}</td><td>{i.instancia}</td><td className="agendamento-mensagem"><details><summary>{i.mensagem.slice(0,75)}{i.mensagem.length>75?"…":""}</summary><p className="campanha-texto">{i.mensagem}</p></details></td><td><span className="badge">{statusFila[i.status]??i.status}</span></td><td><strong>{i.origem==="campanha"?"Campanha":i.origem==="followup"?"Follow-up":"Individual"}</strong><small>{i.origemNome}</small></td>
     <td><MenuFila rotulo={`Opções de ${i.origemNome} para ${i.telefone}`}>{podeCancelar(i)&&<button disabled={ocupado} onClick={()=>preparar("cancelar",[i])}>Cancelar envio</button>}<button disabled={ocupado||!podeMover(i)} onClick={()=>preparar(lixeira?"restaurar":"lixeira",[i])}>{lixeira?"Restaurar registro":"Mover para a lixeira"}</button>{i.status==="enviando"&&<small>Envio já em andamento.</small>}</MenuFila></td></tr>)}</tbody></table></div>
   {!filtrados.length&&<p className="feature-empty">{lixeira?"A lixeira está vazia para estes filtros.":"Nenhuma mensagem encontrada. Campanhas aparecem após iniciar o envio; follow-ups aparecem quando entram na fila."}</p>}
   <div className="feature-pagination"><span>Página {atual+1} de {Math.max(1,Math.ceil(filtrados.length/20))}</span><button className="secondary" disabled={!atual} onClick={()=>setPagina(atual-1)}>Anterior</button><button className="secondary" disabled={(atual+1)*20>=filtrados.length} onClick={()=>setPagina(atual+1)}>Próxima</button></div>
   <p className="followup-note">Datas no fuso do navegador. Horários de campanha são previsões e podem mudar com a fila. Só a próxima etapa ativa de cada follow-up está agendada; cancelar esse registro encerra o acompanhamento atual. Restaurar da lixeira recupera a visualização e não reativa envios. Mensagens já enviadas não podem ser recolhidas.</p>
  </article>}
  <ModalConfirmacaoBlock aberto={!!confirmacao} titulo={confirmacao?verbos[confirmacao.acao]:"Alterar fila"} mensagem={`${confirmacao?verbos[confirmacao.acao]:"Alterar"}: ${confirmacao?.itens.length??0} registro(s) selecionado(s). ${confirmacao?.acao==="restaurar"?"Nenhum envio será reativado.":"Envios já iniciados não serão interrompidos. Para follow-ups, o acompanhamento atual será encerrado."}`} onConfirmar={()=>void confirmar()} onCancelar={()=>setConfirmacao(null)} carregando={ocupado}/>
 </div>;
}
