"use client";
import { useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
import { MenuFila } from "../agendamentos/menu-fila";

interface Props {
  id: string; version: number; nome: string;
  apagar: (entrada: { id: string; version: number }) => Promise<Resultado<{ id: string }>>;
}

export function AcoesConversa({ id, version, nome, apagar }: Props) {
  const [confirmacao, definirConfirmacao] = useState<{ id: string; version: number } | null>(null);
  const [ocupado, definirOcupado] = useState(false), [erro, definirErro] = useState("");
  const executando = useRef(false);
  async function confirmar() {
    if (!confirmacao || executando.current) return;
    executando.current = true; definirOcupado(true); definirErro("");
    try {
      const resultado = await apagar(confirmacao);
      if (resultado.ok) definirConfirmacao(null);
      else definirErro(resultado.erro);
    } catch { definirErro("Não foi possível confirmar a exclusão. Atualize a caixa de entrada para conferir o resultado."); }
    finally { executando.current = false; definirOcupado(false); }
  }
  return <div className="conversas-menu">
    <MenuFila rotulo="Mais opções da conversa">
      <button type="button" className="conversas-apagar" onClick={() => { definirErro(""); definirConfirmacao({ id, version }); }}>Apagar conversa</button>
    </MenuFila>
    <ModalConfirmacaoBlock aberto={confirmacao !== null} titulo="Apagar conversa?"
      mensagem={`Remover a conversa de ${nome} da caixa de entrada? O contato, os pedidos e o histórico de auditoria serão preservados. Isso não apaga mensagens do WhatsApp. Uma nova mensagem recebida pode abrir outro atendimento. Envios já iniciados podem ser concluídos.${erro ? ` ${erro}` : ""}`}
      carregando={ocupado} textoConfirmar="Apagar conversa" onCancelar={() => definirConfirmacao(null)} onConfirmar={() => void confirmar()} />
  </div>;
}
