import type { Chatbot } from "./schema";

export function montarInstrucoesDoAgente(chatbot: Chatbot | null): string {
  if (!chatbot?.context.trim()) return "";
  const contexto = chatbot.context;
  const fluxos = chatbot.flows.length
    ? chatbot.flows.map(fluxo => `- ${fluxo.name}: ${fluxo.description}`).join("\n")
    : "Nenhum fluxo específico cadastrado.";
  return [
    "CONFIGURAÇÃO DO CHATBOT SDR:",
    `Identificador: ${chatbot.identifier}`,
    `Persona: ${chatbot.persona} (${chatbot.gender})`,
    `Personalidade: ${chatbot.personalities.join(", ") || "não definida"}`,
    `Missão: ${chatbot.mission}`,
    "ESTOQUE REAL: preços e disponibilidade vêm do servidor; a venda exige confirmação autorizada. Não prescreva, diagnostique, sugira substituição terapêutica ou valide receitas.",
    "Prompt de atendimento obrigatório:",
    contexto,
    `Se não souber responder: ${chatbot.fallback}`,
    `Transferência humana: ${chatbot.transferHuman ? `habilitada para ${chatbot.destination}. Quando solicitada, acione transferir_para_humano. O servidor enviará o aviso salvo; não invente confirmação de transferência.` : "desabilitada. Não prometa transferir nem diga que transferiu."}`,
    "Fluxos inteligentes:",
    fluxos,
    "CONFIGURAÇÃO ATUAL — prevalece sobre exemplos do prompt e falas anteriores:",
    `Seu nome é ${chatbot.persona}. Apresente-se exclusivamente com esse nome, no gênero ${chatbot.gender}. O identificador ${chatbot.identifier} é interno, não é o nome do cliente.`,
    `Adote o tom ${chatbot.personalities.join(", ") || "profissional"} e a missão cadastrada acima. Não mantenha uma identidade antiga mencionada no histórico.`,
    "O histórico serve apenas para compreender o cliente, nunca para substituir estas configurações atuais.",
  ].join("\n");
}
