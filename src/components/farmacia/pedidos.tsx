"use client";
import { useCallback,useEffect,useState } from "react";
import { carregarPedidos,alterarPedido,carregarCadastrosFarmacia,salvarHabilitacao } from "@/lib/actions/farmacia";
import type { PedidoLista } from "@/lib/farmacia/consultas";
import { dinheiro,useConfirmacao } from "./comum";
import { PedidoForm } from "./pedido-form";
const nomes:Record<string,string>={novo:"Novo pedido",aguardando_confirmacao:"Aguardando confirmação",aguardando_pagamento:"Aguardando pagamento",pagamento_confirmado:"Pagamento confirmado",em_separacao:"Em separação",concluido:"Concluído",cancelado:"Cancelado"};
export function PedidosPage({gestor}:{gestor:boolean}) {
  const [dados,setDados]=useState<{pedidos:PedidoLista[];total:number}|null>(null);const [status,setStatus]=useState("");const [pagina,setPagina]=useState(1);
  const [erro,setErro]=useState("");const [novo,setNovo]=useState(false);const [id,setId]=useState("");const [referencia,setReferencia]=useState("");
  const [usuarios,setUsuarios]=useState<{id:string;nome:string;registro:string|null;habilitado:boolean|null}[]>([]);
  const carregar=useCallback(async()=>{const r=await carregarPedidos({status,pagina});if(r.ok){setDados(r.dados);setErro("");}else setErro(r.erro);},[status,pagina]);
  useEffect(()=>{const ini=setTimeout(()=>void carregar(),0);const timer=setInterval(()=>void carregar(),10000);return()=>{clearTimeout(ini);clearInterval(timer);};},[carregar]);
  useEffect(()=>{if(gestor)void carregarCadastrosFarmacia().then(r=>{if(r.ok)setUsuarios(r.dados.usuarios);});},[gestor]);
  const c=useConfirmacao(()=>{void carregar();setReferencia("");});const pedido=dados?.pedidos.find(p=>p.id===id);
  const acao=(p:PedidoLista,a:string,mensagem:string)=>{const chave=crypto.randomUUID();c.confirmar(mensagem,()=>alterarPedido({id:p.id,acao:a,chave,referencia}));};
  return <div className="page-stack farmacia"><header className="page-head"><div><h1>Pedidos</h1><p>Da escolha do produto à venda confirmada, com histórico de cada etapa.</p></div><button className="primary" onClick={()=>setNovo(true)}>+ Novo pedido</button></header>
    {(erro||c.erro)&&<p role="alert">{erro||c.erro}</p>}{novo&&<PedidoForm fechar={()=>setNovo(false)} salvo={()=>{setNovo(false);void carregar();}}/>}
    <section className="panel"><div className="farmacia-toolbar"><label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPagina(1);}}><option value="">Todos</option>{Object.entries(nomes).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><button className="secondary" onClick={()=>void carregar()}>Atualizar</button></div>
      {!dados&&!erro&&<p role="status">Consultando pedidos…</p>}{dados&&<>{!dados.pedidos.length?<p>Nenhum pedido encontrado.</p>:<div className="table"><table><thead><tr>{["Pedido","Cliente / WhatsApp","Total","Criado em","Status","Responsável / origem","Detalhes"].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{dados.pedidos.map(p=><tr key={p.id}><td>{p.numero}</td><td>{p.cliente}<br/>{p.telefone}</td><td>{dinheiro(p.total)}</td><td>{new Date(p.data).toLocaleString("pt-BR")}</td><td>{nomes[p.status]}</td><td>{p.responsavel??"A atribuir"}<br/>{p.origem}</td><td><button className="secondary" onClick={()=>{setId(p.id);setReferencia("");}}>Abrir pedido</button></td></tr>)}</tbody></table></div>}
      <div className="farmacia-toolbar"><button disabled={pagina===1} onClick={()=>setPagina(pagina-1)}>Anterior</button><span>Página {pagina} · {dados.total} pedidos</span><button disabled={pagina*30>=dados.total} onClick={()=>setPagina(pagina+1)}>Próxima</button></div></>}
    </section>{pedido&&<section className="panel"><div className="farmacia-toolbar"><h2>{pedido.numero} · {pedido.cliente}</h2><button onClick={()=>setId("")}>Fechar</button></div>
      <ul>{pedido.itens.map(i=><li key={i.produtoId}>{i.quantidade} × {i.descricao} · {dinheiro(i.preco)} cada {i.receita&&<strong> · Conferência farmacêutica obrigatória</strong>}</li>)}</ul>
      <p><strong>Total {dinheiro(pedido.total)}</strong> · {nomes[pedido.status]}</p><p>{pedido.expira?`Reserva até ${new Date(pedido.expira).toLocaleString("pt-BR")}`:"Sem reserva ativa"}</p>
      {pedido.conferencia&&<p>Conferência registrada: {pedido.conferencia}</p>}
      <label>Referência de pagamento, protocolo de conferência ou motivo de cancelamento<input maxLength={300} value={referencia} onChange={e=>setReferencia(e.target.value)}/></label>
      <div className="farmacia-toolbar">{["aguardando_confirmacao","aguardando_pagamento"].includes(pedido.status)&&<><button onClick={()=>acao(pedido,"reservar","Confirmar os itens e reservar temporariamente o estoque? O saldo físico não será baixado.")}>Reservar estoque</button><button onClick={()=>acao(pedido,"conferir","Registrar a conferência humana deste pedido? Esta ação exige habilitação farmacêutica e protocolo.")}>Conferência farmacêutica</button></>}
      {gestor&&pedido.status==="aguardando_pagamento"&&<button className="primary" disabled={referencia.trim().length<5} onClick={()=>acao(pedido,"confirmar",`Confirmar a venda de ${dinheiro(pedido.total)} e baixar definitivamente o estoque? Você declara ter conferido o pagamento. Referência: ${referencia}`)}>Confirmar venda e pagamento</button>}
      {pedido.status==="pagamento_confirmado"&&<button onClick={()=>acao(pedido,"separar","Iniciar separação? O estoque já foi baixado.")}>Iniciar separação</button>}
      {pedido.status==="em_separacao"&&<button onClick={()=>acao(pedido,"concluir","Confirmar que este pedido foi entregue e concluído?")}>Concluir pedido</button>}
      {gestor&&pedido.status!=="cancelado"&&<button disabled={referencia.trim().length<5} onClick={()=>acao(pedido,"cancelar",pedido.status==="concluido"?"Você confirma o recebimento físico de todos os itens devolvidos? Eles irão para quarentena. Esta ação não reembolsa o pagamento.":"Cancelar pedido, liberar reservas ou estornar a baixa? Esta ação não executa reembolso financeiro.")}>{pedido.status==="concluido"?"Registrar devolução recebida":"Cancelar pedido"}</button>}</div>
      <h3>Histórico</h3><ul className="farmacia-historico">{pedido.eventos.map((e,i)=><li key={i}>{new Date(e.data).toLocaleString("pt-BR")} · {e.tipo} · {e.autor}<br/>{e.detalhe}</li>)}</ul>
    </section>}
    {gestor&&<details className="panel"><summary>Habilitações de conferência farmacêutica</summary><p>Cadastre somente profissionais cuja habilitação foi verificada pela farmácia. O papel de administrador não concede essa autorização automaticamente.</p>
      <form className="farmacia-fields" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const v={usuarioId:String(f.get("usuario")),registro:String(f.get("registro")),habilitado:f.get("habilitado")==="on"};c.confirmar("Salvar a habilitação farmacêutica após conferência do profissional e registro?",()=>salvarHabilitacao(v));}}>
        <label>Usuário<select name="usuario" required>{usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}{u.habilitado?" · habilitado":""}</option>)}</select></label><label>Registro profissional<input name="registro" required minLength={4}/></label><label><input name="habilitado" type="checkbox"/> Autorizar conferência</label><button type="submit">Salvar habilitação</button>
      </form></details>}{c.modal}
  </div>;
}
