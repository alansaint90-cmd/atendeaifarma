"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { carregarOperacao } from "@/lib/actions/operacao";
import type { ResumoOperacional } from "@/lib/operacao/consultas";
import { PainelOperacionalPage } from "./painel";
import { AtendimentoManual } from "../farmacia/atendimento";
import { CaixaEntrada } from "../conversas/caixa-entrada";
import { LIMITE_CONTATOS } from "@/lib/operacao/limites";

export function OperacaoPage({ rota, podeVerAgenda = false, aoVerAgenda }: { rota: string; podeVerAgenda?: boolean; aoVerAgenda?: () => void }) {
  return rota === "dashboard" ? <PainelOperacionalPage podeVerAgenda={podeVerAgenda} aoVerAgenda={aoVerAgenda} /> : <ListaOperacionalPage rota={rota} />;
}

function ListaOperacionalPage({ rota }: { rota: string }) {
  const [dados, definirDados] = useState<ResumoOperacional | null>(null);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState("");
  const [selecionada, selecionar] = useState("");
  const requisicao = useRef(0);
  const invalidarConsulta = useCallback(() => { requisicao.current++; }, []);
  const carregar = useCallback(async () => {
    const atual = ++requisicao.current;
    definirOcupado(true); definirErro("");
    try {
      const resultado = await carregarOperacao();
      if (atual !== requisicao.current) return;
      if (resultado.ok) definirDados(resultado.dados);
      else { definirDados(null); definirErro(resultado.erro); }
    } catch { if (atual === requisicao.current) { definirDados(null); definirErro("Não foi possível consultar o servidor. Tente novamente."); } }
    finally { if (atual === requisicao.current) definirOcupado(false); }
  }, []);
  const rotaOperacional = rota === "contacts" || rota === "inbox";
  useEffect(() => {
    if (!rotaOperacional) return;
    const timer = window.setTimeout(() => void carregar(), 0);
    const atualizacao = window.setInterval(() => void carregar(), 10000);
    return () => { window.clearTimeout(timer); window.clearInterval(atualizacao); invalidarConsulta(); };
  }, [carregar, rotaOperacional, invalidarConsulta]);
  const conversa = dados?.conversas.find(item => item.id === selecionada) ?? dados?.conversas[0];
  return <div className={`page-stack${rota === "inbox" ? " pagina-conversas" : ""}`}>
    <section className="page-head"><div><h1>{rota === "contacts" ? "Contatos e leads" : "Caixa de entrada"}</h1>
      {rota !== "inbox" && <p>Dados reais do WhatsApp. Nenhum contato ou indicador de demonstração.</p>}</div></section>
    {erro && <p role="alert">{erro}</p>}
    {!dados && !erro && <p role="status">{ocupado ? "Consultando o banco de dados…" : "Aguardando a consulta dos dados."}</p>}
    {dados && <>
      {rota !== "inbox" && <p role="status">Atualizado em {new Date(dados.atualizadoEm).toLocaleString("pt-BR")}.</p>}
      {rota === "contacts" && <article className="panel"><h2>{dados.totalContatos} contatos cadastrados</h2><p>Exibindo os {dados.contatos.length} contatos mais recentes (limite de {LIMITE_CONTATOS}).</p>
        {dados.contatos.length ? <div className="table"><table><thead><tr>{["Nome", "Telefone", "Email", "Origem", "Status"].map(titulo => <th key={titulo}>{titulo}</th>)}</tr></thead>
          <tbody>{dados.contatos.map(contato => <tr key={contato.id}><td>{contato.nome}</td><td>{contato.telefone || "—"}</td><td>{contato.email || "—"}</td><td>{contato.origem || "—"}</td><td>{contato.status}</td></tr>)}</tbody></table></div>
          : <p>Nenhum contato cadastrado. Aguardando mensagens reais.</p>}</article>}
      {rota === "inbox" && <CaixaEntrada conversas={dados.conversas} selecionada={conversa?.id ?? ""} aoSelecionar={selecionar} atualizar={() => void carregar()} atualizando={ocupado}
        resposta={conversa && <AtendimentoManual key={conversa.id} id={conversa.id} atualizar={() => void carregar()} />} />}
    </>}
  </div>;
}
