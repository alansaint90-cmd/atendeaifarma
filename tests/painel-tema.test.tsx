import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PainelShell } from "@/components/painel-shell";
vi.mock("@/components/conta-menu",()=>({ContaMenu:({aoAbrirAssinatura}:{aoAbrirAssinatura:()=>void})=><button onClick={aoAbrirAssinatura}>Minha assinatura</button>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.body.style.overflow="";});
const props={nome:"Gestor fictício",email:"teste@example.invalid",rota:"dashboard",titulo:"Dashboard",aoNavegar:vi.fn()};

test("tema conserva destinos e permissões do menu e recolhimento no desktop",()=>{
 const navegar=vi.fn();const tela=render(<PainelShell {...props} papel="admin" aoNavegar={navegar}><p>Conteúdo real</p></PainelShell>);
 expect(screen.getByRole("button",{name:"Dashboard",exact:true})).toHaveAttribute("aria-current","page");
 expect(screen.queryByRole("button",{name:"Configurações"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Campanhas"}));expect(navegar).toHaveBeenLastCalledWith("campaigns");
 fireEvent.click(screen.getByRole("button",{name:"Alternar menu"}));expect(screen.getByRole("button",{name:"Alternar menu"})).toHaveAttribute("aria-expanded","false");
 expect(tela.container.querySelectorAll(".nav-label")).toHaveLength(0);
 expect(screen.getByRole("button",{name:"Estoque"})).toHaveAttribute("title","Estoque");
 fireEvent.click(screen.getByRole("button",{name:"Alternar menu"}));
 expect(screen.getByRole("button",{name:"Estoque"})).toHaveTextContent("Estoque");
 expect(screen.getByRole("button",{name:"Estoque"})).not.toHaveAttribute("title");
 tela.rerender(<PainelShell {...props} papel="operador"><p>Conteúdo real</p></PainelShell>);
 expect(screen.queryByRole("button",{name:"Campanhas"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Equipe"})).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Estoque"})).toBeInTheDocument();
});

test("menu recolhido no desktop recupera os nomes ao abrir no celular",()=>{
 let pequena=false;const ouvintes=new Set<()=>void>();
 vi.stubGlobal("matchMedia",()=>({matches:pequena,addEventListener:(_tipo:string,ouvinte:()=>void)=>ouvintes.add(ouvinte),removeEventListener:(_tipo:string,ouvinte:()=>void)=>ouvintes.delete(ouvinte)}));
 const tela=render(<PainelShell {...props} papel="admin"><p>Conteúdo real</p></PainelShell>);
 fireEvent.click(screen.getByRole("button",{name:"Alternar menu"}));
 expect(tela.container.querySelectorAll(".nav-label")).toHaveLength(0);
 act(()=>{pequena=true;ouvintes.forEach(ouvinte=>ouvinte());});
 fireEvent.click(screen.getByRole("button",{name:"Alternar menu"}));
 const estoque=within(screen.getByRole("dialog")).getByRole("button",{name:"Estoque"});
 expect(estoque).toHaveTextContent("Estoque");expect(estoque).not.toHaveAttribute("title");
});

function celular(){vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));}
test("menu móvel preserva foco, bloqueia fundo e fecha ao navegar",()=>{
 celular();document.body.style.overflow="auto";const navegar=vi.fn();
 const tela=render(<PainelShell {...props} papel="admin" aoNavegar={navegar}><button>Ação do painel</button></PainelShell>);
 const alternar=screen.getByRole("button",{name:"Alternar menu"});expect(alternar).toHaveAttribute("aria-expanded","false");
 fireEvent.click(alternar);const dialogo=screen.getByRole("dialog",{name:"Menu principal"});
 const fechar=within(dialogo).getByRole("button",{name:"Fechar menu",exact:true});expect(fechar).toHaveFocus();
 expect(tela.container.querySelector(".workspace")).toHaveAttribute("inert");expect(document.body.style.overflow).toBe("hidden");
 fireEvent.keyDown(fechar,{key:"Tab",shiftKey:true});expect(screen.getByRole("button",{name:"Minha assinatura"})).toHaveFocus();
 fireEvent.keyDown(document.activeElement!,{key:"Tab"});expect(fechar).toHaveFocus();
 fireEvent.click(within(dialogo).getByRole("button",{name:"Campanhas"}));expect(navegar).toHaveBeenCalledWith("campaigns");
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(document.body.style.overflow).toBe("auto");expect(alternar).toHaveFocus();
});

test("menu móvel fecha por Escape e pelo fundo sem executar ações do painel",()=>{
 celular();const acao=vi.fn();render(<PainelShell {...props} papel="super_admin"><button onClick={acao}>Ação do painel</button></PainelShell>);
 const alternar=screen.getByRole("button",{name:"Alternar menu"});fireEvent.click(alternar);
 expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Configurações"})).toBeInTheDocument();
 fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 fireEvent.click(alternar);fireEvent.click(screen.getByRole("button",{name:"Fechar menu lateral"}));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(acao).not.toHaveBeenCalled();
});
