"use client";
import { useRef, useState } from "react";
import { importarPlanilha } from "@/lib/actions/farmacia";
import { lerPlanilha, modeloPlanilha, type PreviaPlanilha } from "@/lib/farmacia/planilha";
import { dinheiro, useConfirmacao } from "./comum";

export function ImportarProdutos({cancelar,concluido}:{cancelar:()=>void;concluido:()=>void}) {
  const [previa,setPrevia] = useState<PreviaPlanilha|null>(null);
  const [erro,setErro] = useState("");
  const [ocupado,setOcupado] = useState(false);
  const [chave,setChave] = useState("");
  const revisao = useRef(0);
  const c = useConfirmacao(concluido);
  async function selecionar(arquivo:File|undefined) {
    const atual = ++revisao.current;
    setPrevia(null);setErro("");
    if (!arquivo) return;
    if (!/\.xlsx$/i.test(arquivo.name) || arquivo.size>2*1024*1024) {setErro("Selecione um arquivo .xlsx de até 2 MB.");return;}
    setOcupado(true);
    try {
      const resultado = await lerPlanilha(await arquivo.arrayBuffer());
      if (revisao.current===atual) {setPrevia(resultado);setChave(crypto.randomUUID());}
    } catch (e) {if(revisao.current===atual)setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha.");}
    finally {if(revisao.current===atual)setOcupado(false);}
  }
  async function baixar() {
    setOcupado(true);setErro("");
    try {
      const url = URL.createObjectURL(new Blob([await modeloPlanilha()],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const link = document.createElement("a");link.href=url;link.download="modelo-produtos-atende-ai.xlsx";link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch {setErro("Não foi possível baixar o modelo. Tente novamente.");}
    finally {setOcupado(false);}
  }
  const quantidade = previa?.linhas.reduce((s,l)=>s+l.quantidade,0)??0;
  return <section className="panel farmacia-form" aria-labelledby="titulo-importacao">
    <h2 id="titulo-importacao">Importar produtos do Excel</h2>
    <p>Baixe o modelo, preencha uma linha por produto e envie um arquivo .xlsx com até 200 produtos (2 MB). A primeira linha contém os nomes das colunas.</p>
    <p>Preencha nome, apresentação, preço, quantidade e se exige receita (Sim ou Não). Com estoque, informe lote e validade do medicamento. Concentração ajuda a IA a encontrar a opção correta. SKU e demais detalhes são opcionais.</p>
    <p>A importação cadastra produtos novos. Para repor um produto existente, use “Lotes / entrada”. Uma linha inválida impede a importação inteira.</p>
    <div className="farmacia-toolbar"><button className="secondary" disabled={ocupado||c.ocupado} onClick={()=>void baixar()}>Baixar modelo Excel</button>
      <label>Arquivo Excel<input type="file" accept=".xlsx" disabled={ocupado||c.ocupado} onChange={e=>void selecionar(e.target.files?.[0])}/></label></div>
    {ocupado&&<p role="status">Preparando planilha…</p>}
    {(erro||c.erro)&&<p role="alert">{erro||c.erro}</p>}
    {!!previa?.erros.length&&<div role="alert"><p>Corrija a planilha e envie novamente:</p><ul>{previa.erros.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
    {previa&&<><p role="status">{previa.linhas.length} produtos válidos · {quantidade} embalagens. Confira antes de importar.</p>
      {!!previa.linhas.length&&<div className="table"><table><caption>Prévia dos produtos para cadastro</caption><thead><tr>{["Linha","Produto","Apresentação","Preço","Quantidade","Lote","Validade","Receita / controle"].map(t=><th key={t}>{t}</th>)}</tr></thead>
        <tbody>{previa.linhas.map(l=><tr key={l.linha}><td>{l.linha}</td><td>{l.nome} {l.concentracao}</td><td>{l.apresentacao}</td><td>{dinheiro(l.preco)}</td><td>{l.quantidade}</td><td>{l.lote||"—"}</td><td>{l.validade??"—"}</td><td>{l.receita?"Exige receita":"Não exige receita"}{l.controle&&` · ${l.controle}`}</td></tr>)}</tbody></table></div>}</>}
    <div className="farmacia-toolbar"><button className="primary" disabled={ocupado||!previa?.linhas.length||!!previa.erros.length||c.ocupado} onClick={()=>{
      if(previa)c.confirmar(`Cadastrar ${previa.linhas.length} produtos e ${quantidade} embalagens? Nenhum produto existente será atualizado.`,()=>importarPlanilha({chave,linhas:previa.linhas}));
    }}>Conferir e importar</button><button className="secondary" disabled={ocupado||c.ocupado} onClick={cancelar}>Cancelar importação</button></div>{c.modal}
  </section>;
}
