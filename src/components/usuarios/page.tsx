"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarUsuarios, convidarUsuario, atualizarUsuario, reiniciarAcessoUsuario } from "@/lib/actions/usuarios";
import type { UsuarioResumo } from "@/lib/auth/usuarios";
import type { Papel } from "@/lib/db/schema/_enums";
import { nomesPapeis } from "@/lib/auth/papeis";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

export function UsuariosPage({ papel }: { papel: Papel }) {
  const [itens, setItens] = useState<UsuarioResumo[] | null>(null);
  const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState(""); const [confirmar, setConfirmar] = useState<"salvar" | "reiniciar" | null>(null);
  const [alvo, setAlvo] = useState<UsuarioResumo | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [dados, setDados] = useState({ nome: "", email: "", papel: "operador", ativo: false, motivo: "" });
  const carregar = useCallback(async () => {
    setOcupado(true); setErro("");
    try { const r = await carregarUsuarios(); if (r.ok) setItens(r.dados); else setErro(r.erro); }
    catch { setErro("Não foi possível carregar usuários."); } finally { setOcupado(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);
  function editar(usuario: UsuarioResumo | null) {
    setAlvo(usuario); setCodigo(""); setFormulario(true);
    setDados({ nome: usuario?.nome ?? "", email: usuario?.email ?? "", papel: usuario?.papel ?? "operador", ativo: usuario?.ativo ?? false, motivo: "" });
  }
  async function salvar() {
    setOcupado(true); setErro(""); setCodigo("");
    try {
      const r = confirmar === "reiniciar" && alvo ? await reiniciarAcessoUsuario({ id: alvo.id, version: alvo.version, motivo: dados.motivo })
        : alvo ? await atualizarUsuario({ id: alvo.id, version: alvo.version, ...dados })
        : await convidarUsuario({ nome: dados.nome, email: dados.email, papel: dados.papel, motivo: dados.motivo });
      if (!r.ok) { setErro(r.erro); return; }
      if (r.dados && "convite" in r.dados) setCodigo(r.dados.convite);
      setFormulario(false); setAlvo(null); await carregar();
    } catch { setErro("Não foi possível salvar. Recarregue a lista."); }
    finally { setOcupado(false); setConfirmar(null); }
  }
  return <section className="page-stack"><div className="page-head"><div><h1>Equipe e usuários</h1><p>Gerencie os acessos individuais da sua equipe.</p></div></div>
    {erro && <p role="alert">{erro}</p>}
    {!itens && !erro && <p role="status">{ocupado ? "Carregando usuários…" : "Aguardando a consulta dos usuários."}</p>}
    {codigo && <article className="panel"><h2>Convite criado</h2><p>Entregue este código à pessoa por um canal privado. Em /entrar, ela deve escolher Primeiro acesso, definir a senha e cadastrar a passkey. Expira em 15 minutos.</p>
      <label>Código de primeiro acesso<input readOnly value={codigo} /></label><button onClick={() => setCodigo("")}>Ocultar código</button></article>}
    {itens && <article className="panel"><button className="primary" disabled={ocupado} onClick={() => editar(null)}>Novo usuário</button>
      {!itens.length && <p>Nenhum usuário cadastrado.</p>}
      <div className="table"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>{itens.map(u => <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{nomesPapeis[u.papel as Papel] ?? "Desconhecido"}</td><td>{u.ativo ? "Ativo" : "Inativo / primeiro acesso"}</td><td>{u.papel !== "super_admin" && <button disabled={ocupado} onClick={() => editar(u)}>Editar</button>}</td></tr>)}</tbody></table></div>
    </article>}
    {formulario && <form className="panel form-panel" onSubmit={e => { e.preventDefault(); setConfirmar("salvar"); }}><h2>{alvo ? "Editar usuário" : "Convidar usuário"}</h2>
      <label>Nome<input required minLength={2} maxLength={120} value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} /></label>
      <label>E-mail<input required type="email" maxLength={254} value={dados.email} onChange={e => setDados({ ...dados, email: e.target.value })} /></label>
      <label>Perfil<select value={dados.papel} onChange={e => setDados({ ...dados, papel: e.target.value })}><option value="operador">SDR</option>{papel === "super_admin" && <option value="admin">Gerente</option>}</select></label>
      {alvo && <label><input type="checkbox" checked={dados.ativo} onChange={e => setDados({ ...dados, ativo: e.target.checked })} />Usuário ativo</label>}
      <label>Motivo<input required minLength={5} maxLength={500} value={dados.motivo} onChange={e => setDados({ ...dados, motivo: e.target.value })} /></label>
      <p>A pessoa define a própria senha. Alterações encerram as sessões existentes.</p>
      <button className="primary" disabled={ocupado}>Salvar usuário</button>
      {alvo && <button type="button" disabled={ocupado || dados.motivo.trim().length < 5} onClick={() => setConfirmar("reiniciar")}>Reiniciar acesso e gerar convite</button>}
      <button type="button" disabled={ocupado} onClick={() => setFormulario(false)}>Cancelar</button>
    </form>}
    <ModalConfirmacaoBlock aberto={confirmar !== null} titulo={confirmar === "reiniciar" ? "Reiniciar acesso" : "Salvar usuário"}
      mensagem={confirmar === "reiniciar" ? "A conta ficará inativa, as sessões e passkeys serão revogadas. O usuário terá 15 minutos para cadastrar nova senha e passkey pelo convite." : "Confirma a alteração de acesso deste usuário?"}
      carregando={ocupado} onCancelar={() => setConfirmar(null)} onConfirmar={() => void salvar()} />
  </section>;
}
