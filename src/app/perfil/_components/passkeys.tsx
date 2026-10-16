"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { minhasPasskeys, removerMinhaPasskey } from "@/lib/actions/seguranca";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
export function Passkeys() {
  const router = useRouter();
  const [itens,setItens] = useState<{ id: string; nome: string }[] | null>(null);
  const [senha,setSenha] = useState(""); const [erro,setErro] = useState(""); const [ocupado,setOcupado] = useState(false); const [alvo,setAlvo] = useState<string | null>(null);
  async function carregar() { setOcupado(true); try { const r = await minhasPasskeys(); if (r.ok) setItens(r.dados); else setErro(r.erro); } catch { setErro("Falha ao consultar passkeys."); } finally { setOcupado(false); } }
  async function adicionar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "iniciar_fator", senha }) });
      setSenha(""); if (!r.ok) throw new Error();
      const dados = await r.json() as { options: PublicKeyCredentialCreationOptionsJSON };
      const resposta = await startRegistration({ optionsJSON: dados.options });
      const final = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "concluir_fator", resposta }) });
      if (!final.ok) throw new Error(); router.push("/entrar"); router.refresh();
    } catch { setErro("Não foi possível cadastrar a passkey. Confira a senha e tente novamente."); } finally { setOcupado(false); }
  }
  async function remover() {
    setOcupado(true); try { const r = await removerMinhaPasskey(alvo); if (!r.ok) setErro(r.erro); else { router.push("/entrar"); router.refresh(); } }
    catch { setErro("Não foi possível remover a passkey."); } finally { setOcupado(false); setAlvo(null); }
  }
  return <section className="panel form-panel"><h2>Minhas passkeys</h2><button disabled={ocupado} onClick={() => void carregar()}>Carregar passkeys</button>{erro && <p role="alert">{erro}</p>}
    {itens?.map(i => <div key={i.id}>{i.nome} <button disabled={ocupado || itens.length < 2} onClick={() => setAlvo(i.id)}>Remover</button></div>)}
    <p>Mantenha ao menos uma passkey. Cadastre outra antes de remover a anterior. Alterar passkeys encerra suas sessões; entre novamente depois.</p>
    <label>Senha para adicionar passkey<input type="password" maxLength={256} autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} /></label>
    <button disabled={ocupado || !senha} onClick={() => void adicionar()}>Adicionar passkey</button>
    <ModalConfirmacaoBlock aberto={alvo !== null} titulo="Remover passkey" mensagem="A passkey será removida e todas as suas sessões serão encerradas." carregando={ocupado} onCancelar={() => setAlvo(null)} onConfirmar={() => void remover()} />
  </section>;
}
