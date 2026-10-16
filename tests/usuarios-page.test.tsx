import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { UsuariosPage } from "@/components/usuarios/page";
import { carregarUsuarios, convidarUsuario } from "@/lib/actions/usuarios";

vi.mock("@/lib/actions/usuarios", () => ({ carregarUsuarios: vi.fn(), convidarUsuario: vi.fn(), atualizarUsuario: vi.fn(), reiniciarAcessoUsuario: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

test("gerente convida apenas SDR, com confirmação e código sem senha compartilhada", async () => {
  vi.mocked(carregarUsuarios).mockResolvedValue({ ok: true, dados: [] });
  vi.mocked(convidarUsuario).mockResolvedValue({ ok: true, dados: { convite: "convite-simulado" } });
  render(<UsuariosPage papel="admin" />);
  fireEvent.click(await screen.findByText("Novo usuário"));
  expect(screen.queryByRole("option", { name: "Gerente" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Pessoa de teste" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "teste@example.com" } });
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Nova contratação" } });
  vi.useFakeTimers(); fireEvent.click(screen.getByText("Salvar usuário"));
  expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  expect(convidarUsuario).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); });
  vi.useRealTimers();
  expect(await screen.findByLabelText("Código de primeiro acesso")).toHaveValue("convite-simulado");
  expect(convidarUsuario).toHaveBeenCalledWith({ nome: "Pessoa de teste", email: "teste@example.com", papel: "operador", motivo: "Nova contratação" });
  expect(carregarUsuarios).toHaveBeenCalledWith();
});

test("sem permissão não abre formulário de usuários", async () => {
  vi.mocked(carregarUsuarios).mockResolvedValue({ ok: false, erro: "Sem permissão." });
  render(<UsuariosPage papel="admin" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão.");
  expect(screen.queryByText("Novo usuário")).not.toBeInTheDocument();
});
