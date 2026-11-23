"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { carregarPedidos,alterarPedido,carregarCadastrosFarmacia,salvarHabilitacao } from "@/lib/actions/farmacia";
import type { PedidoLista,ResumoPedidos } from "@/lib/farmacia/consultas";
import { dinheiro,useConfirmacao } from "./comum";
import { PedidoForm } from "./pedido-form";
import { periodoFarmacia,type AtalhoPeriodo } from "@/lib/farmacia/periodo";
import { EstoqueIcone as Icone } from "./estoque-icone";
const nomes:Record<string,string>={novo:"Novo pedido",aguardando_confirmacao:"Aguardando confirmação",aguardando_pagamento:"Aguardando pagamento",pagamento_confirmado:"Pagamento confirmado",em_separacao:"Em separação",concluido:"Concluído",cancelado:"Cancelado"};
const formas = {pix:"Pix",cartao:"Cartão",dinheiro:"Dinheiro"};
const estados = {pendente:"Aguardando pagamento",na_entrega:"Pagar na entrega",pago:"Pago",cancelado:"Pedido cancelado"};
function PagamentoDoPedido({pagamento}:{pagamento:PedidoLista["pagamento"]}) {
  return <><strong>{pagamento.forma?formas[pagamento.forma]:"Não informado"}</strong><small>{estados[pagamento.estado]}</small></>;
}
function etapaDoPedido(pedido:PedidoLista) {
  if(pedido.status!=="aguardando_pagamento")return nomes[pedido.status];
  if(pedido.pagamento.estado==="pago"||pedido.pagamento.estado==="na_entrega")return "Aguardando entrega";
  return nomes[pedido.status];
}
export function PedidosPage({gestor}:{gestor:boolean}) {
  const [dados,setDados]=useState<{pedidos:PedidoLista[];total:number;resumo?:ResumoPedidos}|null>(null);const [status,setStatus]=useState("");const [pagina,setPagina]=useState(1);
  const [termo,setTermo]=useState(""),[periodo,setPeriodo]=useState<AtalhoPeriodo|"">("7dias");
  const versao=useRef(0);const invalidar=useCallback(()=>{versao.current++;},[]);
  const [erro,setErro]=useState("");const [novo,setNovo]=useState(false);const [id,setId]=useState("");const [referencia,setReferencia]=useState("");
  const [usuarios,setUsuarios]=useState<{id:string;nome:string;registro:string|null;habilitado:boolean|null}[]>([]);
  const carregar=useCallback(async()=>{const atual=++versao.current;try{const r=await carregarPedidos({status,pagina,termo,periodo:periodo?periodoFarmacia(periodo):null});if(atual!==versao.current)return;if(r.ok){setDados(r.dados);setErro("");}else setErro(r.erro);}catch{if(atual===versao.current)setErro("Não foi possível consultar os pedidos. Tente atualizar.");}},[status,pagina,termo,periodo]);
  useEffect(()=>{
    let ativo=true;
    let atualizando=false;
    let timer:ReturnType<typeof setTimeout>;
    const atualizar=async()=>{
      if(!ativo||atualizando||document.visibilityState==="hidden")return;
      clearTimeout(timer);
      atualizando=true;
      await carregar();
      atualizando=false;
      if(ativo)timer=setTimeout(()=>void atualizar(),3000);
    };
    const aoVoltar=()=>void atualizar();
    timer=setTimeout(aoVoltar,200);
    window.addEventListener("focus",aoVoltar);
    document.addEventListener("visibilitychange",aoVoltar);
    return()=>{
      ativo=false;
      invalidar();
      clearTimeout(timer);
      window.removeEventListener("focus",aoVoltar);
      document.removeEventListener("visibilitychange",aoVoltar);
    };
  },[carregar,invalidar]);
  useEffect(()=>{if(gestor)void carregarCadastrosFarmacia().then(r=>{if(r.ok)setUsuarios(r.dados.usuarios);});},[gestor]);
  const c=useConfirmacao(()=>{void carregar();setReferencia("");});const pedido=dados?.pedidos.find(p=>p.id===id);
  const acao=(p:PedidoLista,a:string,mensagem:string)=>{const chave=crypto.randomUUID();c.confirmar(mensagem,()=>alterarPedido({id:p.id,acao:a,chave,referencia,atualizadoEm:p.atualizadoEm}));};
  const mudarFiltro=(alterar:()=>void)=>{invalidar();setDados(null);setPagina(1);setId("");alterar();};
  const indicadores=[{nome:"Total de pedidos",valor:dados?.resumo?.total,icone:"caixa",tom:"roxo"},{nome:"Concluídos",valor:dados?.resumo?.concluidos,icone:"check",tom:"verde"},{nome:"Em andamento",valor:dados?.resumo?.andamento,icone:"lotes",tom:"laranja"},{nome:"Cancelados",valor:dados?.resumo?.cancelados,icone:"sem",tom:"vermelho"}] as const;
  return <div className="page-stack farmacia pedidos-pro"><header className="page-head pedidos-cabecalho"><div><h1>Pedidos</h1><p>Acompanhe e gerencie todos os pedidos da sua farmácia.</p></div><button className="primary" onClick={()=>setNovo(true)}><Icone nome="mais"/>Novo pedido</button></header>
    {(erro||c.erro)&&<p role="alert">{erro||c.erro}</p>}{novo&&<PedidoForm fechar={()=>setNovo(false)} salvo={()=>{setNovo(false);void carregar();}}/>}
    <section className="pedidos-indicadores" aria-label="Indicadores dos pedidos">{indicadores.map(i=><article className={`pedidos-indicador ${i.tom}`} key={i.nome}><span className="pedidos-indicador-icone"><Icone nome={i.icone}/></span><div><span>{i.nome}</span><strong>{i.valor===undefined?"—":i.valor.toLocaleString("pt-BR")}</strong></div></article>)}</section>
    <section className="pedidos-consulta"><div className="pedidos-filtros"><label>Buscar pedido<span className="pedidos-busca"><Icone nome="buscar"/><input type="search" placeholder="Nº do pedido, cliente ou produto" value={termo} maxLength={120} onChange={e=>mudarFiltro(()=>setTermo(e.target.value))}/></span></label><label>Status<select value={status} onChange={e=>mudarFiltro(()=>setStatus(e.target.value))}><option value="">Todos</option><option value="em_andamento">Em andamento</option>{Object.entries(nomes).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>Período<select value={periodo} onChange={e=>mudarFiltro(()=>setPeriodo(e.target.value as AtalhoPeriodo|""))}>{[["","Todo o período"],["hoje","Hoje"],["ontem","Ontem"],["7dias","Últimos 7 dias"],["15dias","Últimos 15 dias"],["30dias","Últimos 30 dias"]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><button className="primary" onClick={()=>void carregar()}><Icone nome="atualizar"/>Atualizar</button></div>
      <p className="pedidos-escopo">Indicadores consideram busca e período. O status filtra a tabela.</p>
      {!dados&&!erro&&<p role="status">Consultando pedidos…</p>}{dados&&<>{!dados.pedidos.length?<p className="panel">Nenhum pedido encontrado.</p>:<div className="table pedidos-tabela"><table>
        <thead><tr>{["Pedido","Cliente","Valor","Pagamento","Status","Data"].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead>
        <tbody>{dados.pedidos.map(p=><tr key={p.id}>
          <td><button className="pedidos-numero" aria-label="Abrir pedido" title={`Abrir pedido ${p.numero}`} onClick={()=>{setId(p.id);setReferencia("");}}>{p.numero}</button></td>
          <td><strong>{p.cliente}</strong><small>{p.telefone}</small></td><td className="pedidos-valor">{dinheiro(p.total)}</td>
          <td><PagamentoDoPedido pagamento={p.pagamento}/></td>
          <td><span className={`pedidos-status ${p.status==="concluido"?"concluido":p.status==="cancelado"?"cancelado":"andamento"}`}>{p.status==="concluido"?"Concluído":p.status==="cancelado"?"Cancelado":"Em andamento"}</span>
            {!["concluido","cancelado"].includes(p.status)&&<small>{etapaDoPedido(p)}</small>}</td>
          <td><time dateTime={p.data}>{new Date(p.data).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})}</time></td>
        </tr>)}</tbody></table></div>}
      <div className="pedidos-paginacao"><span>Página {pagina} · {dados.total} pedidos</span><button className="secondary" disabled={pagina===1} onClick={()=>{invalidar();setDados(null);setPagina(pagina-1);}}>Anterior</button><button className="secondary" disabled={pagina*30>=dados.total} onClick={()=>{invalidar();setDados(null);setPagina(pagina+1);}}>Próxima</button></div></>}
    </section>{pedido&&<section className="panel"><div className="farmacia-toolbar"><h2>{pedido.numero} · {pedido.cliente}</h2><button onClick={()=>setId("")}>Fechar</button></div>
      <p>{pedido.telefone} · {pedido.responsavel??"A atribuir"} · {pedido.origem} · {new Date(pedido.data).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</p><ul>{pedido.itens.map(i=><li key={i.produtoId}>{i.quantidade} × {i.descricao} · {dinheiro(i.preco)} cada {i.receita&&<strong> · Conferência farmacêutica obrigatória</strong>}</li>)}</ul>
      <p><strong>Total {dinheiro(pedido.total)}</strong> · {etapaDoPedido(pedido)}</p><p>{pedido.expira?`Reserva até ${new Date(pedido.expira).toLocaleString("pt-BR")}`:"Sem reserva ativa"}</p>
      <div className="pedido-detalhe-pagamento"><span>Pagamento</span><PagamentoDoPedido pagamento={pedido.pagamento}/></div>
      {pedido.conferencia&&<p>Conferência registrada: {pedido.conferencia}</p>}
      <label>Referência de pagamento, protocolo de conferência ou motivo de cancelamento<input maxLength={300} value={referencia} onChange={e=>setReferencia(e.target.value)}/></label>
      <div className="farmacia-toolbar">{["aguardando_confirmacao","aguardando_pagamento"].includes(pedido.status)&&<><button onClick={()=>acao(pedido,"reservar","Confirmar os itens e reservar temporariamente o estoque? O saldo físico não será baixado.")}>Reservar estoque</button><button onClick={()=>acao(pedido,"conferir","Registrar a conferência humana deste pedido? Esta ação exige habilitação farmacêutica e protocolo.")}>Conferência farmacêutica</button></>}
      {gestor&&pedido.status==="aguardando_pagamento"&&<>
        {!pedido.pagamento.forma&&<button className="primary" disabled={referencia.trim().length<5} onClick={()=>acao(pedido,"confirmar",`Confirmar a venda de ${dinheiro(pedido.total)} e baixar definitivamente o estoque? Você declara ter conferido o pagamento. Referência: ${referencia}`)}>Confirmar venda e pagamento</button>}
        {(pedido.pagamento.estado==="pago"||pedido.pagamento.estado==="na_entrega")&&<button className="primary" disabled={pedido.pagamento.forma!=="pix"&&referencia.trim().length<5} onClick={()=>acao(pedido,"entregar",pedido.pagamento.forma==="pix"?"Confirmar a entrega e baixar o estoque do pedido pago?":"Confirmar que o pedido foi entregue e o pagamento foi recebido? O estoque será baixado.")}>Confirmar entrega</button>}
      </>}
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
