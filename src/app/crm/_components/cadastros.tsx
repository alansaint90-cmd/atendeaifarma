"use client";
import { useState } from "react";
import { adicionarFunil, adicionarMotivo, adicionarOportunidade, salvarAcessosFunis } from "@/lib/actions/crm";
import type { DadosCrm } from "./painel";
import type { Resultado } from "@/lib/acao";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Motivos } from "./motivos";
interface Props { catalogo: DadosCrm["catalogo"]; usuarioId: string; onSalvo: () => void }
export function CadastrosCrm({ catalogo, usuarioId, onSalvo }: Props) {
  const [erro,setErro] = useState(""); const [ocupado,setOcupado] = useState(false); const [funilId,setFunil] = useState("");
  const [acesso,setAcesso] = useState<{ usuarioId: string; version: number; funis: string[]; motivo: string } | null>(null);
  async function salvar(trabalho: () => Promise<Resultado<unknown>>) { setOcupado(true); setErro("");
    try { const r = await trabalho(); if (!r.ok) setErro(r.erro); else onSalvo(); } catch { setErro("Não foi possível salvar. Recarregue para conferir os dados."); } finally { setOcupado(false); setAcesso(null); } }
  return <section className="panel">{erro && <p role="alert">{erro}</p>}
    {catalogo.podeEditar && <details><summary>Nova oportunidade</summary><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);
      void salvar(() => adicionarOportunidade({ titulo: String(f.get("titulo")), valor: String(f.get("valor")), funilId, etapaId: String(f.get("etapaId")), responsavelId: String(f.get("responsavelId")), tags: f.getAll("tags").map(String) }));
    }}><div className="followup-grid"><label>Título<input name="titulo" required maxLength={120} /></label><label>Valor (ex.: 1500.00)<input name="valor" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,11})\.[0-9]{2}" defaultValue="0.00" /></label>
      <label>Funil<select required value={funilId} onChange={e => setFunil(e.target.value)}><option value="">Selecione</option>{catalogo.funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
      <label>Etapa<select name="etapaId" required key={funilId}>{catalogo.etapas.filter(e => e.funilId===funilId).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
      <label>Responsável<select name="responsavelId" defaultValue={usuarioId}>{catalogo.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
      <label>Tags<select name="tags" multiple>{catalogo.tags.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label></div><button className="primary" disabled={ocupado}>Criar oportunidade</button></form></details>}
    {catalogo.administrador && <details><summary>Administrar funis, motivos e acessos</summary>
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void salvar(() => adicionarFunil({ nome: String(f.get("nome")), etapas: String(f.get("etapas")).split("\n").map(s => s.trim()).filter(Boolean) })); }}>
        <h3>Novo funil</h3><label>Nome<input name="nome" required maxLength={120} /></label><label>Etapas, uma por linha<textarea name="etapas" required defaultValue={"Novo\nEm atendimento\nProposta"} /></label><button disabled={ocupado}>Criar funil</button></form>
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void salvar(() => adicionarMotivo({ nome: String(f.get("nome")) })); }}><h3>Motivos de perda</h3><p>{catalogo.motivos.map(m => m.nome).join(" · ") || "Nenhum motivo cadastrado."}</p><label>Novo motivo<input name="nome" required maxLength={120} /></label><button disabled={ocupado}>Adicionar motivo</button></form>
      <Motivos itens={catalogo.motivos} onSalvo={onSalvo} />
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const id = String(f.get("usuarioId")); setAcesso({ usuarioId: id, version: catalogo.usuarios.find(u => u.id === id)?.version ?? -1, funis: f.getAll("funis").map(String), motivo: String(f.get("motivo")) }); }}>
        <h3>Substituir acesso a funis</h3><p>Selecione a lista completa de funis permitidos ao atendente. Administradores possuem acesso a todos.</p><label>Usuário<select required name="usuarioId"><option value="">Selecione</option>{catalogo.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
        {catalogo.funis.map(f => <label key={f.id}><input type="checkbox" name="funis" value={f.id} />{f.nome}</label>)}<label>Motivo da alteração<textarea required minLength={5} maxLength={500} name="motivo" /></label><button disabled={ocupado}>Revisar permissões</button></form>
    </details>}
    <ModalConfirmacaoBlock aberto={!!acesso} titulo="Substituir permissões de funil" mensagem={`O usuário terá acesso somente aos ${acesso?.funis.length ?? 0} funis selecionados. A alteração vale na próxima consulta.`} carregando={ocupado} onCancelar={() => setAcesso(null)} onConfirmar={() => { if (acesso) void salvar(() => salvarAcessosFunis(acesso)); }} />
  </section>;
}
