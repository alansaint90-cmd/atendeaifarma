"use client";
import { useState } from "react";
import { modificarMotivo } from "@/lib/actions/crm";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
interface Motivo { id: string; nome: string; updatedAt: string }
export function Motivos({ itens, onSalvo }: { itens: Motivo[]; onSalvo: () => void }) {
  const [alvo,setAlvo] = useState<Motivo | null>(null); const [nome,setNome] = useState(""); const [excluir,setExcluir] = useState(false);
  const [erro,setErro] = useState(""); const [ocupado,setOcupado] = useState(false);
  async function gravar() { if (!alvo) return; setOcupado(true); setErro("");
    try { const r = await modificarMotivo({ id: alvo.id, updatedAt: alvo.updatedAt, nome, excluir }); if (!r.ok) setErro(r.erro); else { setAlvo(null); setExcluir(false); onSalvo(); } }
    catch { setErro("Falha ao salvar motivo. Recarregue antes de tentar novamente."); } finally { setOcupado(false); } }
  return <section>{erro && <p role="alert">{erro}</p>}{itens.map(m => <p key={m.id}>{m.nome} <button disabled={ocupado} onClick={() => { setAlvo(m); setNome(m.nome); }}>Editar</button> <button disabled={ocupado} onClick={() => { setAlvo(m); setNome(m.nome); setExcluir(true); }}>Excluir</button></p>)}
    {alvo && !excluir && <form onSubmit={e => { e.preventDefault(); void gravar(); }}><label>Nome do motivo<input required maxLength={120} value={nome} onChange={e => setNome(e.target.value)} /></label><button disabled={ocupado}>Salvar motivo</button><button type="button" disabled={ocupado} onClick={() => setAlvo(null)}>Cancelar</button></form>}
    <ModalConfirmacaoBlock aberto={excluir} titulo="Excluir motivo de perda" mensagem={`Excluir “${alvo?.nome}” das novas opções? O histórico das oportunidades será preservado.`} carregando={ocupado} onCancelar={() => { setExcluir(false); setAlvo(null); }} onConfirmar={() => void gravar()} />
  </section>;
}
