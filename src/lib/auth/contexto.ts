import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
export const contextoAuth = new AsyncLocalStorage<{ ip: string | null; agente: string; meio: string }>();
export function contextoRequisicao(request: Request) {
  const saltos = Number(process.env.AUTH_TRUST_PROXY_HOPS ?? 0);
  const partes = (request.headers.get("x-forwarded-for") ?? "").split(",").map(i => i.trim());
  const candidato = Number.isInteger(saltos) && saltos > 0 && saltos <= 5 ? partes[partes.length - saltos] : "";
  return { ip: candidato && isIP(candidato) ? candidato : null, agente: (request.headers.get("user-agent") ?? "").slice(0, 250), meio: "passkey" };
}
