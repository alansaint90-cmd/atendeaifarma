import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContaMenu } from "@/components/conta-menu";
import { sairDoSistema } from "@/lib/actions/sessoes";

const substituir = vi.fn();
const atualizar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: substituir, refresh: atualizar }) }));
vi.mock("@/lib/actions/sessoes", () => ({ sairDoSistema: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("identificação mostra os dados da sessão e abre as opções da conta", () => {
  const abrirAssinatura = vi.fn();
  render(<ContaMenu nome="Wellington Junior" email="wellington@exemplo.com" aoAbrirAssinatura={abrirAssinatura} />);
  expect(screen.getByText("Wellington Junior")).toBeInTheDocument();
  expect(screen.getByText("wellington@exemplo.com")).toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abrir opções da conta" }));
  expect(screen.getByRole("menuitem", { name: "Meu cadastro" })).toHaveAttribute("href", "/perfil");
  fireEvent.click(screen.getByRole("menuitem", { name: "Minha assinatura" }));
  expect(abrirAssinatura).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("sair só redireciona após encerrar a sessão", async () => {
  vi.mocked(sairDoSistema).mockResolvedValueOnce({ ok: false, erro: "Não foi possível encerrar a sessão." }).mockResolvedValueOnce({ ok: true, dados: true });
  render(<ContaMenu nome="Wellington Junior" email="wellington@exemplo.com" aoAbrirAssinatura={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir opções da conta" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível encerrar a sessão.");
  expect(substituir).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
  await waitFor(() => expect(substituir).toHaveBeenCalledWith("/entrar"));
  expect(atualizar).toHaveBeenCalledOnce();
});
