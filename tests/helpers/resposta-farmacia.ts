import type { RespostaGerada } from "../../src/lib/agent/providers";
export function textoResposta(resposta: RespostaGerada): string {
  return typeof resposta === "string" ? resposta : "mensagens" in resposta ? resposta.mensagens.join("\n\n") : "";
}
