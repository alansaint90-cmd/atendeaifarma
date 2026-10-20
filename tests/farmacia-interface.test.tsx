import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FarmaciaDashboard} from '@/components/farmacia/dashboard';
import {EstoquePage} from '@/components/farmacia/estoque';
import {PedidosPage} from '@/components/farmacia/pedidos';
import {ProdutoForm} from '@/components/farmacia/produto-form';
const a=vi.hoisted(()=>({carregarFarmacia:vi.fn(),carregarProdutos:vi.fn(),carregarPedidos:vi.fn(),carregarCadastrosFarmacia:vi.fn(),alterarPedido:vi.fn()}));
vi.mock('@/lib/actions/farmacia',()=>({...a,gravarProduto:vi.fn(),receberEstoque:vi.fn(),carregarHistorico:vi.fn(),ajustarInventario:vi.fn(),salvarHabilitacao:vi.fn(),registrarPedido:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
test.each(['8','8,90','8.90'])('cadastro envia produto e lote juntos com preço %s',preco=>{
  const salvar=vi.fn();render(<ProdutoForm inicial={null} salvar={salvar} cancelar={()=>{}}/>);
  for(const [campo,valor] of [['Nome comercial','Dipirona'],['SKU / código interno','DIP-DEMO'],['Apresentação','comprimidos'],['Preço de venda',preco],['Quantidade inicial','25'],['Lote','LOTE-1'],['Validade','2099-12-31']]) {
    fireEvent.change(screen.getByLabelText(new RegExp(campo)),{target:{value:valor}});
  }
  fireEvent.click(screen.getByRole('button',{name:'Salvar produto e estoque'}));
  expect(salvar).toHaveBeenCalledWith(expect.objectContaining({preco:preco==='8'?'8.00':'8.90'}),expect.objectContaining({quantidade:25,codigo:'LOTE-1',validade:'2099-12-31'}));
});
test('dashboard mostra falha de consulta sem inventar zero ou faturamento',async()=>{
  a.carregarFarmacia.mockResolvedValue({ok:false,erro:'Banco indisponível'});
  render(<FarmaciaDashboard abrir={()=>{}}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Banco indisponível');
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
});
test('estoque mostra preço real e distingue físico, reservado e disponível',async()=>{
  a.carregarProdutos.mockResolvedValue({ok:true,dados:{total:1,produtos:[{id:'p',nome:'Dipirona',principio:'Dipirona',sku:'DIP',concentracao:'500 mg',apresentacao:'comprimidos',embalagem:10,preco:'8.90',promocional:null,disponivel:2,fisico:5,reservado:3,validade:'2099-12-31',vencendo:false,vencido:false,ativo:true,minimo:3,receita:false,controle:''}]}});
  render(<EstoquePage gestor={false}/>);
  expect(await screen.findByText('R$ 8,90')).toBeInTheDocument();
  expect(screen.getByText('Ordem alfabética (A–Z)')).toBeInTheDocument();expect(screen.queryByLabelText('Ordenar')).not.toBeInTheDocument();
  expect(screen.getByText('2 disponíveis')).toBeInTheDocument();expect(screen.getByText('5 físicos · 3 reservados')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'+ Novo produto'})).not.toBeInTheDocument();expect(screen.getAllByText('Estoque baixo').length).toBeGreaterThan(0);
});
test('confirmação de venda exige referência e modal antes de chamar o servidor',async()=>{
  a.carregarCadastrosFarmacia.mockResolvedValue({ok:true,dados:{usuarios:[],contatos:[],categorias:[]}});
  a.carregarPedidos.mockResolvedValue({ok:true,dados:{total:1,pedidos:[{id:crypto.randomUUID(),numero:'F-TESTE',cliente:'Cliente',telefone:'+5571000000000',total:'17.80',status:'aguardando_pagamento',origem:'painel',responsavel:'Gerente',data:'2026-10-14T12:00:00Z',expira:null,conferencia:null,itens:[],eventos:[]}]}});
  render(<PedidosPage gestor/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir pedido'}));
  const confirmar=screen.getByRole('button',{name:'Confirmar venda e pagamento'});expect(confirmar).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Referência de pagamento/),{target:{value:'PIX conferido 123'}});fireEvent.click(confirmar);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('baixar definitivamente');expect(screen.getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();
  expect(a.alterarPedido).not.toHaveBeenCalled();
});
