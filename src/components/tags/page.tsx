"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarTags, salvarTag, excluirTag } from "@/lib/actions/tags";
import type { Tag } from "@/lib/tags/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

export function TagsPage({ ativo = true }: { ativo?: boolean }) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);
  const [confirm, setConfirm] = useState<"save" | "delete" | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const result = await carregarTags(); if (result.ok) { setTags(result.dados); setPage(0); } else setError(result.erro); }
    catch { setError("Falha de conexão ao carregar as tags."); } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (!ativo) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [ativo, load]);
  async function mutate() {
    setBusy(true); setError("");
    try {
      const result = confirm === "delete" ? await excluirTag({ id: removing?.id, version: removing?.version })
        : await salvarTag({ name: editing?.name ?? "", color: editing?.color ?? "#10b981" }, editing?.id ? { id: editing.id, version: editing.version } : undefined);
      if (!result.ok) { setError(result.erro); return; }
      setTags(previous => confirm === "delete" ? previous!.filter(tag => tag.id !== result.dados.id)
        : [...previous!.filter(tag => tag.id !== result.dados.id), result.dados].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null); setRemoving(null); setPage(0); setMessage(confirm === "delete" ? "Tag excluída. Os contatos foram preservados." : "Tag salva no servidor.");
    } catch { setError("Falha de conexão. Recarregue os dados antes de tentar novamente."); }
    finally { setBusy(false); setConfirm(null); }
  }
  const filtered = (tags ?? []).filter(tag => tag.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  return <div className="page-stack">
    <section className="page-head"><div><h1>Tags e rótulos</h1><p>Organize seus contatos com etiquetas e cores.</p></div></section>
    {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status">{message}</p>}
    {!tags && !error && <p role="status">{busy ? "Carregando tags e rótulos…" : "Aguardando a consulta das tags e rótulos."}</p>}
    {tags && <article className="panel"><div className="page-head"><label className="tag-search">Buscar tag ou rótulo<input placeholder="Busque pelo nome da tag" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <button className="primary" disabled={busy} onClick={() => { setEditing({ name: "", color: "#10b981" }); setError(""); }}>+ Nova tag</button></div>
      {editing && <form className="tag-editor" onSubmit={event => { event.preventDefault(); setConfirm("save"); }}><h2>{editing.id ? "Editar tag" : "Nova tag"}</h2>
        <label>Nome<input required maxLength={80} disabled={busy} value={editing.name ?? ""} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
        <label>Cor<input type="color" disabled={busy} value={editing.color ?? "#10b981"} onChange={event => setEditing({ ...editing, color: event.target.value })} /></label>
        <div className="feature-actions"><button className="primary" disabled={busy}>Salvar tag</button><button className="secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
      </form>}
      <div className="table"><table><thead><tr><th>Nome</th><th>Cor</th><th>Ações</th></tr></thead><tbody>{filtered.slice(currentPage * 10, currentPage * 10 + 10).map(tag => <tr key={tag.id}>
        <td>{tag.name}</td><td><span className="tag-swatch" style={{ backgroundColor: tag.color }} aria-label={`Cor ${tag.color}`} /></td><td><div className="feature-actions">
          <button className="secondary" disabled={busy} onClick={() => { setEditing(tag); setError(""); }}>Editar<span className="sr-only"> {tag.name}</span></button>
          <button className="secondary" disabled={busy} onClick={() => { setRemoving(tag); setConfirm("delete"); }}>Excluir<span className="sr-only"> {tag.name}</span></button>
        </div></td></tr>)}</tbody></table></div>
      {!filtered.length && <p className="feature-empty">{search ? "Nenhuma tag encontrada para essa busca." : "Nenhuma tag cadastrada. Crie sua primeira etiqueta."}</p>}
      <div className="feature-pagination"><span>{filtered.length} tags · página {currentPage + 1} de {Math.max(1, Math.ceil(filtered.length / 10))}</span>
        <button className="secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Anterior</button><button className="secondary" disabled={(currentPage + 1) * 10 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Próxima</button></div>
    </article>}
    <ModalConfirmacaoBlock aberto={confirm !== null} titulo={confirm === "delete" ? "Excluir tag" : "Salvar tag"}
      mensagem={confirm === "delete" ? `Excluir “${removing?.name}” da lista? O histórico e os contatos serão preservados.` : `Salvar a tag “${editing?.name}” no servidor?`}
      onConfirmar={() => void mutate()} onCancelar={() => setConfirm(null)} carregando={busy} />
  </div>;
}
