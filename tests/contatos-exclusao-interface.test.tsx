import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OperacaoPage } from "@/components/operacao/page";
import { AcoesContato } from "@/components/operacao/acoes-contato";
import { carregarOperacao, excluirContato } from "@/lib/actions/operacao";
vi.mock("@/lib/actions/operacao",()=>({carregarOperacao:vi.fn(),excluirContato:vi.fn(),apagarConversa:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();vi.useRealTimers();});
const contato={id:"00000000-0000-4000-8000-000000000099",version:2,nome:"Contato fictício",telefone:"+5511999990001",email:null,origem:"WhatsApp",status:"novo"};
const dados={abertas:0,pendentes:0,qualificados:0,taxaResposta:0,totalContatos:1,contatos:[contato],conversas:[],volume:[],atualizadoEm:"2026-11-19T12:00:00Z"};
async function liberar(){for(let i=0;i<3;i++)await act(()=>vi.advanceTimersByTimeAsync(1000));}
test("gestor abre menu fora da tabela e exclui só após confirmação bloqueada",async()=>{
 vi.mocked(carregarOperacao).mockResolvedValueOnce({ok:true,dados}).mockResolvedValue({ok:true,dados:{...dados,totalContatos:0,contatos:[]}});
 vi.mocked(excluirContato).mockResolvedValue({ok:true,dados:{id:contato.id}});
 render(<OperacaoPage rota="contacts" podeExcluirContato/>);await screen.findByText("Contato fictício");
 fireEvent.click(screen.getByRole("button",{name:"Opções do contato Contato fictício"}));
 expect(screen.getByRole("group",{name:/Opções do contato/}).closest("table")).toBeNull();
 vi.useFakeTimers();fireEvent.click(screen.getByRole("button",{name:"Excluir contato"}));
 expect(screen.getByRole("button",{name:"Excluir contato"})).toBeDisabled();expect(excluirContato).not.toHaveBeenCalled();
 fireEvent.keyDown(document,{key:"Escape"});expect(screen.getByRole("alertdialog")).toBeInTheDocument();
 await liberar();await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Excluir contato"}));});
 expect(excluirContato).toHaveBeenCalledExactlyOnceWith({id:contato.id,version:2});
 expect(screen.getByText("0 contatos cadastrados")).toBeInTheDocument();
});
test("operador não recebe o menu administrativo",async()=>{
 vi.mocked(carregarOperacao).mockResolvedValue({ok:true,dados});
 render(<OperacaoPage rota="contacts"/>);await screen.findByText("Contato fictício");
 expect(screen.queryByRole("button",{name:/Opções do contato/})).not.toBeInTheDocument();
});
test("erro preserva confirmação e versão original até cancelar",async()=>{
 vi.useFakeTimers();const excluir=vi.fn().mockResolvedValue({ok:false,erro:"Registro alterado. Atualize a lista."});
 const props={id:contato.id,version:2,nome:contato.nome,excluir};const tela=render(<AcoesContato {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:/Opções do contato/}));fireEvent.click(screen.getByRole("button",{name:"Excluir contato"}));
 tela.rerender(<AcoesContato {...props} version={3}/>);await liberar();
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Excluir contato"}));});
 expect(excluir).toHaveBeenCalledExactlyOnceWith({id:contato.id,version:2});
 expect(screen.getByRole("alertdialog")).toHaveTextContent("Registro alterado. Atualize a lista.");
 fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
