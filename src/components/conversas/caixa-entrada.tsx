"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AvatarContato } from "./avatar";
import { AudioMensagem } from "./audio-mensagem";
import type { EstadoIaConversa } from "@/lib/operacao/estado-ia";

export interface MensagemConversa { id: string; conteudo: string | null; direcao: string; instante: string; tipo?: string; audioDisponivel?: boolean }
export interface ConversaLista { id: string; nome: string; telefone: string | null; canal: string; status: string; estadoIa?: EstadoIaConversa; aguardaHumano?: boolean; avisoEntrega?: string | null; fotoUrl?: string | null; mensagens: MensagemConversa[] }
interface CaixaEntradaProps {
  conversas: ConversaLista[]; selecionada: string; aoSelecionar: (id: string) => void;
  resposta?: ReactNode; acoesConversa?: ReactNode; atualizar: () => void; atualizando?: boolean;
  fonteAudio?: (id: string) => string;
  fonteFoto?: (id: string) => string;
}
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const hora = (instante: string) => new Date(instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dia = (instante: string) => new Date(instante).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const status: Record<string, string> = { open: "Em atendimento", pending: "Pendente", closed: "Encerrada" };
const rotulosIa: Record<EstadoIaConversa, string> = {
  ativa: "Atendimento com IA",
  pausada: "IA pausada",
  humano: "Atendimento humano",
  desativada: "IA desativada",
  indisponivel: "IA indisponível",
};

/** Apresentação compartilhável entre instalações; autenticação e envio ficam no adaptador. */
export function CaixaEntrada({ conversas, selecionada, aoSelecionar, resposta, acoesConversa, atualizar, atualizando = false, fonteAudio, fonteFoto }: CaixaEntradaProps) {
  const [busca, definirBusca] = useState("");
  const [aberta, definirAberta] = useState(false);
  const buscaId = useId();
  const campoBusca = useRef<HTMLInputElement>(null), titulo = useRef<HTMLHeadingElement>(null);
  const historico = useRef<HTMLDivElement>(null), acompanhar = useRef(true), anterior = useRef(""), estavaAberta = useRef(false);
  const conversa = conversas.find(c => c.id === selecionada) ?? conversas[0];
  const ultimaId = conversa?.mensagens.at(-1)?.id;
  const filtradas = conversas.filter(c => normalizar(`${c.nome} ${c.telefone ?? ""} ${c.canal}`).includes(normalizar(busca.trim())));
  useEffect(() => {
    const elemento = historico.current;
    if (elemento && (anterior.current !== conversa?.id || acompanhar.current || (aberta && !estavaAberta.current))) elemento.scrollTop = elemento.scrollHeight;
    anterior.current = conversa?.id ?? "";
    estavaAberta.current = aberta;
  }, [conversa?.id, ultimaId, aberta]);
  useEffect(() => { if (aberta) titulo.current?.focus(); }, [aberta, conversa?.id]);
  return <section className={`conversas-caixa${aberta ? " conversa-aberta" : ""}`} aria-label="Caixa de entrada do WhatsApp">
    <aside className="conversas-lateral" aria-label="Lista de conversas">
      <header className="conversas-barra"><div><h2>Conversas</h2><span>{conversas.length} conversas recentes</span></div>
        <button type="button" className="conversas-atualizar" onClick={atualizar} disabled={atualizando} aria-label="Atualizar conversas">{atualizando ? "Atualizando…" : "Atualizar"}</button></header>
      <div className="conversas-busca"><label htmlFor={buscaId}>Buscar conversa</label>
        <input ref={campoBusca} id={buscaId} type="search" placeholder="Nome, telefone ou canal" value={busca} onChange={e => definirBusca(e.target.value)} /></div>
      {conversas.some(c => c.aguardaHumano) && <p className="conversas-aviso" role="status">🔔 {conversas.filter(c => c.aguardaHumano).length} atendimento(s) aguardando resposta da equipe.</p>}
      <ul className="conversas-lista">{filtradas.map(c => {
        const ultima = c.mensagens.at(-1);
        return <li key={c.id}><button type="button" className="conversas-contato" aria-label={`Abrir conversa com ${c.nome} · ${c.canal}`} aria-pressed={conversa?.id === c.id}
          onClick={() => { aoSelecionar(c.id); definirAberta(true); }}>
          <AvatarContato nome={c.nome} fotoUrl={c.fotoUrl} fotoAlternativa={fonteFoto?.(c.id)} /><span className="conversas-resumo"><span className="conversas-identificacao"><strong>{c.nome}</strong>{ultima && <time dateTime={ultima.instante}>{hora(ultima.instante)}</time>}</span>
            <span className="conversas-previa">{ultima ? `${ultima.direcao === "outbound" ? "Você: " : ""}${ultima.conteudo || "Mensagem sem texto"}` : "Nenhuma mensagem no histórico"}</span>
            <span className="conversas-canal">{c.canal} · {c.aguardaHumano ? "🔔 Aguardando atendente" : c.avisoEntrega ? `🔔 ${c.avisoEntrega}` : status[c.status] ?? c.status}</span></span>
        </button></li>;
      })}</ul>
      {!filtradas.length && <p className="conversas-vazio" role="status">{conversas.length ? "Nenhuma conversa encontrada para essa busca." : "Nenhuma conversa recebida. Aguardando mensagens do WhatsApp."}</p>}
    </aside>
    <div className="conversas-principal">
      {conversa ? <><header className="conversas-barra conversas-cabecalho">
        <button type="button" className="conversas-voltar" onClick={() => { definirAberta(false); campoBusca.current?.focus(); }} aria-label="Voltar para a lista de conversas">←</button>
        <AvatarContato key={conversa.id} nome={conversa.nome} fotoUrl={conversa.fotoUrl} fotoAlternativa={fonteFoto?.(conversa.id)} />
        <div>
          <div className="conversas-titulo">
            <h2 ref={titulo} tabIndex={-1}>{conversa.nome}</h2>
            {conversa.estadoIa && <span className="conversas-estado-ia" data-estado={conversa.estadoIa}>{rotulosIa[conversa.estadoIa]}</span>}
          </div>
          <span>{conversa.telefone ?? "Sem telefone"} · {conversa.canal} · {status[conversa.status] ?? conversa.status}</span>
        </div>
        {acoesConversa}
      </header>
      <div className="conversas-historico" ref={historico} role="region" aria-label={`Histórico de ${conversa.nome}`} tabIndex={0}
        onScroll={e => { const el = e.currentTarget; acompanhar.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <p className="conversas-aviso">Últimas 50 mensagens deste atendimento</p>
        {conversa.aguardaHumano && <p className="conversas-aviso" role="status">A equipe foi notificada para responder. Assuma a conversa para continuar; a IA está pausada.</p>}
        {conversa.avisoEntrega && <p className="conversas-aviso" role="status">🔔 {conversa.avisoEntrega}</p>}
        {conversa.mensagens.map((m, i) => <div key={m.id} className="conversas-linha">
          {(i === 0 || dia(m.instante) !== dia(conversa.mensagens[i - 1].instante)) && <span className="conversas-dia">{dia(m.instante)}</span>}
          <article className={`conversas-balao ${m.direcao === "inbound" ? "recebida" : "enviada"}`} aria-label={m.direcao === "inbound" ? "Mensagem recebida" : "Mensagem enviada"}>
            {m.tipo === "audio" ? <AudioMensagem fonte={fonteAudio?.(m.id)} disponivel={m.audioDisponivel} recebida={m.direcao === "inbound"} /> : <p>{m.conteudo || "Mensagem sem texto"}</p>}<time dateTime={m.instante}>{hora(m.instante)}</time>
          </article></div>)}
        {!conversa.mensagens.length && <p className="conversas-vazio">Nenhuma mensagem neste atendimento.</p>}
      </div><footer className="conversas-resposta">{resposta}</footer></> : <div className="conversas-sem-selecao"><h2>Seu atendimento começa aqui</h2><p>As conversas recebidas pelo WhatsApp aparecerão ao lado.</p></div>}
    </div>
  </section>;
}
