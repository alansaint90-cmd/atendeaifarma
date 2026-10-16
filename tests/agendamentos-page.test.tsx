import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { AgendamentosPage } from "@/components/agendamentos/page";
import { carregarAgendamentos, gravarAgendamento, cancelarEnvioAgendado } from "@/lib/actions/agendamentos";
vi.mock("@/lib/actions/agendamentos", () => ({ carregarAgendamentos: vi.fn(), gravarAgendamento: vi.fn(), cancelarEnvioAgendado: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
test("criação exige confirmação e mostra agendamento salvo na tabela", async () => {
  vi.mocked(carregarAgendamentos).mockResolvedValue({ ok: true, dados: { itens: [], instancias: ["teste", "segundo", "levaelava"], processadorAtivo: false } });
  vi.mocked(gravarAgendamento).mockImplementation(async (entrada) => ({ ok: true, dados: { ...(entrada as { id: string; telefone: string; instancia: string; mensagem: string; agendadoPara: string }),
    status: "pendente", version: 0, codigoErro: null, enviadoEm: null } }));
  render(<AgendamentosPage />);
  fireEvent.click(await screen.findByText("+ Novo agendamento"));
  fireEvent.change(screen.getByLabelText("Chip"), { target: { value: "levaelava" } });
  fireEvent.change(screen.getByLabelText("Telefone com código do país"), { target: { value: "+5511999999999" } });
  fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Olá, podemos conversar?" } });
  vi.useFakeTimers(); fireEvent.click(screen.getByText("Salvar agendamento"));
  expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  expect(gravarAgendamento).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); });
  vi.useRealTimers(); expect(await screen.findByText("Agendamento salvo no servidor.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancelar envio" })).toBeInTheDocument();
  expect(cancelarEnvioAgendado).not.toHaveBeenCalled();
  expect(gravarAgendamento).toHaveBeenCalledWith(expect.objectContaining({ instancia: "levaelava" }), undefined);
});
