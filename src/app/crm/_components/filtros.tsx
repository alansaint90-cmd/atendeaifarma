"use client";
import type { DadosCrm } from "./painel";
import type { FiltrosCrm } from "@/lib/crm/validacao";
interface Props { catalogo: DadosCrm["catalogo"]; valor: FiltrosCrm; ocupado: boolean; onAplicar: (f: FiltrosCrm) => void }
export function Filtros({ catalogo, valor, ocupado, onAplicar }: Props) {
  function periodo(dias: number | "mes") { const fim = new Date(); fim.setHours(24,0,0,0); const inicio = new Date(); inicio.setHours(0,0,0,0);
    if (dias === "mes") inicio.setDate(1); else inicio.setDate(inicio.getDate() - dias + 1);
    onAplicar({ ...valor, fechadoDe: inicio.toISOString(), fechadoAte: fim.toISOString(), pagina: 1 }); }
  const campoData = (v?: string) => v ? new Date(new Date(v).getTime()-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16) : "";
  return <form className="panel" key={JSON.stringify(valor)} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget);
    const obter = (chave: string) => String(f.get(chave) ?? "") || undefined;
    const data = (chave: string) => obter(chave) ? new Date(obter(chave)!).toISOString() : undefined;
    onAplicar({ pagina: 1, tags: f.getAll("tags").map(String), funilId: obter("funilId"), etapaId: obter("etapaId"), responsavelId: obter("responsavelId"),
      status: obter("status") as FiltrosCrm["status"], criadoDe: data("criadoDe"), criadoAte: data("criadoAte"), fechadoDe: data("fechadoDe"), fechadoAte: data("fechadoAte") });
  }}><h2>Filtros combinados</h2><div className="followup-grid">
    <label>Funil<select name="funilId" defaultValue={valor.funilId ?? ""}><option value="">Todos permitidos</option>{catalogo.funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
    <label>Etapa<select name="etapaId" defaultValue={valor.etapaId ?? ""}><option value="">Todas</option>{catalogo.etapas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
    <label>Responsável<select name="responsavelId" defaultValue={valor.responsavelId ?? ""}><option value="">Todos</option>{catalogo.usuarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={valor.status ?? ""}><option value="">Todos</option><option value="aberta">Aberta</option><option value="ganha">Ganha</option><option value="perdida">Perdida</option></select></label>
    {([ ["criadoDe", "Criadas a partir de"], ["criadoAte", "Criadas antes de"], ["fechadoDe", "Fechadas a partir de"], ["fechadoAte", "Fechadas antes de"] ] as const).map(([nome,label]) => <label key={nome}>{label}<input type="datetime-local" name={nome} defaultValue={campoData(valor[nome])} /></label>)}
    <label>Tags (todas as selecionadas)<select multiple name="tags" defaultValue={valor.tags}>{catalogo.tags.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
    </div><button className="primary" disabled={ocupado}>Aplicar filtros</button> <button type="button" disabled={ocupado} onClick={() => onAplicar({ pagina: 1, tags: [] })}>Limpar</button>
    <p>Fechamentos no período · fuso do navegador</p>{([[1,"Hoje"],[7,"7 dias"],[30,"30 dias"],["mes","Mês atual"]] as const).map(([p,l]) => <button type="button" key={p} disabled={ocupado} onClick={() => periodo(p)}>{l}</button>)}
    {valor.motivoId && <p>Filtro de motivo de perda aplicado. Use Limpar para remover.</p>}
  </form>;
}
