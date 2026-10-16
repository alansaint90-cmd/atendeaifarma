"use client";
import { useState } from "react";
import { PainelShell } from "./painel-shell";
import { nav } from "@/lib/demo/data";
import { demoViews } from "@/lib/demo/views";
import { ChatbotsPage } from "./chatbots/page";
import { OperacaoPage } from "./operacao/page";
import { Settings } from "./settings";
import { FollowupsPage } from "./followups/page";
import { TagsPage } from "./tags/page";
import { AgendamentosPage } from "./agendamentos/page";
import { UsuariosPage } from "./usuarios/page";
import { AssinaturaPage } from "./assinatura/page";
import type { Papel } from "@/lib/db/schema/_enums";
import { EstoquePage } from "./farmacia/estoque";
import { PedidosPage } from "./farmacia/pedidos";
import { FarmaciaDashboard } from "./farmacia/dashboard";

export function Workspace({ papel, nome, email, foto, rotaInicial = "dashboard" }: { papel: Papel; nome: string; email: string; foto?: string | null; rotaInicial?: string }) {
  const [route, setRoute] = useState(rotaInicial);
  const gestor = papel === "admin" || papel === "super_admin";
  return <PainelShell papel={papel} nome={nome} email={email} foto={foto} rota={route} titulo={route === "plans" ? "Minha assinatura" : nav.find(item => item[0] === route)?.[1] ?? "Dashboard"} aoNavegar={setRoute}>
      <main className="content">
        {/* Keep form drafts mounted across navigation, but hide inactive sections. */}
        {gestor && <><div hidden={route !== "chatbot"} className="page-stack"><ChatbotsPage /></div>
        <div hidden={route !== "followups"}><FollowupsPage ativo={route === "followups"} /></div>
        <div hidden={route !== "tags"}><TagsPage ativo={route === "tags"} /></div>
        <div hidden={route !== "agendamentos"}><AgendamentosPage ativoNaTela={route === "agendamentos"} /></div>
        </>}
        {gestor && route === "team" && <UsuariosPage papel={papel} />}
        {papel === "super_admin" && route === "settings" && <Settings />}
        {route === "plans" && <AssinaturaPage />}
        {route === "dashboard" && <FarmaciaDashboard abrir={setRoute} />}
        {route === "estoque" && <EstoquePage gestor={gestor} />}
        {route === "pedidos" && <PedidosPage gestor={gestor} />}
        {["contacts", "inbox"].includes(route) && <OperacaoPage rota={route} />}
        {!["dashboard", "contacts", "inbox", "team", "plans"].includes(route) && demoViews[route] && <div className="page-stack demo-view" dangerouslySetInnerHTML={{ __html: demoViews[route]() }} />}
      </main>
  </PainelShell>;
}
