"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarProdutos,gravarProduto,receberEstoque,carregarHistorico,ajustarInventario } from "@/lib/actions/farmacia";
import type { Produto } from "@/lib/farmacia/catalogo";
import { buscaSchema } from "@/lib/farmacia/validacao";
import { ProdutoForm } from "./produto-form";
import { ImportarProdutos } from "./importar-produtos";
import { dinheiro,useConfirmacao } from "./comum";
import type { z } from "zod";
type Historico=Extract<Awaited<ReturnType<typeof carregarHistorico>>,{ok:true}>["dados"];
export function EstoquePage({gestor}:{gestor:boolean}) {
  const [filtro,setFiltro]=useState<z.infer<typeof buscaSchema>>({termo:"",categoria:"",disponibilidade:"todos",ordenar:"nome",pagina:1});
  const [dados,setDados]=useState<{produtos:Produto[];total:number}|null>(null);const [erro,setErro]=useState("");
  const [editor,setEditor]=useState<Produto|null|undefined>(undefined);const [selecionado,selecionar]=useState<Produto|null>(null);
  const [historico,setHistorico]=useState<Historico|null>(null);
  const [importando,setImportando]=useState(false);const [aviso,setAviso]=useState("");
  const carregar=useCallback(async()=>{const r=await carregarProdutos(filtro);if(r.ok){setDados(r.dados);setErro("");}else setErro(r.erro);},[filtro]);
  useEffect(()=>{let ativo=true;const executar=()=>{if(ativo)void carregar().catch(()=>setErro("Consulta indisponível."));};const inicial=setTimeout(executar,200);const timer=setInterval(executar,10000);return()=>{ativo=false;clearTimeout(inicial);clearInterval(timer);};},[carregar]);
  const abrirHistorico=async(p:Produto)=>{selecionar(p);setHistorico(null);const r=await carregarHistorico(p.id);if(r.ok)setHistorico(r.dados);else setErro(r.erro);};
  const c=useConfirmacao(()=>{setEditor(undefined);void carregar();if(selecionado)void abrirHistorico(selecionado);});
  const mudar=<K extends keyof typeof filtro>(k:K,v:typeof filtro[K])=>setFiltro({...filtro,[k]:v,pagina:k==="pagina"?Number(v):1});
  return <div className="page-stack farmacia"><header className="page-head"><div><h1>Estoque</h1><p>Produtos, lotes e disponibilidade para venda. Atualização a cada 10 segundos.</p></div>{gestor&&<div className="farmacia-toolbar"><button className="secondary" onClick={()=>{setEditor(undefined);setImportando(true);setAviso("");}}>Importar Excel</button><button className="primary" onClick={()=>{setImportando(false);setEditor(null);}}>+ Novo produto</button></div>}</header>
    {(erro||c.erro)&&<p role="alert">{erro||c.erro}</p>}
    {aviso&&<p role="status">{aviso}</p>}
    {gestor&&importando&&<ImportarProdutos cancelar={()=>setImportando(false)} concluido={()=>{setImportando(false);setAviso("Importação concluída. Produtos e estoque cadastrados com sucesso.");void carregar();}}/>}
    {editor!==undefined&&<ProdutoForm key={editor?.id??"novo"} inicial={editor} cancelar={()=>setEditor(undefined)} salvar={(produto,estoqueInicial)=>c.confirmar(estoqueInicial?`Cadastrar ${produto.nome} com ${estoqueInicial.quantidade} embalagens no lote ${estoqueInicial.codigo}, ao preço de ${dinheiro(produto.promocional??produto.preco)}?`:"Salvar o cadastro e os preços deste produto?",()=>gravarProduto({id:editor?.id??null,atualizadoEm:editor?.atualizadoEm??null,produto,estoqueInicial}))}/>}
    <section className="panel"><div className="farmacia-toolbar"><label>Buscar produto<input type="search" placeholder="Nome, princípio ativo, EAN ou SKU" value={filtro.termo} onChange={e=>mudar("termo",e.target.value)}/></label>
      <label>Categoria<input value={filtro.categoria} placeholder="Todas" onChange={e=>mudar("categoria",e.target.value)}/></label>
      <label>Disponibilidade<select value={filtro.disponibilidade} onChange={e=>mudar("disponibilidade",e.target.value as typeof filtro.disponibilidade)}>{[["todos","Todos"],["disponivel","Disponível"],["baixo","Estoque baixo"],["esgotado","Esgotado"],["vencendo","Vence em até 30 dias"],["vencido","Com lote vencido"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
      <label>Ordenar<select value={filtro.ordenar} onChange={e=>mudar("ordenar",e.target.value as typeof filtro.ordenar)}><option value="nome">Nome</option><option value="quantidade">Quantidade</option></select></label>
      <button className="secondary" onClick={()=>void carregar()}>Atualizar</button></div>
      {!dados&&!erro&&<p role="status">Consultando estoque…</p>}{dados&&<><p>{dados.total} produtos encontrados</p>{!dados.produtos.length?<p>Nenhum produto encontrado. Cadastre um produto para começar.</p>:<div className="table"><table><thead><tr>{["Medicamento / produto","Apresentação","Preço","Estoque","Validade","Status","Ações"].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{dados.produtos.map(p=><tr key={p.id}>
        <td><strong>{p.nome}</strong><br/><small>{p.principio} · {p.sku}</small></td><td>{p.concentracao} {p.apresentacao}<br/>{p.embalagem} por embalagem</td><td>{dinheiro(p.promocional??p.preco)}</td>
        <td><strong>{p.disponivel} disponíveis</strong><br/><small>{p.fisico} físicos · {p.reservado} reservados</small></td><td>{p.validade??"—"}{p.vencendo&&<span className="farmacia-badge aviso">Próximo do vencimento</span>}{p.vencido&&<span className="farmacia-badge perigo">Lote vencido</span>}</td>
        <td><span className={`farmacia-badge ${!p.ativo||!p.disponivel?"perigo":p.disponivel<=p.minimo?"aviso":"ok"}`}>{!p.ativo?"Inativo":!p.disponivel?"Indisponível":p.disponivel<=p.minimo?"Estoque baixo":"Disponível"}</span>{(p.receita||p.controle)&&<small>Conferência de receita</small>}</td>
        <td><button className="secondary" onClick={()=>void abrirHistorico(p)}>Lotes / entrada</button>{gestor&&<button className="secondary" onClick={()=>setEditor(p)}>Editar</button>}</td></tr>)}</tbody></table></div>}
        <div className="farmacia-toolbar"><button disabled={filtro.pagina===1} onClick={()=>mudar("pagina",filtro.pagina-1)}>Anterior</button><span>Página {filtro.pagina}</span><button disabled={filtro.pagina*40>=dados.total} onClick={()=>mudar("pagina",filtro.pagina+1)}>Próxima</button></div></>}
    </section>
    {selecionado&&<section className="panel"><div className="farmacia-toolbar"><h2>{selecionado.nome} · lotes e movimentações</h2><button onClick={()=>selecionar(null)}>Fechar</button></div>
      <form className="farmacia-fields" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const v={produtoId:selecionado.id,codigo:String(f.get("codigo")),validade:String(f.get("validade"))||null,quantidade:Number(f.get("quantidade")),bloqueado:f.get("bloqueado")==="on",chave:crypto.randomUUID()};c.confirmar(`Registrar entrada de ${v.quantidade} embalagens, lote ${v.codigo}?`,()=>receberEstoque(v));}}>
        <label>Lote<input name="codigo" required maxLength={180}/></label><label>Validade<input name="validade" type="date" required={selecionado.medicamento}/></label><label>Quantidade de embalagens<input name="quantidade" type="number" min="1" required/></label><label><input name="bloqueado" type="checkbox"/> Bloquear para venda</label><button className="primary" type="submit">Entrada de mercadoria</button>
      </form>{!historico?<p role="status">Carregando lotes…</p>:<><div className="table"><table><thead><tr><th>Lote</th><th>Validade</th><th>Físico</th><th>Condição</th><th>Ajuste de inventário</th></tr></thead><tbody>{historico.lotes.map(l=><tr key={l.id}><td>{l.codigo}</td><td>{l.validade??"—"}</td><td>{l.quantidade}</td><td>{l.bloqueado?"Bloqueado":"Normal"}</td><td>{gestor&&<form className="farmacia-toolbar" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const v={loteId:l.id,quantidade:Number(f.get("qtd")),motivo:String(f.get("motivo")),atualizadoEm:l.atualizadoEm,chave:crypto.randomUUID()};c.confirmar(`Ajustar o saldo físico de ${l.quantidade} para ${v.quantidade}? Motivo: ${v.motivo}`,()=>ajustarInventario(v));}}><label>Saldo contado<input name="qtd" type="number" min="0" required defaultValue={l.quantidade}/></label><label>Motivo<input name="motivo" required minLength={5}/></label><button type="submit">Ajustar</button></form>}</td></tr>)}</tbody></table></div>
        <h3>Histórico recente</h3>{!historico.movimentos.length&&<p>Nenhuma movimentação.</p>}<ul className="farmacia-historico">{historico.movimentos.map(m=><li key={m.id}>{new Date(m.data).toLocaleString("pt-BR")} · {m.tipo} · lote {m.codigo} · {m.anterior} → {m.posterior} · {m.autor}<br/><small>{m.motivo}</small></li>)}</ul></>}
    </section>}{c.modal}
  </div>;
}
