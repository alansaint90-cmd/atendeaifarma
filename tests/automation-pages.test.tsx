import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act, waitFor } from "@testing-library/react";
import { TagsPage } from "@/components/tags/page";
import { FollowupsPage } from "@/components/followups/page";
import { defaultFollowup, followupSchema } from "@/lib/followups/schema";
import { carregarTags, salvarTag, excluirTag } from "@/lib/actions/tags";
import { carregarFollowups, salvarFollowups } from "@/lib/actions/followups";

vi.mock("@/lib/actions/tags", () => ({ carregarTags: vi.fn(), salvarTag: vi.fn(), excluirTag: vi.fn() }));
vi.mock("@/lib/actions/followups", () => ({ carregarFollowups: vi.fn(), salvarFollowups: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
test("tags carregam, buscam e exigem confirmação antes de salvar", async () => {
  vi.mocked(carregarTags).mockResolvedValue({ ok: true, dados: [] });
  vi.mocked(salvarTag).mockResolvedValue({ ok: true, dados: { id: "teste", name: "Atleta", color: "#10b981", version: 0 } });
  render(<TagsPage />);
  fireEvent.click(await screen.findByText("+ Nova tag"));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Atleta" } });
  vi.useFakeTimers(); fireEvent.click(screen.getByText("Salvar tag"));
  expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  expect(salvarTag).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); });
  vi.useRealTimers(); expect(await screen.findByText("Tag salva no servidor.")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Busque pelo nome da tag"), { target: { value: "inexistente" } });
  expect(screen.getByText("Nenhuma tag encontrada para essa busca.")).toBeInTheDocument();
  expect(excluirTag).not.toHaveBeenCalled();
});
test("follow-up carrega três mensagens desligadas e valida ativação", async () => {
  vi.mocked(carregarFollowups).mockResolvedValue({ ok: true, dados: { config: structuredClone(defaultFollowup), version: 1, instance: "teste", instances: ["teste"] } });
  render(<FollowupsPage />);
  expect(await screen.findByLabelText("Chip")).toHaveValue("teste");
  expect(screen.getByLabelText("Follow-ups automáticos desligados")).not.toBeChecked();
  expect(screen.getByLabelText("Mensagem 3")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Follow-ups automáticos desligados"));
  fireEvent.click(screen.getByText("Salvar follow-ups"));
  expect(screen.getByRole("alert")).toHaveTextContent("ative ao menos uma mensagem");
  expect(salvarFollowups).not.toHaveBeenCalled();
});
test("follow-up preserva ajustes ao trocar de aba e recarrega o que foi salvo", async () => {
  let persisted = structuredClone(defaultFollowup);
  vi.mocked(carregarFollowups).mockImplementation(async () => ({ ok: true, dados: { config: structuredClone(persisted), version: 1, instance: "teste", instances: ["teste"] } }));
  vi.mocked(salvarFollowups).mockImplementation(async input => {
    persisted = followupSchema.parse(input);
    return { ok: true, dados: { config: structuredClone(persisted), version: 2, instance: "teste" } };
  });
  const view = render(<FollowupsPage />);
  const field = await screen.findByLabelText("Mensagem 1");
  fireEvent.change(field, { target: { value: "Mensagem ajustada para o cliente" } });
  expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
  view.rerender(<FollowupsPage ativo={false} />);
  view.rerender(<FollowupsPage ativo />);
  expect(screen.getByLabelText("Mensagem 1")).toHaveValue("Mensagem ajustada para o cliente");
  expect(carregarFollowups).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Salvar follow-ups" }));
  for (let i = 0; i < 3; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole("button", { name: "Confirmar" })).not.toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); });
  expect(salvarFollowups).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
  await waitFor(() => expect(screen.getByText("Follow-ups salvos no servidor.")).toBeInTheDocument());
  view.unmount();
  render(<FollowupsPage />);
  expect(await screen.findByLabelText("Mensagem 1")).toHaveValue("Mensagem ajustada para o cliente");
});
test("erro administrativo é exibido sem abrir os campos protegidos", async () => {
  vi.mocked(carregarTags).mockResolvedValue({ ok: false, erro: "Token inválido" });
  render(<TagsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Token inválido");
  expect(screen.queryByText("+ Nova tag")).not.toBeInTheDocument();
});

test("troca de chip consulta configuração separada e protege alterações pendentes", async () => {
  vi.mocked(carregarFollowups).mockImplementation(async (instancia = "primeiro") => {
    const config = structuredClone(defaultFollowup); config.instance = instancia;
    config.steps[0].text = `Mensagem do ${instancia}`;
    return { ok: true, dados: { config, version: 2, instance: instancia, instances: ["primeiro", "segundo", "levaelava"] } };
  });
  render(<FollowupsPage />);
  const chip = await screen.findByLabelText("Chip");
  fireEvent.change(chip, { target: { value: "segundo" } });
  await waitFor(() => expect(screen.getByLabelText("Mensagem 1")).toHaveValue("Mensagem do segundo"));
  expect(carregarFollowups).toHaveBeenLastCalledWith("segundo");
  fireEvent.change(screen.getByLabelText("Mensagem 1"), { target: { value: "Rascunho do segundo" } });
  expect(chip).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Desfazer alterações" }));
  expect(chip).not.toBeDisabled();
  fireEvent.change(chip, { target: { value: "primeiro" } });
  await waitFor(() => expect(screen.getByLabelText("Mensagem 1")).toHaveValue("Mensagem do primeiro"));
  fireEvent.change(chip, { target: { value: "levaelava" } });
  await waitFor(() => expect(screen.getByLabelText("Mensagem 1")).toHaveValue("Mensagem do levaelava"));
  expect(carregarFollowups).toHaveBeenLastCalledWith("levaelava");
});
