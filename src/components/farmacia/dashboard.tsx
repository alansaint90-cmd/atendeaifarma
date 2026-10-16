"use client";
import { useEffect,useState,useCallback } from "react";
import { carregarFarmacia } from "@/lib/actions/farmacia";
import { dinheiro } from "./comum";
type Painel=Extract<Awaited<ReturnType<typeof carregarFarmacia>>,{ok:true}>["dados"];
export function FarmaciaDashboard({abrir}:{abrir:(rota:string)=>void}) {
  const [dados,setDados]=useState<Painel|null>(null);const [erro,setErro]=useState("");
  const carregar=useCallback(async()=>{const r=await carregarFarmacia();if(r.ok){setDados(r.dados);setErro("");}else setErro(r.erro);},[]);
  useEffect(()=>{const ini=setTimeout(()=>void carregar(),0);const timer=setInterval(()=>void carregar(),10000);return()=>{clearTimeout(ini);clearInterval(timer);};},[carregar]);
  return <div className="page-stack farmacia"><header className="page-head"><div><span className="farmacia-eyebrow">ATENDE AÍ FARMÁCIA</span><h1>Sua farmácia, em dia.</h1><p>Atendimento, pedidos e estoque conectados.</p></div><button className="primary" onClick={()=>abrir("estoque")}>Gerenciar estoque</button></header>
    {erro&&<p role="alert">{erro}</p>}{!dados&&!erro&&<p role="status">Carregando indicadores reais…</p>}{dados&&<><p className="muted">Todo o período · atualizado em {new Date(dados.atualizadoEm).toLocaleString("pt-BR")}</p>
      <section className="farmacia-kpis" aria-label="Indicadores de estoque">{[["Produtos cadastrados",dados.estoque.total],["Disponíveis",dados.estoque.disponiveis],["Esgotados",dados.estoque.esgotados],["Estoque baixo",dados.estoque.baixos],["Próximos do vencimento",dados.estoque.vencendo]].map(([titulo,v])=><article className="panel" key={titulo}><span>{titulo}</span><strong>{v}</strong></article>)}</section>
      <section className="farmacia-kpis" aria-label="Indicadores comerciais">{[["Atendimentos pela IA",dados.atendimento.atendimentos],["Consultas de produtos",dados.atendimento.consultas],["Pedidos criados",dados.vendas.pedidos],["Vendas confirmadas",dados.vendas.confirmados],["Pedidos pendentes",dados.vendas.pendentes],["Faturamento registrado",dinheiro(dados.vendas.faturamento)]].map(([titulo,v])=><article className="panel" key={titulo}><span>{titulo}</span><strong>{v}</strong></article>)}</section>
      <div className="grid-2"><section className="panel"><h2>Produtos mais vendidos</h2>{!dados.maisVendidos.length?<p>As vendas confirmadas aparecerão aqui.</p>:<table><thead><tr><th>Produto</th><th>Embalagens</th></tr></thead><tbody>{dados.maisVendidos.map(p=><tr key={p.nome}><td>{p.nome}</td><td>{p.quantidade}</td></tr>)}</tbody></table>}</section><section className="panel"><h2>Acompanhe a operação</h2><p>Reservas não contam como vendas. Cancelamentos são descontados do faturamento registrado.</p><div className="farmacia-toolbar"><button className="primary" onClick={()=>abrir("pedidos")}>Abrir pedidos</button><button className="secondary" onClick={()=>abrir("inbox")}>Ver conversas</button></div></section></div>
    </>}</div>;
}
