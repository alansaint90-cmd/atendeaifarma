import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentSettings } from "@/components/agent-settings";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test("não exibe prompt de orquestrador e aponta para o chatbot SDR", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ workerEnabled: false, enabled: false, queued: 0 })));
  const change = vi.fn();
  render(<AgentSettings values={{}} disabled={false} onChange={change} />);
  expect(screen.getByLabelText("Respostas automáticas")).toHaveValue("false");
  expect(screen.getByText(/respostas usam somente o prompt do chatbot SDR/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Contexto geral do orquestrador")).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
test("diagnóstico é consultado automaticamente pela sessão e exibe erro", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: "Redis indisponível" }, { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AgentSettings values={{}} disabled={false} onChange={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Redis indisponível");
  expect(fetchMock).toHaveBeenCalledWith("/api/settings/agent", { cache: "no-store" });
});

test("modo teste permite indicar um número e exige o campo ao ligar", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ workerEnabled: true, enabled: true, queued: 0 })));
  const mudar = vi.fn();
  const tela = render(<AgentSettings values={{}} disabled={false} onChange={mudar} />);
  expect(screen.getByRole("switch", { name: "Modo teste" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("switch", { name: "Modo teste" }));
  expect(mudar).toHaveBeenCalledWith("AI_TEST_MODE", "true");
  tela.rerender(<AgentSettings values={{ AI_TEST_MODE: "true" }} disabled={false} onChange={mudar} />);
  expect(screen.getByRole("switch", { name: "Modo teste" })).toBeChecked();
  const campo = screen.getByRole("textbox", { name: "Número de WhatsApp para teste" });
  expect(campo).toBeRequired();
  fireEvent.change(campo, { target: { value: "(11) 98123-4567" } });
  expect(mudar).toHaveBeenCalledWith("AI_TEST_WHATSAPP_NUMBER", "(11) 98123-4567");
});
