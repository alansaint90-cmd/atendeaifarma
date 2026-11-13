import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { AtendimentoManual } from "@/components/farmacia/atendimento";
import { enviarMensagemManual,validarCanalAtendimento } from "@/lib/actions/atendimento-farmacia";
vi.mock("@/lib/actions/atendimento-farmacia",()=>({assumirAtendimento:vi.fn(),enviarMensagemManual:vi.fn(),validarCanalAtendimento:vi.fn()}));
beforeEach(()=>{vi.stubGlobal("URL",class extends URL{static createObjectURL=vi.fn(()=>"blob:previa-teste");static revokeObjectURL=vi.fn();});});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
test("seleciona imagem, mostra prévia e conserva anexo e chave após falha incerta",async()=>{
  vi.mocked(enviarMensagemManual).mockResolvedValueOnce({ok:false,erro:"Entrega incerta."}).mockResolvedValueOnce({ok:true,dados:undefined});
  render(<AtendimentoManual id="conversa-teste" atualizar={vi.fn()}/>);
  const png=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"teste.png",{type:"image/png"});
  fireEvent.change(screen.getByLabelText("Arquivo de imagem"),{target:{files:[png]}});
  await screen.findByAltText("Imagem selecionada para enviar");
  fireEvent.change(screen.getByLabelText("Legenda da imagem"),{target:{value:"Embalagem"}});
  fireEvent.click(screen.getByRole("button",{name:"Enviar pelo WhatsApp"}));await screen.findByText("Entrega incerta.");
  const primeiro=vi.mocked(enviarMensagemManual).mock.calls[0][0];
  expect(primeiro).toEqual(expect.objectContaining({id:"conversa-teste",texto:"Embalagem",midia:{tipo:"image",mime:"image/png",base64:expect.any(String)}}));
  expect(screen.getByAltText("Imagem selecionada para enviar")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Enviar pelo WhatsApp"}));await screen.findByText("Mensagem enviada.");
  expect(vi.mocked(enviarMensagemManual).mock.calls[1][0]).toEqual(primeiro);
  expect(screen.queryByAltText("Imagem selecionada para enviar")).not.toBeInTheDocument();
});
test("validação de canal mostra diagnóstico e arquivo não permitido não habilita envio",async()=>{
  vi.mocked(validarCanalAtendimento).mockResolvedValue({ok:false,erro:"WhatsApp desconectado."});
  render(<AtendimentoManual id="conversa-teste" atualizar={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Ações do atendimento"}));
  fireEvent.click(screen.getByRole("button",{name:"Validar canal"}));await screen.findByText("WhatsApp desconectado.");
  expect(validarCanalAtendimento).toHaveBeenCalledWith("conversa-teste");
  fireEvent.change(screen.getByLabelText("Arquivo de imagem"),{target:{files:[new File(["<svg/>"],"teste.svg",{type:"image/svg+xml"})]}});
  await screen.findByText(/Escolha uma imagem JPG/);
  expect(screen.queryByRole("button",{name:"Enviar pelo WhatsApp"})).not.toBeInTheDocument();
});
test("microfone exige permissão, para a captura e oferece prévia antes de qualquer envio",async()=>{
  const parar=vi.fn();const getUserMedia=vi.fn().mockResolvedValue({getTracks:()=>[{stop:parar}]});
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia}});
  class GravadorTeste{
    static isTypeSupported=()=>true;state="inactive";ondataavailable:((e:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
    start(){this.state="recording";}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob([new Uint8Array([26,69,223,163,0,0,0,0])])});this.onstop?.();}
  }
  vi.stubGlobal("MediaRecorder",GravadorTeste);
  const tela=render(<AtendimentoManual id="conversa-teste" atualizar={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Gravar áudio"}));
  await screen.findByRole("button",{name:"Parar gravação"});expect(getUserMedia).toHaveBeenCalledWith({audio:true});
  expect(screen.queryByRole("button",{name:"Enviar pelo WhatsApp"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Parar gravação"}));
  await screen.findByLabelText("Ouvir áudio antes de enviar");await waitFor(()=>expect(parar).toHaveBeenCalled());
  expect(enviarMensagemManual).not.toHaveBeenCalled();
  tela.unmount();expect(URL.revokeObjectURL).toHaveBeenCalled();
});
