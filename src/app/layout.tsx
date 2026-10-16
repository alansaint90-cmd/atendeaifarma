import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/base.css";
import "@/styles/layout.css";
import "@/styles/features.css";
import "@/styles/improvements.css";
import "@/styles/ui.css";
import "@/styles/automation.css";
import "@/styles/marca.css";
import "@/styles/conta-menu.css";
import "@/styles/perfil.css";
import "@/styles/painel-operacional.css";
import "@/styles/design-juliana.css";
import "@/styles/farmacia.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const metadata: Metadata = { title: "Atende Aí Farmácia | Atendimento e estoque", description: "Atendimento pelo WhatsApp, estoque real e pedidos da sua farmácia." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable}><body>{children}</body></html>;
}
