import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { CaixaEntrada } from "@/components/conversas/caixa-entrada";
import { GET } from "@/app/api/farmacia/foto/[id]/route";

const portas=vi.hoisted(()=>({acesso:vi.fn(),recuperar:vi.fn()}));
vi.mock("@/lib/auth/acesso-http",()=>({administradorHttp:portas.acesso}));
vi.mock("@/lib/db/client",()=>({db:()=>({})}));
vi.mock("@/lib/farmacia/foto-conversa",()=>({recuperarFotoConversa:portas.recuperar}));
afterEach(()=>{cleanup();vi.resetAllMocks();});

test("rota privada exige autorização e só redireciona quando existe foto",async()=>{
  const id="f67a5ede-4b2d-469a-99b3-d97001dfb758";
  const requisicao=new Request("https://crm.example.invalid");
  const contexto={params:Promise.resolve({id})};
  portas.acesso.mockResolvedValueOnce({erro:401});
  expect((await GET(requisicao,contexto)).status).toBe(401);
  expect(portas.recuperar).not.toHaveBeenCalled();
  portas.acesso.mockResolvedValue({sessao:{userId:id,papel:"operador"}});
  portas.recuperar.mockResolvedValueOnce("https://pps.whatsapp.net/foto.jpg").mockResolvedValueOnce(null);
  const foto=await GET(requisicao,contexto);
  expect(foto.status).toBe(302);
  expect(foto.headers.get("location")).toBe("https://pps.whatsapp.net/foto.jpg");
  expect(foto.headers.get("cache-control")).toContain("no-store");
  expect((await GET(requisicao,contexto)).status).toBe(404);
});

test("lista e cabeçalho recuperam fotos ausentes ou expiradas e mostram iniciais se indisponíveis",()=>{
  const fonteFoto=(id:string)=>`/api/farmacia/foto/${id}`;
  const props={selecionada:"teste",aoSelecionar:vi.fn(),atualizar:vi.fn(),fonteFoto};
  const conversa={id:"teste",nome:"Ana Teste",telefone:null,canal:"Fictício",status:"open",mensagens:[]};
  const tela=render(<CaixaEntrada {...props} conversas={[conversa]}/>);
  const fotos=()=>[...tela.container.querySelectorAll("img")];
  expect(fotos().map(img=>img.getAttribute("src"))).toEqual([fonteFoto(conversa.id),fonteFoto(conversa.id)]);
  tela.rerender(<CaixaEntrada {...props} conversas={[{...conversa,fotoUrl:"https://pps.whatsapp.net/expirada.jpg"}]}/>);
  for(const img of fotos())fireEvent.error(img);
  expect(fotos().map(img=>img.getAttribute("src"))).toEqual([fonteFoto(conversa.id),fonteFoto(conversa.id)]);
  for(const img of fotos())fireEvent.error(img);
  expect(fotos()).toHaveLength(0);
  expect(within(tela.container).getAllByText("AT")).toHaveLength(2);
});
