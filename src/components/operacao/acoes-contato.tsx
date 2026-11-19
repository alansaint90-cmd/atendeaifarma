"use client";
import { useRef, useState } from "react";
import type { Resultado } from "@/lib/acao";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";
import { MenuFila } from "../agendamentos/menu-fila";

interface Props {
  id: string; version: number; nome: string;
  excluir: (entrada: { id: string; version: number }) => Promise<Resultado<{ id: string }>>;
}

export function AcoesContato({ id, version, nome, excluir }: Props) {
  const [confirmacao, definirConfirmacao] = useState<{ id: string; version: number } | null>(null);
  const [ocupado, definirOcupado] = useState(false), [erro, definirErro] = useState("");
  const executando = useRef(false);
  async function confirmar() {
    if (!confirmacao || executando.current) return;
    executando.current = true; definirOcupado(true); definirErro("");
    try {
      const resultado = await excluir(confirmacao);
      if (resultado.ok) definirConfirmacao(null);
      else definirErro(resultado.erro);
    } catch { definirErro("Não foi possível confirmar a exclusão. Atualize os contatos para conferir o resultado."); }
    finally { executando.current = false; definirOcupado(false); }
  }
  return <>
    <MenuFila rotulo={`Opções do contato ${nome}`}>
      <button type="button" className="conversas-apagar" onClick={() => { definirErro(""); definirConfirmacao({ id, version }); }}>Excluir contato</button>
    </MenuFila>
    <ModalConfirmacaoBlock aberto={confirmacao !== null} titulo="Excluir contato?"
      mensagem={`Excluir ${nome} da lista e arquivar seus atendimentos? Pedidos, mensagens e auditoria serão preservados no sistema. As mensagens do WhatsApp permanecem no aplicativo. Uma nova mensagem recebida poderá criar um novo contato. Envios já iniciados podem terminar.${erro ? ` ${erro}` : ""}`}
      carregando={ocupado} textoConfirmar="Excluir contato" onCancelar={() => definirConfirmacao(null)} onConfirmar={() => void confirmar()} />
  </>;
}
