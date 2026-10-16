import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("ROTA_INDISPONIVEL"); } }));
vi.mock("./_components/previa-design", () => ({ PreviaDesign: () => null }));
import PaginaPreviaDesign from "./page";

afterEach(() => vi.unstubAllEnvs());
describe("isolamento da prévia de design", () => {
  it("não disponibiliza a prévia em produção mesmo com a opção ligada", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATENDEIA_PREVIA_LOCAL", "true");
    expect(() => PaginaPreviaDesign()).toThrow("ROTA_INDISPONIVEL");
  });
  it("não disponibiliza a prévia clínica em desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ATENDEIA_PREVIA_LOCAL", "false");
    expect(() => PaginaPreviaDesign()).toThrow("ROTA_INDISPONIVEL");
    vi.stubEnv("ATENDEIA_PREVIA_LOCAL", "true");
    expect(() => PaginaPreviaDesign()).toThrow("ROTA_INDISPONIVEL");
  });
});
