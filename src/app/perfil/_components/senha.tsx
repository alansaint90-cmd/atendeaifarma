"use client";
import { useState } from "react";
import { trocarMinhaSenha } from "@/lib/actions/seguranca";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
export function Senha() {
  const [atual, setAtual] = useState(""); const [nova, setNova] = useState(""); const [repetida, setRepetida] = useState("");
  const [mostrarAtual, setMostrarAtual] = useState(false); const [mostrarNova, setMostrarNova] = useState(false);
  const [mensagem, setMensagem] = useState(""); const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState(false); const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true); setErro("");
    try { const r = await trocarMinhaSenha({ atual, nova });
      if (!r.ok) { setErro(r.erro); return; }
      setAtual(""); setNova(""); setRepetida(""); setMensagem(`${r.dados.aviso ?? "Senha atualizada."} Todas as sessões foram encerradas. Entre novamente.`);
    } catch { setErro("Não foi possível alterar a senha."); } finally { setOcupado(false); setConfirmar(false); }
  }
  return <section className="panel profile-card"><h2>Redefinir senha</h2><form className="form-panel" onSubmit={e => {
    e.preventDefault(); setErro(""); setMensagem("");
    if (nova !== repetida) { setErro("A confirmação da nova senha não corresponde."); return; }
    setConfirmar(true);
  }}>
    <label>Senha atual<div className="profile-password"><input type={mostrarAtual ? "text" : "password"} autoComplete="current-password" maxLength={256} value={atual} onChange={e => setAtual(e.target.value)} /><button type="button" aria-label={mostrarAtual ? "Ocultar senha atual" : "Mostrar senha atual"} onClick={() => setMostrarAtual(!mostrarAtual)}>{mostrarAtual ? "Ocultar" : "Mostrar"}</button></div></label>
    <small>Se sua conta foi criada antes do login por senha, deixe a senha atual vazia.</small>
    <div className="profile-password-grid"><label>Nova senha<input type={mostrarNova ? "text" : "password"} required minLength={15} maxLength={256} autoComplete="new-password" value={nova} onChange={e => setNova(e.target.value)} /></label>
    <label>Confirmar nova senha<input type={mostrarNova ? "text" : "password"} required minLength={15} maxLength={256} autoComplete="new-password" value={repetida} onChange={e => setRepetida(e.target.value)} /></label></div>
    <button type="button" className="profile-visibility" onClick={() => setMostrarNova(!mostrarNova)}>{mostrarNova ? "Ocultar novas senhas" : "Mostrar novas senhas"}</button>
    {erro && <p role="alert">{erro}</p>}
    <button type="submit" className="primary" disabled={ocupado}>Redefinir senha</button></form>{mensagem && <p role="status">{mensagem} <a href="/entrar">Entrar</a></p>}
    <ModalConfirmacaoBlock aberto={confirmar} titulo="Alterar senha" mensagem="A senha será alterada e todas as suas sessões serão encerradas." carregando={ocupado} onCancelar={() => setConfirmar(false)} onConfirmar={() => void salvar()} />
  </section>;
}
