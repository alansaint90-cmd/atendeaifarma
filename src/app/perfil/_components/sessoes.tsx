"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { encerrarMinhaSessao } from "@/lib/actions/sessoes";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
interface Sessao { id: string; criadoEm: string; expiraEm: string; atual: boolean }
export function Sessoes({ inicial }: { inicial: Sessao[] }) {
  const router = useRouter();
  const [itens,setItens] = useState(inicial); const [alvo,setAlvo] = useState<Sessao | null>(null); const [erro,setErro] = useState(""); const [ocupado,setOcupado] = useState(false);
  async function encerrar() { if (!alvo) return; setOcupado(true); setErro("");
    try { const r = await encerrarMinhaSessao(alvo.id); if (!r.ok) setErro(r.erro); else if (r.dados.atual) { router.push("/entrar"); router.refresh(); } else setItens(v => v.filter(i => i.id !== alvo.id)); }
    catch { setErro("Não foi possível encerrar a sessão."); } finally { setOcupado(false); setAlvo(null); } }
  return <section className="panel"><h2>Sessões ativas</h2>{erro && <p role="alert">{erro}</p>}{!itens.length && <p>Nenhuma sessão ativa.</p>}
    {itens.map(i => <article key={i.id}><p>{i.atual ? "Sessão atual" : "Outra sessão"} · Início: {new Date(i.criadoEm).toLocaleString("pt-BR")}</p><button disabled={ocupado} onClick={() => setAlvo(i)}>Encerrar sessão</button></article>)}
    <ModalConfirmacaoBlock aberto={!!alvo} titulo="Encerrar sessão" mensagem={alvo?.atual ? "Você sairá do CRM e precisará entrar novamente." : "A sessão selecionada perderá o acesso imediatamente."} carregando={ocupado} onCancelar={() => setAlvo(null)} onConfirmar={() => void encerrar()} />
  </section>;
}
