import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { OperacaoPage } from "@/components/operacao/page";
import { carregarOperacao } from "@/lib/actions/operacao";
import { carregarPainel } from "@/lib/actions/painel";
import { carregarResumoAgenda } from "@/lib/actions/consultas";
vi.mock("@/lib/actions/consultas", () => ({ carregarResumoAgenda: vi.fn() }));
vi.mock("@/lib/actions/operacao", () => ({ carregarOperacao: vi.fn() }));
vi.mock("@/lib/actions/painel", () => ({ carregarPainel: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const painelVazio = { abertas: 0, pendentes: 0, atendimentoIa: 0, atendimentoHumano: 0,
  novas: 0, atendidasIa: 0, atendidasHumano: 0, totalAtendidas: 0, canais: [], contatos: [], evolucao: [], atualizadoEm: "2026-09-17T10:00:00.000Z" };

test("gerente vê métricas reais, percentual e abre a agenda", async () => {
  vi.mocked(carregarPainel).mockResolvedValue({ ok: true, dados: { ...painelVazio, novas: 24, atendidasIa: 18, totalAtendidas: 24 } });
  vi.mocked(carregarResumoAgenda).mockResolvedValue({ ok: true, dados: { dia: "2026-10-15", confirmadas: 4, livres: ["2026-10-15T13:40:00.000Z", "2026-10-15T14:20:00.000Z"], proximas: [{ id: "consulta-teste", nome: "Paciente Teste", inicio: "2026-10-15T11:00:00.000Z" }] } });
  const abrir = vi.fn();
  render(<OperacaoPage rota="dashboard" podeVerAgenda aoVerAgenda={abrir} />);
  const resumo = within(screen.getByRole("region", { name: "Resumo da clínica" }));
  expect(await resumo.findByText("75% das conversas atendidas")).toBeInTheDocument();
  expect(await resumo.findByText("10:40 · 11:20")).toBeInTheDocument();
  expect(resumo.getByText("4")).toBeInTheDocument();
  expect(resumo.getByText("2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver agenda" }));
  expect(abrir).toHaveBeenCalledOnce();
  const consultas = within(screen.getByRole("region", { name: "Próximas consultas" }));
  expect(consultas.getByText("Paciente Teste")).toBeInTheDocument();
  expect(consultas.getByText("08:00")).toBeInTheDocument();
  expect(consultas.queryByText("Paciente fictício")).not.toBeInTheDocument();
  fireEvent.click(consultas.getByRole("button", { name: "Ver todos os horários" }));
  expect(abrir).toHaveBeenCalledTimes(2);
});

test("SDR não solicita dados da agenda e falha não simula vagas vazias", async () => {
  vi.mocked(carregarPainel).mockResolvedValue({ ok: true, dados: painelVazio });
  const tela = render(<OperacaoPage rota="dashboard" />);
  await screen.findByText("Nenhum contato com atividade no período.");
  expect(carregarResumoAgenda).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Próximas consultas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver agenda" })).not.toBeInTheDocument();
  tela.unmount();
  vi.mocked(carregarResumoAgenda).mockResolvedValue({ ok: false, erro: "Agenda indisponível." });
  render(<OperacaoPage rota="dashboard" podeVerAgenda aoVerAgenda={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Agenda indisponível.");
  await screen.findByText("Nenhum contato com atividade no período.");
  const resumo = within(screen.getByRole("region", { name: "Resumo da clínica" }));
  expect(resumo.getAllByText("—")).toHaveLength(2);
});

test("dashboard usa os últimos sete dias e omite os blocos removidos", async () => {
  vi.mocked(carregarPainel).mockResolvedValue({ ok: true, dados: painelVazio });
  render(<OperacaoPage rota="dashboard" />);
  expect(await screen.findByText("Nenhum contato com atividade no período.")).toBeInTheDocument();
  expect(carregarPainel).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Atendimento com IA").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Atendimento humano").length).toBeGreaterThan(0);
  expect(screen.queryByText("Leads qualificados")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Resumo geral" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Resumo do período" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Filtros do painel" })).toBeInTheDocument();
  expect(screen.queryByText("Uma manhã bem organizada")).not.toBeInTheDocument();
  expect(carregarPainel).toHaveBeenCalledWith(expect.objectContaining({ canalId: null }));
  fireEvent.click(screen.getByRole("button", { name: "Hoje", exact: true }));
  await waitFor(() => expect(carregarPainel).toHaveBeenCalledTimes(2));
  const filtroHoje = vi.mocked(carregarPainel).mock.calls[1][0];
  expect(new Date(filtroHoje.fim).getTime() - new Date(filtroHoje.inicio).getTime()).toBe(86400000);
  fireEvent.click(screen.getByRole("button", { name: "Intervalo personalizado" }));
  fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-10-05" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  await waitFor(() => expect(carregarPainel).toHaveBeenCalledTimes(3));
});

test("falha de consulta não vira banco vazio e sessão recusada remove dados anteriores", async () => {
  vi.mocked(carregarOperacao).mockResolvedValue({ ok: false, erro: "Acesso recusado." });
  render(<OperacaoPage rota="contacts" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Acesso recusado.");
  expect(screen.queryByText(/0 contatos cadastrados/)).not.toBeInTheDocument();
});

test("falha do painel não mostra zeros como dados consultados", async () => {
  vi.mocked(carregarPainel).mockResolvedValue({ ok: false, erro: "Acesso recusado." });
  render(<OperacaoPage rota="dashboard" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Acesso recusado.");
  expect(screen.queryByLabelText("Resumo geral")).not.toBeInTheDocument();
});
