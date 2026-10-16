import type { Papel } from "../db/schema/_enums";

const rotasGerente = new Set(["team", "followups", "tags", "agendamentos", "consultas", "chatbot", "flows", "campaigns"]);

export function podeAcessarRotaPainel(papel: Papel, rota: string): boolean {
  if (rota === "settings") return papel === "super_admin";
  if (rotasGerente.has(rota)) return papel === "admin" || papel === "super_admin";
  return true;
}
