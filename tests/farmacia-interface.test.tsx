import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FarmaciaDashboard} from '@/components/farmacia/dashboard';
import {EstoquePage} from '@/components/farmacia/estoque';
import {PedidosPage} from '@/components/farmacia/pedidos';
import {ProdutoForm} from '@/components/farmacia/produto-form';
const a=vi.hoisted(()=>({carregarFarmacia:vi.fn(),carregarMovimentacao:vi.fn(),carregarProdutos:vi.fn(),carregarPedidos:vi.fn(),carregarCadastrosFarmacia:vi.fn(),alterarPedido:vi.fn(),gravarProduto:vi.fn()}));
vi.mock('@/lib/actions/farmacia',()=>({...a,receberEstoque:vi.fn(),carregarHistorico:vi.fn(),ajustarInventario:vi.fn(),salvarHabilitacao:vi.fn(),registrarPedido:vi.fn()}));
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
function prepararEstoque(){
  a.carregarFarmacia.mockResolvedValue({ok:true,dados:{estoque:{total:1,disponiveis:1,baixos:1,esgotados:0,vencendo:0}}});
  a.carregarMovimentacao.mockResolvedValue({ok:true,dados:{movimentos:[],categorias:['Medicamentos']}});
  a.carregarProdutos.mockResolvedValue({ok:true,dados:{total:1,produtos:[{id:'p',nome:'Dipirona',principio:'Dipirona',sku:'DIP',concentracao:'500 mg',apresentacao:'comprimidos',embalagem:10,preco:'8.90',promocional:null,disponivel:2,fisico:5,reservado:3,validade:'2099-12-31',vencendo:false,vencido:false,ativo:true,minimo:3,receita:false,controle:''}]}});
}
test('estoque mostra preço real e distingue físico, reservado e disponível',async()=>{
  prepararEstoque();
  render(<EstoquePage gestor={false}/>);
  expect(await screen.findByText('R$ 8,90')).toBeInTheDocument();
  expect(screen.getByLabelText('Ordenação')).toHaveValue('nome');expect(screen.getByLabelText('Ordenação').children).toHaveLength(1);
  expect(screen.getByText('2 disponíveis')).toBeInTheDocument();expect(screen.getByText('5 físicos · 3 reservados')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Novo produto',exact:true})).not.toBeInTheDocument();expect(screen.getAllByText('Estoque baixo').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button',{name:'Inativar Dipirona'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver recomendações'}));
  fireEvent.click(screen.getByRole('button',{name:'Ver estoque baixo'}));
  expect(screen.getByLabelText('Disponibilidade')).toHaveValue('baixo');
  fireEvent.change(await screen.findByLabelText('Itens por página'),{target:{value:'20'}});
  await screen.findByText('R$ 8,90');expect(a.carregarProdutos).toHaveBeenLastCalledWith(expect.objectContaining({disponibilidade:'baixo',porPagina:20,pagina:1,ordenar:'nome'}));
});
test('atalho de inativação preserva registros e exige confirmação bloqueada antes de gravar',async()=>{
  prepararEstoque();
  render(<EstoquePage gestor/>);
  fireEvent.click(await screen.findByRole('button',{name:'Inativar Dipirona'}));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Cadastro, lotes, pedidos e histórico serão preservados');
  expect(screen.getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();expect(a.gravarProduto).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Confirmar',exact:true}));expect(a.gravarProduto).not.toHaveBeenCalled();
});

test('confirmação de venda exige referência e modal antes de chamar o servidor',async()=>{
  a.carregarCadastrosFarmacia.mockResolvedValue({ok:true,dados:{usuarios:[],contatos:[],categorias:[]}});
  a.carregarPedidos.mockResolvedValue({ok:true,dados:{total:1,pedidos:[{id:crypto.randomUUID(),numero:'F-TESTE',cliente:'Cliente',telefone:'+5571000000000',total:'17.80',status:'aguardando_pagamento',origem:'painel',responsavel:'Gerente',data:'2026-10-14T12:00:00Z',pagamento:{forma:null,estado:'pendente'},expira:null,conferencia:null,itens:[],eventos:[]}]}});
  render(<PedidosPage gestor/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir pedido'}));
  const confirmar=screen.getByRole('button',{name:'Confirmar venda e pagamento'});expect(confirmar).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Referência de pagamento/),{target:{value:'PIX conferido 123'}});fireEvent.click(confirmar);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('baixar definitivamente');expect(screen.getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();
  expect(a.alterarPedido).not.toHaveBeenCalled();
});

test.each([
  ['pix','informado','Pago informado · conferir comprovante','Confirmar pagamento Pix'],
  ['pix','pago','Pago','Confirmar entrega'],
  ['cartao','na_entrega','Pagar na entrega','Confirmar entrega'],
  ['dinheiro','na_entrega','Pagar na entrega','Confirmar entrega'],
])('pedidos mostra %s %s e ação da etapa',async(forma,estado,texto,rotulo)=>{
  a.carregarCadastrosFarmacia.mockResolvedValue({ok:true,dados:{usuarios:[]}});
  a.carregarPedidos.mockResolvedValue({ok:true,dados:{total:1,pedidos:[{id:crypto.randomUUID(),numero:'F-TESTE',cliente:'Cliente',
    total:'12.00',status:'aguardando_pagamento',data:'2026-10-14T12:00:00Z',pagamento:{forma,estado},itens:[],eventos:[]}]}});
  render(<PedidosPage gestor/>);
  expect(await screen.findByRole('columnheader',{name:'Pagamento'})).toBeInTheDocument();
  expect(screen.getByText(texto)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Abrir pedido'}));
  expect(screen.getByRole('button',{name:rotulo})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Confirmar venda e pagamento'})).not.toBeInTheDocument();
});

test('pedidos mostram indicadores reais e enviam busca e período ao servidor',async()=>{
  a.carregarPedidos.mockResolvedValue({ok:true,dados:{pedidos:[],total:0,resumo:{total:42,concluidos:30,andamento:10,cancelados:2}}});
  render(<PedidosPage gestor={false}/>);await screen.findByText('42');
  expect(screen.getByText('30')).toBeInTheDocument();expect(screen.getByText('10')).toBeInTheDocument();expect(screen.getByText('2')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar pedido'),{target:{value:'Dipirona'}});
  fireEvent.change(screen.getByLabelText('Status'),{target:{value:'em_andamento'}});
  fireEvent.change(screen.getByLabelText('Período'),{target:{value:''}});
  await waitFor(()=>expect(a.carregarPedidos).toHaveBeenLastCalledWith({status:'em_andamento',pagina:1,termo:'Dipirona',periodo:null}));
  expect(screen.queryByRole('button',{name:'Confirmar venda e pagamento'})).not.toBeInTheDocument();
});
