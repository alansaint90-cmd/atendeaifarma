"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { carregarOperacao } from "@/lib/actions/operacao";
import type { ResumoOperacional } from "@/lib/operacao/consultas";
import { PainelOperacionalPage } from "./painel";
import { AtendimentoManual } from "../farmacia/atendimento";

export function OperacaoPage({ rota, podeVerAgenda = false, aoVerAgenda }: { rota: string; podeVerAgenda?: boolean; aoVerAgenda?: () => void }) {
  return rota === "dashboard" ? <PainelOperacionalPage podeVerAgenda={podeVerAgenda} aoVerAgenda={aoVerAgenda} /> : <ListaOperacionalPage rota={rota} />;
}

function ListaOperacionalPage({ rota }: { rota: string }) {
  const [dados, definirDados] = useState<ResumoOperacional | null>(null);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState("");
  const [selecionada, selecionar] = useState("");
  const requisicao = useRef(0);
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
    return () => window.clearTimeout(timer);
  }, [carregar, rotaOperacional]);
  const conversa = dados?.conversas.find(item => item.id === selecionada) ?? dados?.conversas[0];
  return <div className="page-stack">
    <section className="page-head"><div><h1>{rota === "contacts" ? "Contatos e leads" : "Caixa de entrada"}</h1>
      <p>Dados reais do WhatsApp. Nenhum contato ou indicador de demonstração.</p></div></section>
    {erro && <p role="alert">{erro}</p>}
    {!dados && !erro && <p role="status">{ocupado ? "Consultando o banco de dados…" : "Aguardando a consulta dos dados."}</p>}
    {dados && <>
      <p role="status">Atualizado em {new Date(dados.atualizadoEm).toLocaleString("pt-BR")}.</p>
      {rota === "contacts" && <article className="panel"><h2>{dados.totalContatos} contatos cadastrados</h2><p>Exibindo os {dados.contatos.length} contatos mais recentes (limite de 100).</p>
        {dados.contatos.length ? <div className="table"><table><thead><tr>{["Nome", "Telefone", "Email", "Origem", "Status"].map(titulo => <th key={titulo}>{titulo}</th>)}</tr></thead>
          <tbody>{dados.contatos.map(contato => <tr key={contato.id}><td>{contato.nome}</td><td>{contato.telefone || "—"}</td><td>{contato.email || "—"}</td><td>{contato.origem || "—"}</td><td>{contato.status}</td></tr>)}</tbody></table></div>
          : <p>Nenhum contato cadastrado. Aguardando mensagens reais.</p>}</article>}
      {rota === "inbox" && <section className="grid-2"><article className="panel"><h2>Conversas recentes</h2><p>Até 50 conversas, com as últimas 50 mensagens de cada uma.</p>
        {dados.conversas.length ? dados.conversas.map(item => <button key={item.id} className="contact-row" aria-pressed={conversa?.id === item.id} onClick={() => selecionar(item.id)}>{item.nome} · {item.canal}</button>) : <p>Nenhuma conversa recebida.</p>}
      </article><article className="panel"><h2>{conversa?.nome ?? "Histórico"}</h2><p>Histórico do WhatsApp e atendimento humano.</p>
        {conversa?.mensagens.map(mensagem => <div key={mensagem.id} className={`message ${mensagem.direcao === "inbound" ? "customer" : "agent"}`}><small>{mensagem.direcao === "inbound" ? "Recebida" : "Enviada"} · {new Date(mensagem.instante).toLocaleString("pt-BR")}</small><p style={{ whiteSpace: "pre-wrap" }}>{mensagem.conteudo}</p></div>)}
        {conversa&&<AtendimentoManual key={conversa.id} id={conversa.id} atualizar={()=>void carregar()}/>}
      </article></section>}
    </>}
  </div>;
}
