/** Prazo mínimo para chatbots com agenda; não mantém o lease ocupado com sleep. */
export function deveAguardarResposta(agenda: boolean | undefined, timestamp: number, agora = Date.now()): boolean {
  return Boolean(agenda) && agora < timestamp * 1000 + 8000;
}
