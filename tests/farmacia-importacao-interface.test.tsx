import {afterEach,expect,test,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ImportarProdutos} from "@/components/farmacia/importar-produtos";
import {ProdutoForm} from "@/components/farmacia/produto-form";
const mocks=vi.hoisted(()=>({ler:vi.fn(),importar:vi.fn()}));
vi.mock("@/lib/farmacia/planilha",()=>({lerPlanilha:mocks.ler,modeloPlanilha:vi.fn()}));
vi.mock("@/lib/actions/farmacia",()=>({importarPlanilha:mocks.importar}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});

test("cadastro rápido não exige SKU e preserva os detalhes opcionais",()=>{
  const salvar=vi.fn();render(<ProdutoForm inicial={null} salvar={salvar} cancelar={()=>{}}/>);
  expect(screen.getByText("Mais detalhes do produto (opcional)").closest("details")).not.toHaveAttribute("open");
  for(const [nome,valor] of [["Nome comercial","Dipirona"],["Apresentação","caixa 10 comprimidos"],["Preço de venda","8,90"],["Quantidade inicial","25"],["Lote","L-01"],["Validade","2099-12-31"]])fireEvent.change(screen.getByLabelText(new RegExp(nome)),{target:{value:valor}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar produto e estoque"}));
  expect(salvar).toHaveBeenCalledWith(expect.objectContaining({sku:expect.stringMatching(/^AUTO-/),preco:"8.90",embalagem:1,minimo:0}),expect.objectContaining({quantidade:25}));
});
const linha={linha:2,nome:"Dipirona",concentracao:"500 mg",apresentacao:"caixa",preco:"8.90",quantidade:25,lote:"L-01",validade:"2099-12-31",receita:false,controle:""};
async function enviar() {
  const file=new File(["conteudo"],"produtos.xlsx");Object.defineProperty(file,"arrayBuffer",{value:async()=>new ArrayBuffer(8)});
  fireEvent.change(screen.getByLabelText("Arquivo Excel"),{target:{files:[file]}});
  await screen.findByText(/produtos válidos/);
}
test("linha inválida bloqueia o envio inteiro e mostra o erro",async()=>{
  mocks.ler.mockResolvedValue({linhas:[linha],erros:["Linha 3: informe validade"]});
  render(<ImportarProdutos cancelar={()=>{}} concluido={()=>{}}/>);await enviar();
  expect(screen.getByRole("alert")).toHaveTextContent("Linha 3");
  expect(screen.getByRole("button",{name:"Conferir e importar"})).toBeDisabled();expect(mocks.importar).not.toHaveBeenCalled();
});
test("prévia exige confirmação de três segundos e informa sucesso",async()=>{
  mocks.ler.mockResolvedValue({linhas:[linha],erros:[]});mocks.importar.mockResolvedValue({ok:true,dados:{produtos:1,embalagens:25}});
  const concluido=vi.fn();render(<ImportarProdutos cancelar={()=>{}} concluido={concluido}/>);await enviar();
  expect(screen.getByText("R$ 8,90")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Conferir e importar"}));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("25 embalagens");
  expect(screen.getByRole("button",{name:"Confirmar",exact:true})).toBeDisabled();expect(mocks.importar).not.toHaveBeenCalled();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Confirmar",exact:true})).toBeEnabled(),{timeout:4500});
  fireEvent.click(screen.getByRole("button",{name:"Confirmar",exact:true}));await waitFor(()=>expect(concluido).toHaveBeenCalledOnce());
  expect(mocks.importar).toHaveBeenCalledWith({chave:expect.any(String),linhas:[linha]});
});
