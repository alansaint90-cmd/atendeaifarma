"use client";
import { useEffect, useRef, useState } from "react";
import type { catalogoCrm } from "@/lib/crm/cadastros";
import type { consultarCrm, Oportunidade } from "@/lib/crm/consultas";
import { carregarCrm, fecharNegocio, moverNegocio } from "@/lib/actions/crm";
import { filtrosCrm, type FiltrosCrm } from "@/lib/crm/validacao";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { CadastrosCrm } from "./cadastros";
import { Filtros } from "./filtros";

export type DadosCrm = { catalogo: Awaited<ReturnType<typeof catalogoCrm>>; consulta: Awaited<ReturnType<typeof consultarCrm>> };
export const moeda = (valor: string) => { const [inteiro, decimal = "00"] = valor.split("."); return `R$ ${BigInt(inteiro).toLocaleString("pt-BR")},${decimal}`; };
interface PainelProps { inicial: DadosCrm; usuarioId: string }
export function PainelCrm({ inicial, usuarioId }: PainelProps) {
  const requisicao = useRef(0);
  const [dados, setDados] = useState(inicial); const [filtros, setFiltros] = useState<FiltrosCrm>({ pagina: 1, tags: [] });
  const [ocupado, setOcupado] = useState(false); const [erro, setErro] = useState("");
  const [alvo, setAlvo] = useState<Oportunidade | null>(null); const [status, setStatus] = useState<"ganha" | "perdida">("ganha");
  const [motivoId, setMotivo] = useState(""); const [observacao, setObservacao] = useState(""); const [confirmar, setConfirmar] = useState(false);
  async function carregar(f: FiltrosCrm = filtros) {
    const ordem = ++requisicao.current;
    setOcupado(true); setErro("");
    try { const r = await carregarCrm(f); if (ordem !== requisicao.current) return; if (!r.ok) { setErro(r.erro); return; } setDados(r.dados); setFiltros(f);
      try { sessionStorage.setItem(`crm-filtros:${usuarioId}`, JSON.stringify(f)); } catch { /* Filtros continuam em memória. */ }
    } catch { if (ordem === requisicao.current) setErro("Falha ao carregar. Tente novamente."); } finally { if (ordem === requisicao.current) setOcupado(false); }
  }
  useEffect(() => {
    let ativo = true; const ordem = requisicao.current;
    async function restaurar() { try { const valor = sessionStorage.getItem(`crm-filtros:${usuarioId}`); if (!valor) return;
      const f = filtrosCrm.parse(JSON.parse(valor)); const r = await carregarCrm(f);
      if (ativo && ordem === requisicao.current && r.ok) { setFiltros(f); setDados(r.dados); }
    } catch { /* Filtro antigo inválido não interfere no acesso. */ } }
    void restaurar(); return () => { ativo = false; };
  }, [usuarioId]);
  async function fechar() { if (!alvo) return; setOcupado(true); setErro("");
    try { const r = await fecharNegocio({ id: alvo.id, updatedAt: alvo.updatedAt, status, motivoId: status === "perdida" ? motivoId : null, observacao });
      if (!r.ok) setErro(r.erro); else { setAlvo(null); await carregar(); }
    } catch { setErro("Não foi possível confirmar. Recarregue antes de tentar novamente."); } finally { setOcupado(false); setConfirmar(false); } }
  async function mover(item: Oportunidade, etapaId: string) { setOcupado(true); setErro("");
    try { const r = await moverNegocio({ id: item.id, updatedAt: item.updatedAt, etapaId }); if (!r.ok) setErro(r.erro); else await carregar(); }
    catch { setErro("Não foi possível mover a oportunidade."); } finally { setOcupado(false); } }
  const { catalogo, consulta } = dados;
  return <div className="page-stack">
    {erro && <p role="alert" className="error-message">{erro}</p>}{ocupado && <p role="status">Atualizando…</p>}
    <Filtros catalogo={catalogo} valor={filtros} ocupado={ocupado} onAplicar={f => void carregar(f)} />
    <section className="followup-grid" aria-label="Indicadores comerciais">
      {[["Oportunidades", consulta.resumo.total], ["Ganhas", consulta.resumo.ganhas], ["Perdidas", consulta.resumo.perdidas], ["Conversão", `${consulta.resumo.conversao}%`], ["Receita", moeda(consulta.resumo.receita)]].map(([label, valor]) => <article className="panel" key={label}><h2>{label}</h2><strong>{valor}</strong></article>)}
    </section>
    <details className="panel"><summary>Receita por funil e responsável</summary>{consulta.receitas.length ? <table><thead><tr><th>Funil</th><th>Responsável</th><th>Receita</th></tr></thead><tbody>{consulta.receitas.map((r,i) => <tr key={i}><td>{r.funil}</td><td>{r.responsavel}</td><td>{moeda(r.valor)}</td></tr>)}</tbody></table> : <p>Nenhuma receita neste filtro.</p>}</details>
    <section className="panel"><h2>Motivos de perda</h2>{!consulta.perdas.length && <p>Nenhuma perda neste filtro.</p>}{consulta.perdas.map((p,i) => <div key={i}><button disabled={ocupado} onClick={() => void carregar({ ...filtros, motivoId: p.motivoId, pagina: 1 })}>{p.motivo}: {p.quantidade} ({p.percentual}%) — {moeda(p.valor)}</button><meter min={0} max={100} value={Number(p.percentual)} aria-label={`Percentual de perdas: ${p.motivo}`} style={{ width: "100%" }} /></div>)}</section>
    <CadastrosCrm catalogo={catalogo} usuarioId={usuarioId} onSalvo={() => void carregar()} />
    <section className="panel"><h2>Kanban</h2>{!catalogo.funis.length && <p>Nenhum funil disponível. O administrador pode cadastrar e conceder acesso.</p>}
      <p>{consulta.resumo.total} oportunidades nos filtros; até 50 por página.</p>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>{catalogo.etapas.filter(e => !filtros.funilId || e.funilId === filtros.funilId).map(etapa => <section key={etapa.id} style={{ minWidth: 260, flex: "1 0 260px" }}>
        <h3>{catalogo.funis.find(f => f.id === etapa.funilId)?.nome} · {etapa.nome}</h3>
        {consulta.itens.filter(i => i.etapaId === etapa.id).map(i => <article className="panel" key={i.id}><strong>{i.titulo}</strong><p>{moeda(i.valor)} · {i.responsavel}</p><span className="badge">{i.status}</span>
          {i.status === "aberta" && catalogo.podeEditar && <><label>Mover para<select disabled={ocupado} value={i.etapaId} onChange={e => void mover(i, e.target.value)}>{catalogo.etapas.filter(e => e.funilId === i.funilId).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
            <button disabled={ocupado} onClick={() => { setAlvo(i); setStatus("ganha"); setMotivo(""); setObservacao(""); }}>Registrar ganho ou perda</button></>}
        </article>)}
      </section>)}</div>
      <button disabled={ocupado || filtros.pagina <= 1} onClick={() => void carregar({ ...filtros, pagina: filtros.pagina - 1 })}>Anterior</button> <span>Página {filtros.pagina}</span> <button disabled={ocupado || filtros.pagina * 50 >= consulta.resumo.total} onClick={() => void carregar({ ...filtros, pagina: filtros.pagina + 1 })}>Próxima</button>
    </section>
    {alvo && <section className="panel"><h2>Encerrar: {alvo.titulo}</h2><label>Resultado<select value={status} onChange={e => setStatus(e.target.value as "ganha" | "perdida")}><option value="ganha">Ganha</option><option value="perdida">Perdida</option></select></label>
      {status === "perdida" && <label>Motivo da perda<select value={motivoId} onChange={e => setMotivo(e.target.value)}><option value="">Selecione</option>{catalogo.motivos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>}
      <label>Observação opcional<textarea maxLength={2000} value={observacao} onChange={e => setObservacao(e.target.value)} /></label><button disabled={ocupado || (status === "perdida" && !motivoId)} onClick={() => setConfirmar(true)}>Revisar fechamento</button><button onClick={() => setAlvo(null)}>Cancelar</button>
    </section>}
    <ModalConfirmacaoBlock aberto={confirmar} titulo="Confirmar fechamento" mensagem={`${alvo?.titulo}: ${status}. Valor: ${moeda(alvo?.valor ?? "0.00")}. O fechamento ficará registrado no histórico.`} carregando={ocupado} onCancelar={() => setConfirmar(false)} onConfirmar={() => void fechar()} />
  </div>;
}
