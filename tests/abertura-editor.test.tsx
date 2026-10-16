import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatbotEditor } from "@/components/chatbots/editor";
import { chatbotExample } from "@/lib/chatbots/defaults";
afterEach(cleanup);
test("salva e remove a abertura sem alterar o prompt", () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
  const salvar = vi.fn();
  render(<ChatbotEditor initial={{ ...chatbotExample, context: "Prompt preservado" }} creating={false} onSave={salvar} onClose={() => {}} error="" />);
  fireEvent.change(screen.getByLabelText("Mensagem de abertura 1"), { target: { value: "Bem-vindo." } });
  fireEvent.change(screen.getByLabelText("Mensagem de abertura 2"), { target: { value: "Qual seu nome?" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(salvar).toHaveBeenLastCalledWith(expect.objectContaining({ context: "Prompt preservado", openingMessages: ["Bem-vindo.", "Qual seu nome?"] }));
  fireEvent.change(screen.getByLabelText("Mensagem de abertura 1"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Mensagem de abertura 2"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(salvar).toHaveBeenLastCalledWith(expect.objectContaining({ openingMessages: [] }));
});
