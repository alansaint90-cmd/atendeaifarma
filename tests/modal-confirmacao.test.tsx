import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModalConfirmacaoBlock } from "../src/components/modal-confirmacao-block";

afterEach(() => vi.useRealTimers());
it("bloqueia confirmação e cancelamento por três segundos e ignora ESC", () => {
  vi.useFakeTimers();
  const confirmar = vi.fn();
  const cancelar = vi.fn();
  render(<ModalConfirmacaoBlock aberto titulo="Confirmar alteração" mensagem="Confira os dados." onConfirmar={confirmar} onCancelar={cancelar} />);
  const botao = screen.getByRole("button", { name: "Confirmar" });
  expect(botao).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  expect(cancelar).not.toHaveBeenCalled();
  for (let n = 0; n < 3; n++) act(() => vi.advanceTimersByTime(1000));
  expect(botao).toBeEnabled();
  fireEvent.click(botao);
  expect(confirmar).toHaveBeenCalledOnce();
});
