"use client";
import { useEffect,useState } from "react";
import { carregarCadastrosFarmacia,carregarProdutos,registrarPedido } from "@/lib/actions/farmacia";
import type { Produto } from "@/lib/farmacia/catalogo";
import { dinheiro,useConfirmacao } from "./comum";
export function PedidoForm({fechar,salvo}:{fechar:()=>void;salvo:()=>void}) {
  const [contatos,setContatos]=useState<{id:string;nome:string;telefone:string|null}[]>([]);const [cliente,setCliente]=useState("");
  const [termo,setTermo]=useState("");const [produtos,setProdutos]=useState<Produto[]>([]);
  const [itens,setItens]=useState<{produto:Produto;quantidade:number}[]>([]);const [erro,setErro]=useState("");
  const [chave]=useState(()=>crypto.randomUUID());const c=useConfirmacao(salvo);
  useEffect(()=>{void carregarCadastrosFarmacia().then(r=>{if(r.ok)setContatos(r.dados.contatos);else setErro(r.erro);});},[]);
  useEffect(()=>{let ativo=true;const timer=setTimeout(()=>{void carregarProdutos({termo,disponibilidade:"disponivel"}).then(r=>{if(ativo){if(r.ok)setProdutos(r.dados.produtos);else setErro(r.erro);}});},200);return()=>{ativo=false;clearTimeout(timer);};},[termo]);
  return <section className="panel farmacia-form"><h2>Novo pedido</h2>{(erro||c.erro)&&<p role="alert">{erro||c.erro}</p>}
    <label>Cliente<select value={cliente} onChange={e=>setCliente(e.target.value)}><option value="">Selecione um contato</option>{contatos.map(p=><option key={p.id} value={p.id}>{p.nome} · {p.telefone}</option>)}</select></label>
    <p>Os contatos são os mesmos do CRM e do WhatsApp.</p><label>Buscar produto<input type="search" value={termo} onChange={e=>setTermo(e.target.value)}/></label>
    <div className="farmacia-resultados">{produtos.slice(0,8).map(p=><button key={p.id} className="secondary" disabled={itens.some(i=>i.produto.id===p.id)} onClick={()=>setItens([...itens,{produto:p,quantidade:1}])}>Adicionar {p.nome} {p.concentracao} · {p.apresentacao} · {dinheiro(p.promocional??p.preco)}</button>)}</div>
    {itens.map(i=><div key={i.produto.id} className="farmacia-toolbar"><strong>{i.produto.nome} {i.produto.concentracao}</strong><label>Embalagens<input type="number" min="1" max={i.produto.disponivel} value={i.quantidade} onChange={e=>setItens(itens.map(v=>v.produto.id===i.produto.id?{...v,quantidade:Number(e.target.value)}:v))}/></label><button onClick={()=>setItens(itens.filter(v=>v.produto.id!==i.produto.id))}>Remover</button></div>)}
    <p>Preços e quantidades serão conferidos no servidor. Registrar pedido não confirma venda.</p><div className="farmacia-toolbar"><button className="primary" disabled={!cliente||!itens.length} onClick={()=>c.confirmar("Registrar este pedido para conferência dos itens? Nenhuma baixa será realizada.",()=>registrarPedido({contatoId:cliente,conversaId:null,chave,itens:itens.map(i=>({produtoId:i.produto.id,quantidade:i.quantidade}))}))}>Registrar pedido</button><button className="secondary" onClick={fechar}>Cancelar</button></div>{c.modal}
  </section>;
}
