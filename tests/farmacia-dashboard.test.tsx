import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmaciaDashboard } from "@/components/farmacia/dashboard";
import { carregarFarmacia } from "@/lib/actions/farmacia";
import { periodoFarmacia } from "@/lib/farmacia/periodo";
vi.mock("@/lib/actions/farmacia",()=>({carregarFarmacia:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const dados={estoque:{total:3,disponiveis:2,esgotados:1,baixos:0,vencendo:0},vendas:{pedidos:1,confirmados:1,pendentes:0,faturamento:"12.90"},atendimento:{consultas:1,atendimentos:1},maisVendidos:[],atualizadoEm:"2026-11-13T12:00:00Z"};

test("dashboard oferece todos os períodos e aplica calendário sem a faixa de atualização",async()=>{
  vi.mocked(carregarFarmacia).mockResolvedValue({ok:true,dados});
  render(<FarmaciaDashboard abrir={vi.fn()}/>);
  const indicadores = await screen.findByLabelText("Indicadores comerciais");
  expect(indicadores.querySelectorAll("article")).toHaveLength(5);
  expect(screen.queryByText("Faturamento registrado", { exact: true })).not.toBeInTheDocument();
  expect(carregarFarmacia).toHaveBeenLastCalledWith(periodoFarmacia("hoje"));
  expect(screen.queryByText(/Todo o período|atualizado em/i)).not.toBeInTheDocument();
  const filtro=screen.getByLabelText("Período comercial");
  for(const atalho of ["ontem","7dias","15dias","30dias"] as const){
    fireEvent.change(filtro,{target:{value:atalho}});
    await waitFor(()=>expect(carregarFarmacia).toHaveBeenLastCalledWith(periodoFarmacia(atalho)));
  }
  fireEvent.change(filtro,{target:{value:"personalizado"}});
  expect(screen.queryByLabelText("Indicadores comerciais")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("De"),{target:{value:"2026-10-01"}});
  fireEvent.change(screen.getByLabelText("Até"),{target:{value:"2026-10-15"}});
  fireEvent.click(screen.getByRole("button",{name:"Aplicar"}));
  await waitFor(()=>expect(carregarFarmacia).toHaveBeenLastCalledWith({inicio:"2026-10-01",fim:"2026-10-15"}));
});

test("resposta atrasada não troca os indicadores do período selecionado",async()=>{
  let terminar:(valor:Awaited<ReturnType<typeof carregarFarmacia>>)=>void=()=>{};
  vi.mocked(carregarFarmacia).mockImplementationOnce(()=>new Promise(resolve=>{terminar=resolve;})).mockResolvedValue({ok:true,dados});
  render(<FarmaciaDashboard abrir={vi.fn()}/>);
  await waitFor(()=>expect(carregarFarmacia).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Período comercial"),{target:{value:"ontem"}});
  await screen.findByLabelText("Indicadores comerciais");
  await act(async()=>{terminar({ok:true,dados:{...dados,estoque:{...dados.estoque,total:999}}});});
  expect(screen.queryByText("999",{exact:true})).not.toBeInTheDocument();
});
