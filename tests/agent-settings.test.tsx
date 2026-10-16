import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
