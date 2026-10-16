import type { Papel } from "../db/schema/_enums";
export const nomesPapeis: Record<Papel, string> = { super_admin: "Super administrador", admin: "Gerente", operador: "SDR", visualizador: "Somente leitura" };
