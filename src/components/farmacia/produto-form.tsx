"use client";
import { useState } from "react";
import type { Produto } from "@/lib/farmacia/catalogo";
import { salvarProdutoSchema, normalizarPreco, type ProdutoEntrada, type EstoqueInicial } from "@/lib/farmacia/validacao";
const vazio:ProdutoEntrada={nome:"",principio:"",generico:"",fabricante:"",categoria:"Medicamentos",concentracao:"",apresentacao:"",embalagem:1,ean:null,sku:"",preco:"",promocional:null,minimo:0,receita:false,controle:"",ativo:true,medicamento:true,observacoes:"",aliases:""};
export function ProdutoForm({inicial,salvar,cancelar}:{inicial:Produto|null;salvar:(p:ProdutoEntrada,estoque:EstoqueInicial|null)=>void;cancelar:()=>void}) {
  const [p,definir]=useState<ProdutoEntrada>(()=>inicial ? Object.fromEntries(Object.keys(vazio).map(k=>[k,inicial[k as keyof Produto]])) as ProdutoEntrada : vazio);
  const [erro,setErro]=useState("");
  const [comEstoque,setComEstoque]=useState(!inicial);
  const [lote,setLote]=useState({codigo:"",validade:"",quantidade:""});
  const [chave]=useState(()=>crypto.randomUUID());
  const campo=(chave:keyof ProdutoEntrada,nome:string,tipo="text")=>{const obrigatorio=["nome","sku","categoria","apresentacao","embalagem","minimo"].includes(chave);return <label key={chave}>{nome}{obrigatorio?" *":""}<input type={tipo} required={obrigatorio} min={tipo==="number"?(chave==="minimo"?0:1):undefined} step={tipo==="number"?1:undefined} minLength={["nome","categoria","apresentacao"].includes(chave)?2:undefined} value={String(p[chave]??"")} onChange={e=>definir({...p,[chave]:tipo==="number"?Number(e.target.value):e.target.value})} /></label>;};
  return <form className="panel farmacia-form" onSubmit={e=>{e.preventDefault();const estoqueInicial=!inicial&&comEstoque?{...lote,validade:lote.validade||null,quantidade:Number(lote.quantidade),chave}:null;const r=salvarProdutoSchema.safeParse({id:inicial?.id??null,atualizadoEm:inicial?.atualizadoEm??null,produto:{...p,preco:normalizarPreco(p.preco),promocional:p.promocional?normalizarPreco(p.promocional):null},estoqueInicial});if(!r.success){const issue=r.error.issues[0];setErro(`${issue.path.join(" · ")}: ${issue.message}`);return;}setErro("");salvar(r.data.produto,r.data.estoqueInicial??null);}}>
    <h2>{inicial ? "Editar produto" : "Novo produto"}</h2><div className="farmacia-fields">
      {campo("nome","Nome comercial")}{campo("sku","SKU / código interno")}{campo("principio","Princípio ativo")}{campo("generico","Nome genérico")}
      {campo("fabricante","Laboratório / fabricante")}{campo("categoria","Categoria")}{campo("concentracao","Dosagem / concentração")}{campo("apresentacao","Apresentação")}
      {campo("embalagem","Unidades por embalagem","number")}{campo("minimo","Estoque mínimo","number")}
      <label>Código de barras / EAN<input value={p.ean??""} inputMode="numeric" onChange={e=>definir({...p,ean:e.target.value||null})}/></label>
      <label>Preço de venda (R$) *<input required pattern="[0-9]{1,9}([,.][0-9]{1,2})?" title="Informe um preço como 8,90." value={p.preco} placeholder="8,90" inputMode="decimal" onChange={e=>definir({...p,preco:e.target.value})}/></label>
      <label>Preço promocional (opcional)<input pattern="[0-9]{1,9}([,.][0-9]{1,2})?" title="Informe um preço como 8,90." value={p.promocional??""} inputMode="decimal" onChange={e=>definir({...p,promocional:e.target.value||null})}/></label>
      {campo("controle","Classificação de controle especial")}{campo("aliases","Outros nomes de busca (sem equivalência terapêutica)")}
    </div><label>Observações<textarea value={p.observacoes} onChange={e=>definir({...p,observacoes:e.target.value})}/></label>
    <div className="farmacia-toolbar">{([['medicamento','Medicamento'],['receita','Exige receita'],['ativo','Produto ativo']] as const).map(([k,label])=><label key={k}><input type="checkbox" checked={p[k]} onChange={e=>definir({...p,[k]:e.target.checked})}/> {label}</label>)}</div>
    {!inicial?<fieldset><legend>Estoque inicial</legend><label><input type="checkbox" checked={comEstoque} onChange={e=>setComEstoque(e.target.checked)}/> Cadastrar quantidade e lote agora</label>
      {comEstoque?<><p>Informe a quantidade de embalagens disponíveis para venda. O preço é por embalagem.</p><div className="farmacia-fields">
        <label>Quantidade inicial *<input type="number" min="1" max="1000000" step="1" required value={lote.quantidade} onChange={e=>setLote({...lote,quantidade:e.target.value})}/></label>
        <label>Lote *<input required maxLength={180} value={lote.codigo} onChange={e=>setLote({...lote,codigo:e.target.value})}/></label>
        <label>Validade{p.medicamento?" *":" (opcional)"}<input type="date" required={p.medicamento} value={lote.validade} onChange={e=>setLote({...lote,validade:e.target.value})}/></label>
      </div><p>Produtos ativos com lote válido ficam disponíveis para a consulta da IA assim que o cadastro é salvo. Lotes vencidos não ficam disponíveis para venda.</p></>:<p>O produto será cadastrado sem saldo. Adicione mercadoria depois em “Lotes / entrada”.</p>}
    </fieldset>:<p>Para acrescentar quantidade, use “Lotes / entrada”. Editar o cadastro não altera o saldo.</p>}
    {erro&&<p role="alert">{erro}</p>}<div className="farmacia-toolbar"><button className="primary" type="submit">{!inicial&&comEstoque?"Salvar produto e estoque":"Salvar produto"}</button><button className="secondary" type="button" onClick={cancelar}>Cancelar</button></div>
  </form>;
}
