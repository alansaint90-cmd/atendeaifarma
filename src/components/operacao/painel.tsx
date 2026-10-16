"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { carregarPainel } from "@/lib/actions/painel";
import type { FiltroPainel, PainelOperacional, PontoPainel } from "@/lib/operacao/painel";
import { carregarResumoAgenda } from "@/lib/actions/consultas";
import type { ResumoAgenda } from "@/lib/consultas/resumo";
import { ResumoClinica } from "./resumo-clinica";
import { ProximasConsultas } from "./proximas-consultas";

type Atalho = "hoje" | "7dias" | "30dias" | "3meses" | "personalizado";
const atalhos: { id: Atalho; nome: string }[] = [
  { id: "hoje", nome: "Hoje" }, { id: "7dias", nome: "7 dias" }, { id: "30dias", nome: "30 dias" },
  { id: "3meses", nome: "3 meses" }, { id: "personalizado", nome: "Intervalo personalizado" },
];
function diaLocal(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
function filtroAtalho(atalho: Exclude<Atalho, "personalizado">, canalId: string | null): FiltroPainel {
  const agora = new Date();
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  const inicio = new Date(fim);
  if (atalho === "3meses") inicio.setMonth(inicio.getMonth() - 3);
  else inicio.setDate(inicio.getDate() - (atalho === "hoje" ? 1 : atalho === "7dias" ? 7 : 30));
  return { inicio: inicio.toISOString(), fim: fim.toISOString(),
    fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", canalId };
}
function rotuloDia(dia: string) { return dia.slice(8, 10) + "/" + dia.slice(5, 7); }

function GraficoConversas({ pontos }: { pontos: PontoPainel[] }) {
  const largura = 760, altura = 245, esquerda = 42, direita = 16, topo = 16, base = 36;
  const maximo = Math.max(3, ...pontos.flatMap(p => [p.conversas, p.ia, p.humano]));
  const x = (indice: number) => esquerda + indice * (largura - esquerda - direita) / Math.max(1, pontos.length - 1);
  const y = (valor: number) => topo + (maximo - valor) * (altura - topo - base) / maximo;
  const series = [
    { chave: "conversas" as const, nome: "Novas conversas", cor: "var(--blue)" },
    { chave: "ia" as const, nome: "Atendimento com IA", cor: "var(--green)" },
    { chave: "humano" as const, nome: "Atendimento humano", cor: "var(--orange)" },
  ];
  const amostras = [...new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1])];
  return <>
    <div className="dashboard-legenda">{series.map(item => <span key={item.chave}><i style={{ background: item.cor }} />{item.nome}</span>)}</div>
    <svg className="dashboard-chart" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Evolução diária de novas conversas e atendimentos com IA e humano">
      {[0, 1, 2, 3].map(indice => { const valor = Math.round(maximo * indice / 3); return <g key={indice}>
        <line x1={esquerda} x2={largura - direita} y1={y(valor)} y2={y(valor)} stroke="var(--line)" />
        <text x={esquerda - 10} y={y(valor) + 4} textAnchor="end">{valor}</text>
      </g>; })}
      {pontos.length > 0 && series.map(item => <polyline key={item.chave} fill="none" stroke={item.cor} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
        points={pontos.map((ponto, indice) => `${x(indice)},${y(ponto[item.chave])}`).join(" ")} />)}
      {pontos.length <= 14 && series.flatMap(item => pontos.map((ponto, indice) => <circle key={`${item.chave}-${ponto.dia}`} cx={x(indice)} cy={y(ponto[item.chave])} r="3" fill={item.cor} />))}
      {pontos.length > 0 && amostras.map(indice => <text key={indice} x={x(indice)} y={altura - 8} textAnchor={indice === 0 ? "start" : indice === pontos.length - 1 ? "end" : "middle"}>{rotuloDia(pontos[indice].dia)}</text>)}
    </svg>
    <details className="dashboard-tabela"><summary>Ver dados diários em tabela</summary>
      <div className="table"><table><thead><tr><th>Dia</th><th>Novas conversas</th><th>Com IA</th><th>Humanos</th></tr></thead>
        <tbody>{pontos.map(ponto => <tr key={ponto.dia}><td>{rotuloDia(ponto.dia)}</td><td>{ponto.conversas}</td><td>{ponto.ia}</td><td>{ponto.humano}</td></tr>)}</tbody></table></div>
    </details>
  </>;
}

interface PainelOperacionalPageProps { podeVerAgenda?: boolean; aoVerAgenda?: () => void }
export function PainelOperacionalPage({ podeVerAgenda = false, aoVerAgenda }: PainelOperacionalPageProps = {}) {
  const [agenda, definirAgenda] = useState<ResumoAgenda | null>(null);
  const [erroAgenda, definirErroAgenda] = useState("");
  const [revisaoAgenda, atualizarAgenda] = useState(0);
  useEffect(() => {
    if (!podeVerAgenda) return;
    let ativo = true;
    const timer = setTimeout(async () => {
      definirAgenda(null); definirErroAgenda("");
      try {
        const resultado = await carregarResumoAgenda();
        if (!ativo) return;
        if (resultado.ok) definirAgenda(resultado.dados); else definirErroAgenda(resultado.erro);
      } catch { if (ativo) definirErroAgenda("Não foi possível consultar a agenda."); }
    }, 0);
    return () => { ativo = false; clearTimeout(timer); };
  }, [podeVerAgenda, revisaoAgenda]);
  const [dados, definirDados] = useState<PainelOperacional | null>(null);
  const [ocupado, definirOcupado] = useState(true);
  const [erro, definirErro] = useState("");
  const [atalho, definirAtalho] = useState<Atalho>("7dias");
  const canalId = null;
  const [personalizado, definirPersonalizado] = useState<FiltroPainel | null>(null);
  const [inicioManual, definirInicioManual] = useState("");
  const [fimManual, definirFimManual] = useState("");
  const requisicao = useRef(0);
  const filtro = useMemo(() => atalho === "personalizado" ? personalizado && { ...personalizado, canalId } : filtroAtalho(atalho, canalId), [atalho, canalId, personalizado]);
  const carregar = useCallback(async (selecionado: FiltroPainel) => {
    const atual = ++requisicao.current;
    definirOcupado(true); definirErro(""); definirDados(null);
    try {
      const resultado = await carregarPainel(selecionado);
      if (atual !== requisicao.current) return;
      if (resultado.ok) {
        definirDados(resultado.dados);
      }
      else definirErro(resultado.erro);
    } catch { if (atual === requisicao.current) definirErro("Não foi possível consultar o servidor. Tente novamente."); }
    finally { if (atual === requisicao.current) definirOcupado(false); }
  }, []);
  useEffect(() => { if (!filtro) return; const timer = window.setTimeout(() => void carregar(filtro), 0); return () => window.clearTimeout(timer); }, [filtro, carregar]);
  function aplicarPersonalizado() {
    if (!inicioManual || !fimManual || inicioManual > fimManual) { definirErro("Escolha datas válidas, com início anterior ao fim."); return; }
    const inicio = new Date(`${inicioManual}T00:00:00`), fim = new Date(`${fimManual}T00:00:00`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) { definirErro("Escolha datas válidas."); return; }
    fim.setDate(fim.getDate() + 1);
    definirPersonalizado({ inicio: inicio.toISOString(), fim: fim.toISOString(),
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", canalId });
  }
  return <div className="page-stack dashboard-page">
    <ResumoClinica dados={dados} agenda={agenda} podeVerAgenda={podeVerAgenda} aoVerAgenda={aoVerAgenda}
      periodo={atalho === "7dias" ? "Últimos 7 dias" : atalhos.find(a => a.id === atalho)?.nome ?? "Período selecionado"} filtros={<section className="dashboard-filtros" aria-label="Filtros do painel">      <div className="dashboard-atalhos" role="group" aria-label="Período">
        {atalhos.map(item => <button key={item.id} type="button" className={atalho === item.id ? "ativo" : ""} aria-pressed={atalho === item.id}
          onClick={() => { definirAtalho(item.id); definirErro(""); if (item.id === "personalizado") { definirPersonalizado(null); definirDados(null); } }}>{item.nome}</button>)}
      </div>
      {atalho === "personalizado" && <div className="dashboard-personalizado">
        <label>De<input type="date" value={inicioManual} max={diaLocal(new Date())} onChange={evento => definirInicioManual(evento.target.value)} /></label>
        <label>Até<input type="date" value={fimManual} max={diaLocal(new Date())} onChange={evento => definirFimManual(evento.target.value)} /></label>
        <button type="button" onClick={aplicarPersonalizado}>Aplicar</button>
      </div>}
</section>} />
    {podeVerAgenda && <ProximasConsultas agenda={agenda} erro={erroAgenda} aoVerAgenda={aoVerAgenda} aoTentarNovamente={() => atualizarAgenda(r => r + 1)} />}
    {ocupado && <p role="status">Consultando indicadores…</p>}
    {erro && <p role="alert">{erro} <button type="button" onClick={() => filtro && void carregar(filtro)}>Tentar novamente</button></p>}
    {dados && <>
      <div className="dashboard-corpo"><div className="dashboard-principal">
        <section className="panel dashboard-grafico"><h2>Evolução das conversas</h2>
          {dados.evolucao.every(ponto => ponto.conversas + ponto.ia + ponto.humano === 0) && <p>Nenhuma conversa ou atendimento identificado neste período.</p>}
          <GraficoConversas pontos={dados.evolucao} />
        </section></div>
        <aside className="panel dashboard-contatos"><h2>Últimos contatos</h2>
          {dados.contatos.length ? dados.contatos.map(contato => <div className="dashboard-contato" key={contato.id}>
            <span aria-hidden="true">{contato.nome.trim().slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
          <div><strong>{contato.nome}</strong><small>{contato.telefone ?? "Sem telefone"}</small></div></div>) : <p>Nenhum contato com atividade no período.</p>}
        </aside></div>
      <p className="dashboard-nota">Uma conversa pode constar nos dois tipos de atendimento. Somente envios com autoria identificada entram na contagem de IA ou humano.</p>
    </>}
  </div>;
}
