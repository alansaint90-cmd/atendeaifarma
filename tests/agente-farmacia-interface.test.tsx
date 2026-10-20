import {beforeEach,expect,test,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ChatbotsPage} from "@/components/chatbots/page";
import {ChatbotEditor} from "@/components/chatbots/editor";
import {chatbotExample} from "@/lib/chatbots/defaults";
import {promptAtendimentoFarmacia} from "@/lib/farmacia/prompt";
const a=vi.hoisted(()=>({carregarChatbots:vi.fn(),salvarChatbot:vi.fn()}));
vi.mock("@/lib/actions/chatbots",()=>a);
beforeEach(()=>{
  vi.clearAllMocks();
  Object.defineProperties(HTMLDialogElement.prototype,{
    showModal:{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}},
    close:{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}},
  });
});

test("cria agente da farmácia com prompt completo e salva apenas na instância selecionada",async()=>{
  a.carregarChatbots.mockResolvedValue({ok:true,dados:{itens:[],instancias:[{nome:"farmacia-teste",chatbotId:null}]}});
  a.salvarChatbot.mockImplementation(async entrada=>({ok:true,dados:{id:crypto.randomUUID(),versao:0,configuracao:entrada.configuracao}}));
  render(<ChatbotsPage/>);
  fireEvent.click(await screen.findByRole("button",{name:"Criar agente Atende Aí Pharma"}));
  expect(screen.getByLabelText("Contexto geral")).toHaveValue(promptAtendimentoFarmacia);
  expect(screen.getByLabelText("Nome da persona")).toHaveValue("Assistente Atende Aí");
  expect(screen.getByLabelText("Perguntar automaticamente o nome do cliente")).not.toBeChecked();
  expect(a.salvarChatbot).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
  await waitFor(()=>expect(a.salvarChatbot).toHaveBeenCalledWith(expect.objectContaining({id:null,instancia:"farmacia-teste",configuracao:expect.objectContaining({context:promptAtendimentoFarmacia})})));
  expect(await screen.findByRole("status")).toHaveTextContent("Configuração salva para farmacia-teste");
});

test("carregar o modelo não sobrescreve o prompt salvo sem ação de salvar",()=>{
  const salvar=vi.fn(),fechar=vi.fn();
  render(<ChatbotEditor initial={{...chatbotExample,context:"Prompt personalizado anterior"}} creating={false} onSave={salvar} onClose={fechar} error=""/>);
  expect(screen.getByLabelText("Contexto geral")).toHaveValue("Prompt personalizado anterior");
  fireEvent.click(screen.getByText("Prompt Atende Aí Pharma"));
  fireEvent.click(screen.getByRole("button",{name:"Carregar prompt da farmácia"}));
  expect(screen.getByLabelText("Contexto geral")).toHaveValue(promptAtendimentoFarmacia);
  expect(screen.getByLabelText("Perguntar automaticamente o nome do cliente")).not.toBeChecked();
  expect(salvar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Cancelar",exact:true}));
  expect(fechar).toHaveBeenCalled();expect(salvar).not.toHaveBeenCalled();
});
