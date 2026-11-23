import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { CaixaEntrada, type ConversaLista } from "@/components/conversas/caixa-entrada";
import { AvatarContato } from "@/components/conversas/avatar";
import { AtendimentoManual } from "@/components/farmacia/atendimento";
import { assumirAtendimento, enviarMensagemManual } from "@/lib/actions/atendimento-farmacia";
vi.mock("@/lib/actions/atendimento-farmacia",()=>({assumirAtendimento:vi.fn(),enviarMensagemManual:vi.fn()}));

afterEach(()=>{cleanup();vi.resetAllMocks();});
const conversas:ConversaLista[]=[
  {id:"a",nome:"Álvaro Silva",telefone:"+5571999990001",canal:"Farmácia",status:"open",mensagens:[{id:"m1",conteudo:"Olá, gostaria de consultar um produto.",direcao:"inbound",instante:"2026-11-12T13:00:00Z"}]},
  {id:"b",nome:"Beatriz Costa",telefone:"+5571999990002",canal:"Segundo número",status:"pending",mensagens:[{id:"m2",conteudo:"Pode verificar para mim?",direcao:"inbound",instante:"2026-11-12T14:00:00Z"},{id:"m3",conteudo:"Vou conferir para você.",direcao:"outbound",instante:"2026-11-12T14:01:00Z"}]},
];
function Tela() {
  const [id,selecionar]=useState("a");
  return <CaixaEntrada conversas={conversas} selecionada={id} aoSelecionar={selecionar} atualizar={vi.fn()} resposta={<textarea aria-label="Responder"/>}/>;
}

test("mostra o estado da IA ao lado do nome e atualiza após assumir a conversa",()=>{
  const props={selecionada:"a",aoSelecionar:vi.fn(),atualizar:vi.fn()};
  const tela=render(<CaixaEntrada {...props} conversas={[{...conversas[0],estadoIa:"ativa"}]}/>);
  const cabecalho=screen.getByRole("heading",{name:"Álvaro Silva"}).parentElement!;
  expect(within(cabecalho).getByText("Atendimento com IA")).toBeInTheDocument();
  tela.rerender(<CaixaEntrada {...props} conversas={[{...conversas[0],estadoIa:"humano"}]}/>);
  expect(within(cabecalho).getByText("Atendimento humano")).toBeInTheDocument();
  expect(within(cabecalho).queryByText("Atendimento com IA")).not.toBeInTheDocument();
});

test("notifica internamente a equipe e remove aviso ao assumir a conversa",()=>{
 const lista=conversas.map(c=>({...c,aguardaHumano:c.id==="a"}));
 const tela=render(<CaixaEntrada conversas={lista} selecionada="a" aoSelecionar={vi.fn()} atualizar={vi.fn()}/>);
 expect(screen.getByText(/1 atendimento\(s\) aguardando resposta da equipe/)).toBeInTheDocument();
 expect(screen.getByText(/a IA está pausada/)).toBeInTheDocument();
 expect(screen.getByText(/Aguardando atendente/)).toBeInTheDocument();
 tela.rerender(<CaixaEntrada conversas={conversas} selecionada="a" aoSelecionar={vi.fn()} atualizar={vi.fn()}/>);
 expect(screen.queryByText(/a IA está pausada/)).not.toBeInTheDocument();
});
test("lista nomes e prévias, troca histórico selecionado e mantém o campo de resposta",()=>{
  render(<Tela/>);
  expect(screen.getByRole("region",{name:"Histórico de Álvaro Silva"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Abrir conversa com Beatriz/}));
  const historico=within(screen.getByRole("region",{name:"Histórico de Beatriz Costa"}));
  expect(historico.getByText("Vou conferir para você.")).toBeInTheDocument();
  expect(historico.queryByText("Olá, gostaria de consultar um produto.")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:/Abrir conversa com Beatriz/})).toHaveAttribute("aria-pressed","true");
  expect(screen.getByRole("heading",{name:"Beatriz Costa"})).toHaveFocus();
  expect(screen.getByLabelText("Responder")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Voltar para a lista de conversas"}));
  expect(screen.getByLabelText("Buscar conversa")).toHaveFocus();
});
test("busca nome sem acentos, telefone e canal sem confundir ausência de resultado com lista vazia",()=>{
  render(<Tela/>);const busca=screen.getByLabelText("Buscar conversa");
  fireEvent.change(busca,{target:{value:"alvaro"}});
  expect(screen.getByRole("button",{name:/Abrir conversa com Álvaro/})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/Abrir conversa com Beatriz/})).not.toBeInTheDocument();
  fireEvent.change(busca,{target:{value:"Segundo número"}});
  expect(screen.getByRole("button",{name:/Abrir conversa com Beatriz/})).toBeInTheDocument();
  fireEvent.change(busca,{target:{value:"inexistente"}});
  expect(screen.getByRole("status")).toHaveTextContent("Nenhuma conversa encontrada para essa busca.");
});
test("foto indisponível ou inválida usa iniciais e não executa URL não HTTPS",()=>{
  const tela=render(<AvatarContato nome="Beatriz Costa" fotoUrl="https://example.invalid/foto.jpg"/>);
  const foto=tela.container.querySelector("img")!;expect(foto).toHaveAttribute("referrerpolicy","no-referrer");
  fireEvent.error(foto);expect(screen.getByText("BC")).toBeInTheDocument();
  tela.rerender(<AvatarContato nome="Álvaro Silva" fotoUrl="javascript:alert(1)"/>);
  expect(tela.container.querySelector("img")).toBeNull();expect(screen.getByText("ÁS")).toBeInTheDocument();
});
test("mensagem nova não arrasta quem está lendo mensagens anteriores",()=>{
  const props={conversas,selecionada:"a",aoSelecionar:vi.fn(),atualizar:vi.fn()};
  const tela=render(<CaixaEntrada {...props}/>);const historico=screen.getByRole("region",{name:"Histórico de Álvaro Silva"});
  Object.defineProperties(historico,{scrollHeight:{value:1000,configurable:true},clientHeight:{value:300,configurable:true}});
  historico.scrollTop=100;fireEvent.scroll(historico);
  const atualizadas=[{...conversas[0],mensagens:[...conversas[0].mensagens,{id:"nova",conteudo:"Outra mensagem",direcao:"inbound",instante:"2026-11-12T15:00:00Z"}]},conversas[1]];
  tela.rerender(<CaixaEntrada {...props} conversas={atualizadas}/>);
  expect(historico.scrollTop).toBe(100);
});
test("resposta manual conserva conversa, texto e chave até confirmar o envio",async()=>{
  vi.mocked(assumirAtendimento).mockResolvedValue({ok:true,dados:undefined});
  vi.mocked(enviarMensagemManual).mockResolvedValueOnce({ok:false,erro:"Entrega incerta. Confira antes de reenviar."}).mockResolvedValueOnce({ok:true,dados:undefined});
  render(<AtendimentoManual id="conversa-selecionada" atualizar={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Ações do atendimento"}));
  fireEvent.click(screen.getByRole("button",{name:"Assumir conversa"}));
  await screen.findByText("Conversa assumida. A IA está pausada.");
  expect(assumirAtendimento).toHaveBeenCalledWith({id:"conversa-selecionada",assumir:true});
  fireEvent.change(screen.getByLabelText("Mensagem do atendente"),{target:{value:"Vou conferir seu pedido."}});
  fireEvent.click(screen.getByRole("button",{name:"Enviar pelo WhatsApp"}));
  await screen.findByText("Entrega incerta. Confira antes de reenviar.");
  const primeiro=vi.mocked(enviarMensagemManual).mock.calls[0][0];
  expect(primeiro).toEqual({id:"conversa-selecionada",texto:"Vou conferir seu pedido.",chave:expect.any(String)});
  expect(screen.getByLabelText("Mensagem do atendente")).toHaveValue("Vou conferir seu pedido.");
  fireEvent.click(screen.getByRole("button",{name:"Enviar pelo WhatsApp"}));
  await waitFor(()=>expect(screen.getByLabelText("Mensagem do atendente")).toHaveValue(""));
  expect(vi.mocked(enviarMensagemManual).mock.calls[1][0].chave).toBe(primeiro.chave);
});
