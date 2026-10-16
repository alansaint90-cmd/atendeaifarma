import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PainelCrm, type DadosCrm } from "../src/app/crm/_components/painel";
const actions = vi.hoisted(() => ({ carregarCrm: vi.fn(), fecharNegocio: vi.fn(), moverNegocio: vi.fn(), adicionarFunil: vi.fn(), adicionarMotivo: vi.fn(), adicionarOportunidade: vi.fn(), salvarAcessosFunis: vi.fn() }));
vi.mock("@/lib/actions/crm", () => actions);
const dados: DadosCrm = { catalogo: { funis: [{ id: "funil", nome: "Comercial" }], etapas: [{ id: "etapa", funilId: "funil", nome: "Novo", ordem: 0 }],
  motivos: [{ id: "motivo", nome: "Sem orçamento", updatedAt: "2026-09-17T00:00:00.000Z" }], usuarios: [{ id: "usuario", nome: "Ana", papel: "operador", version: 0 }], tags: [], administrador: false, podeEditar: true },
  consulta: { itens: [{ id: "op", titulo: "Matrícula", valor: "123.45", status: "aberta", funilId: "funil", etapaId: "etapa", responsavel: "Ana", updatedAt: "2026-09-17T00:00:00.000Z", criadoEm: "2026-09-17T00:00:00.000Z", fechadoEm: null }],
    resumo: { total: 1, ganhas: 0, perdidas: 0, receita: "0.00", conversao: "0" }, receitas: [], perdas: [] } };
describe("CRM", () => {
  it("exige motivo para perda e confirmação antes de chamar o servidor", () => {
    sessionStorage.clear(); render(<PainelCrm inicial={dados} usuarioId="usuario" />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar ganho ou perda" }));
    fireEvent.change(screen.getByLabelText("Resultado"), { target: { value: "perdida" } });
    expect(screen.getByRole("button", { name: "Revisar fechamento" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo da perda"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar fechamento" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(actions.fecharNegocio).not.toHaveBeenCalled();
  });
  it("falha de carregamento aparece sem substituir dados por números simulados", async () => {
    sessionStorage.clear(); actions.carregarCrm.mockResolvedValue({ ok: false, erro: "Sessão expirada." });
    render(<PainelCrm inicial={dados} usuarioId="usuario" />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sessão expirada."));
    expect(screen.getByText("Matrícula")).toBeInTheDocument();
  });
});
