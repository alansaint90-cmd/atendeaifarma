import { configurarAgente } from "../agent/config";

export const NOME_FARMACIA = "Farmácia WE";
/** Atendimento direto vale também para chatbots antigos, sem sobrescrever o prompt salvo. */
export function configurarAgenteFarmacia(...args: Parameters<typeof configurarAgente>) {
  const resultado = configurarAgente(...args);
  if (resultado.success) {
    resultado.data.agendaConsultas = false;
    resultado.data.perguntarNome = false;
    resultado.data.openingMessages = undefined;
    resultado.data.AI_SYSTEM_PROMPT += `\nAtendimento comercial da ${NOME_FARMACIA}. Responda diretamente à solicitação; não pergunte o nome do cliente nem exija identificação para consultar produtos.`;
  }
  return resultado;
}
