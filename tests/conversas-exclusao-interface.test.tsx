import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AcoesConversa } from "@/components/operacao/acoes-conversa";
import { CaixaEntrada } from "@/components/conversas/caixa-entrada";

afterEach(() => { cleanup(); vi.useRealTimers(); });
async function liberar() { for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(1000)); }
test("menu no cabeçalho, confirmação de três segundos e versão capturada antes da atualização", async () => {
  vi.useFakeTimers(); const apagar = vi.fn().mockResolvedValue({ ok: false, erro: "Registro alterado. Atualize e tente novamente." });
  const props = { id: "conversa-ficticia", version: 2, nome: "Contato fictício", apagar };
  const tela = render(<AcoesConversa {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Mais opções da conversa" }));
  fireEvent.click(screen.getByRole("button", { name: "Apagar conversa" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Isso não apaga mensagens do WhatsApp");
  expect(screen.getByRole("button", { name: "Apagar conversa" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("alertdialog")).toBeInTheDocument(); expect(apagar).not.toHaveBeenCalled();
  tela.rerender(<AcoesConversa {...props} version={3} />);
  await liberar(); fireEvent.click(screen.getByRole("button", { name: "Apagar conversa" }));
  await act(async () => {});
  expect(apagar).toHaveBeenCalledExactlyOnceWith({ id: props.id, version: 2 });
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Registro alterado. Atualize e tente novamente.");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
test("ação opcional fica no canto do cabeçalho sem contaminar o componente compartilhável", () => {
  const conversa = { id: "a", nome: "Fictício", telefone: null, canal: "Teste", status: "open", mensagens: [] };
  const tela = render(<CaixaEntrada conversas={[conversa]} selecionada="a" aoSelecionar={vi.fn()} atualizar={vi.fn()} acoesConversa={<button>Mais opções da conversa</button>} />);
  expect(screen.getByRole("button", { name: "Mais opções da conversa" }).closest("header")).toHaveClass("conversas-cabecalho");
  tela.rerender(<CaixaEntrada conversas={[]} selecionada="" aoSelecionar={vi.fn()} atualizar={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Mais opções da conversa" })).not.toBeInTheDocument();
});
