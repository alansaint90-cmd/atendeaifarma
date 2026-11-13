"use client";
import { useEffect,useState } from "react";
import { carregarFarmacia } from "@/lib/actions/farmacia";
import { dinheiro } from "./comum";
import { periodoFarmacia, periodoFarmaciaSchema, type AtalhoPeriodo } from "@/lib/farmacia/periodo";
type Painel=Extract<Awaited<ReturnType<typeof carregarFarmacia>>,{ok:true}>["dados"];
export function FarmaciaDashboard({abrir}:{abrir:(rota:string)=>void}) {
  const [dados,setDados]=useState<Painel|null>(null);const [erro,setErro]=useState("");
  const [atalho,setAtalho]=useState<AtalhoPeriodo|"personalizado">("hoje");
  const [periodo,setPeriodo]=useState(()=>periodoFarmacia("hoje"));
  const [inicio,setInicio]=useState(periodo.inicio),[fim,setFim]=useState(periodo.fim);
  const [aplicado,setAplicado]=useState(true);
  useEffect(()=>{
    if(!aplicado)return;
    let ativo=true,requisicao=0;
    const carregar=async()=>{const atual=++requisicao;try{const r=await carregarFarmacia(periodo);if(!ativo||atual!==requisicao)return;if(r.ok){setDados(r.dados);setErro("");}else{setDados(null);setErro(r.erro);}}catch{if(ativo&&atual===requisicao){setDados(null);setErro("Não foi possível consultar os indicadores. Tente novamente.");}}};
    const ini=setTimeout(()=>void carregar(),0);const timer=setInterval(()=>void carregar(),10000);
    return()=>{ativo=false;clearTimeout(ini);clearInterval(timer);};
  },[periodo,aplicado]);
  return <div className="page-stack farmacia"><header className="farmacia-painel-cabecalho"><div className="page-head"><div><span className="farmacia-eyebrow">ATENDE AÍ FARMÁCIA</span><h1>Sua farmácia, em dia.</h1></div><button className="primary" onClick={()=>abrir("estoque")}>Gerenciar estoque</button></div>
    <div className="farmacia-painel-faixa"><p>Atendimento, pedidos e estoque conectados.</p><form className="farmacia-painel-filtros" aria-label="Filtros do dashboard" onSubmit={e=>{e.preventDefault();const r=periodoFarmaciaSchema.safeParse({inicio,fim});if(!r.success){setErro("Escolha um período válido de até 366 dias.");return;}setPeriodo(r.data);setAplicado(true);setDados(null);setErro("");}}>
      <label>Período comercial<select value={atalho} onChange={e=>{const valor=e.target.value as AtalhoPeriodo|"personalizado";setAtalho(valor);setDados(null);setErro("");setAplicado(valor!=="personalizado");if(valor!=="personalizado")setPeriodo(periodoFarmacia(valor));}}>
        <option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="7dias">7 dias</option><option value="15dias">15 dias</option><option value="30dias">30 dias</option><option value="personalizado">Período selecionado</option></select></label>
      {atalho==="personalizado"&&<><label>De<input type="date" required value={inicio} onChange={e=>{setInicio(e.target.value);setAplicado(false);setDados(null);}}/></label><label>Até<input type="date" required value={fim} min={inicio} onChange={e=>{setFim(e.target.value);setAplicado(false);setDados(null);}}/></label><button type="submit" className="secondary">Aplicar</button></>}
    </form></div></header>
    {erro&&<p role="alert">{erro}</p>}{!dados&&!erro&&<p role="status">{aplicado?"Carregando indicadores reais…":"Selecione as datas e clique em Aplicar."}</p>}{dados&&<>
      <section className="farmacia-kpis" aria-label="Indicadores de estoque">{[["Produtos cadastrados",dados.estoque.total],["Disponíveis",dados.estoque.disponiveis],["Esgotados",dados.estoque.esgotados],["Estoque baixo",dados.estoque.baixos],["Próximos do vencimento",dados.estoque.vencendo]].map(([titulo,v])=><article className="panel" key={titulo}><span>{titulo}</span><strong>{v}</strong></article>)}</section>
      <section className="farmacia-kpis" aria-label="Indicadores comerciais">{[["Atendimentos pela IA",dados.atendimento.atendimentos],["Consultas de produtos",dados.atendimento.consultas],["Pedidos criados",dados.vendas.pedidos],["Vendas confirmadas",dados.vendas.confirmados],["Pedidos pendentes",dados.vendas.pendentes],["Faturamento registrado",dinheiro(dados.vendas.faturamento)]].map(([titulo,v])=><article className="panel" key={titulo}><span>{titulo}</span><strong>{v}</strong></article>)}</section>
      <div className="grid-2"><section className="panel"><h2>Produtos mais vendidos</h2>{!dados.maisVendidos.length?<p>As vendas confirmadas aparecerão aqui.</p>:<table><thead><tr><th>Produto</th><th>Embalagens</th></tr></thead><tbody>{dados.maisVendidos.map(p=><tr key={p.nome}><td>{p.nome}</td><td>{p.quantidade}</td></tr>)}</tbody></table>}</section><section className="panel"><h2>Acompanhe a operação</h2><p>Reservas não contam como vendas. Cancelamentos são descontados do faturamento registrado.</p><div className="farmacia-toolbar"><button className="primary" onClick={()=>abrir("pedidos")}>Abrir pedidos</button><button className="secondary" onClick={()=>abrir("inbox")}>Ver conversas</button></div></section></div>
    </>}</div>;
}
