import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { AudioMensagem } from "@/components/conversas/audio-mensagem";
import { CaixaEntrada } from "@/components/conversas/caixa-entrada";
import { GET } from "@/app/api/farmacia/audio/[id]/route";

const d = vi.hoisted(() => ({ acesso: vi.fn(), recuperar: vi.fn() }));
vi.mock("@/lib/auth/acesso-http", () => ({ administradorHttp: d.acesso }));
vi.mock("@/lib/db/client", () => ({ db: () => ({}) }));
vi.mock("@/lib/farmacia/audio-historico", () => ({ recuperarAudioHistorico: d.recuperar }));
const id = "f67a5ede-4b2d-469a-99b3-d97001dfb758";
const contexto = { params: Promise.resolve({ id }) };
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); d.acesso.mockResolvedValue({ sessao: { userId: id, papel: "operador" } });
  d.recuperar.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3, 4]), mime: "audio/ogg" });
});
test("rota exige sessão antes de acessar mídia e não revela erro interno", async () => {
  d.acesso.mockResolvedValueOnce({ erro: 401 });
  expect((await GET(new Request("https://crm.example.invalid"), contexto)).status).toBe(401);
  expect(d.recuperar).not.toHaveBeenCalled();
  d.recuperar.mockRejectedValueOnce(new Error("segredo fictício do provedor"));
  const falha = await GET(new Request("https://crm.example.invalid"), contexto);
  expect(falha.status).toBe(404); expect(await falha.text()).not.toContain("segredo");
});
test("rota transmite áudio privado e atende intervalos para reprodução", async () => {
  const resposta = await GET(new Request("https://crm.example.invalid"), contexto);
  expect(resposta.status).toBe(200); expect(resposta.headers.get("cache-control")).toContain("no-store");
  expect(resposta.headers.get("content-type")).toBe("audio/ogg");
  expect([...new Uint8Array(await resposta.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  for (const range of ["bytes=1-2", "bytes=-2"]) {
    const parcial = await GET(new Request("https://crm.example.invalid", { headers: { range } }), contexto);
    expect(parcial.status).toBe(206); expect(parcial.headers.get("content-length")).toBe("2");
  }
  for (const range of ["bytes=99-", "bytes=-0", "bytes=3-1", "bytes=1-2,3-4", "bytes=-"]) {
    expect((await GET(new Request("https://crm.example.invalid", { headers: { range } }), contexto)).status).toBe(416);
  }
});
test("histórico mostra texto do agente e controles de áudio recebidos e enviados", () => {
  const mensagens = [
    { id: "texto", conteudo: "Olá! Sou Débora, assistente virtual da Farmácia WE.", direcao: "outbound", instante: "2026-11-22T21:00:00Z" },
    ...["inbound", "outbound"].map(direcao => ({ id: direcao, conteudo: "[audio]", direcao, instante: "2026-11-22T21:00:01Z", tipo: "audio", audioDisponivel: true })),
  ];
  render(<CaixaEntrada conversas={[{ id, nome: "Contato fictício", telefone: null, canal: "Teste", status: "open", mensagens }]} selecionada={id} aoSelecionar={vi.fn()} atualizar={vi.fn()} fonteAudio={id => `/api/farmacia/audio/${id}`} />);
  expect(screen.getByText(mensagens[0].conteudo)).toBeInTheDocument();
  for (const direcao of ["recebido", "enviado"]) {
    const audio = screen.getByLabelText(`Reproduzir áudio ${direcao}`);
    expect(audio).toHaveAttribute("controls"); expect(audio).toHaveAttribute("preload", "none");
    expect(audio).not.toHaveAttribute("autoplay"); expect(audio.getAttribute("src")).toMatch(/^\/api\/farmacia\/audio\//);
  }
});
test("áudio mostra falha recuperável e ausência explícita, sem reprodução falsa", () => {
  const { unmount } = render(<AudioMensagem fonte={`/api/farmacia/audio/${id}`} disponivel recebida={false} />);
  fireEvent.error(screen.getByLabelText("Reproduzir áudio enviado"));
  expect(screen.getByText("Não foi possível carregar o áudio.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(screen.queryByText("Não foi possível carregar o áudio.")).not.toBeInTheDocument();
  unmount(); render(<AudioMensagem recebida />);
  expect(screen.getByText("Áudio indisponível para reprodução.")).toBeInTheDocument();
});
