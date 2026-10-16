import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProximasConsultas } from "@/components/operacao/proximas-consultas";

afterEach(cleanup);
test("a lista distingue carregamento, falha e agenda vazia sem inventar pacientes", () => {
  const tentar = vi.fn();
  const tela = render(<ProximasConsultas agenda={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("Consultando agenda");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  tela.rerender(<ProximasConsultas agenda={null} erro="Agenda indisponível." aoTentarNovamente={tentar} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Agenda indisponível.");
  expect(screen.queryByText(/Nenhuma consulta futura/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar consultar agenda novamente" }));
  expect(tentar).toHaveBeenCalledOnce();
  tela.rerender(<ProximasConsultas agenda={{ dia: "2026-10-15", confirmadas: 0, livres: [], proximas: [] }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Nenhuma consulta futura confirmada");
  expect(screen.queryByText("Paciente fictício")).not.toBeInTheDocument();
});
