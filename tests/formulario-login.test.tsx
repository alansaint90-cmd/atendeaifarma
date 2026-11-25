import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { FormularioLogin, FormularioPrimeiroAcesso } from "../src/app/entrar/_components/formulario";

const { navegar, atualizar } = vi.hoisted(() => ({ navegar: vi.fn(), atualizar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegar, replace: navegar, refresh: atualizar }) }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function preencherLogin() {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha", { exact: true }), { target: { value: "senha-de-teste" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar", exact: true }));
}

test("mostra e oculta a senha sem enviar o formulário", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<FormularioLogin />);
  const campo = screen.getByLabelText("Senha", { exact: true });
  expect(campo).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect(campo).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
  expect(campo).toHaveAttribute("type", "password");
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  [401, "E-mail ou senha incorretos."],
  [429, "Muitas tentativas. Aguarde alguns minutos e tente novamente."],
  [503, "O serviço está temporariamente indisponível. Tente novamente em instantes."],
])("mostra a mensagem adequada ao erro HTTP %i", async (status, mensagem) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status } as Response);
  render(<FormularioLogin />);
  preencherLogin();
  expect(await screen.findByRole("alert")).toHaveTextContent(mensagem);
  expect(screen.getByRole("link", { name: "Primeiro acesso" })).toBeVisible();
  expect(screen.queryByLabelText("Código de primeiro acesso")).not.toBeInTheDocument();
});

test("explica falha de conexão sem exibir detalhes internos", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
  render(<FormularioLogin />);
  preencherLogin();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
});

test("oferece o link de primeiro acesso sem abrir o formulário de ativação no login", () => {
  render(<FormularioLogin />);
  expect(screen.getByRole("link", { name: "Primeiro acesso" })).toHaveAttribute("href", "/entrar?modo=primeiro-acesso");
  expect(screen.queryByLabelText("Código de primeiro acesso")).not.toBeInTheDocument();
});

const conviteTeste = "a".repeat(43);
const senhaTeste = "senha fictícia para teste";

function preencherConvite(confirmacao = senhaTeste) {
  fireEvent.change(screen.getByLabelText("Código de primeiro acesso"), { target: { value: ` ${conviteTeste} ` } });
  fireEvent.change(screen.getByLabelText("Nova senha", { exact: true }), { target: { value: senhaTeste } });
  fireEvent.change(screen.getByLabelText("Confirme a nova senha"), { target: { value: confirmacao } });
  fireEvent.click(screen.getByRole("button", { name: "Ativar meu acesso" }));
}

test("ativa o primeiro acesso pela rota existente e abre o painel", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
  render(<FormularioPrimeiroAcesso />);
  preencherConvite();
  await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith("/"));
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/passkey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acao: "concluir_registro_senha", convite: conviteTeste, senha: senhaTeste }),
  });
});

test("pede senhas iguais antes de enviar o convite", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  render(<FormularioPrimeiroAcesso />);
  preencherConvite("senha diferente para teste");
  expect(screen.getByRole("alert")).toHaveTextContent("As senhas precisam ser iguais.");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("mostra a mesma orientação quando o servidor recusa o convite", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ erro: "detalhe interno" }, { status: 401 }));
  render(<FormularioPrimeiroAcesso />);
  preencherConvite();
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível ativar o acesso.");
  expect(screen.queryByText("detalhe interno")).not.toBeInTheDocument();
  expect(navegar).not.toHaveBeenCalled();
});

test("mostra o aviso de verificação da senha após ativar a conta", async () => {
  const aviso = "A lista de senhas vazadas está temporariamente indisponível.";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, aviso }));
  render(<FormularioPrimeiroAcesso />);
  preencherConvite();
  expect(await screen.findByRole("status")).toHaveTextContent(aviso);
  expect(screen.queryByLabelText("Código de primeiro acesso")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ir para o painel" })).toHaveAttribute("href", "/");
});
