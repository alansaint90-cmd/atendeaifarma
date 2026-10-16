import { chatbotExample } from "./defaults";
import { chatbotsSchema, type Chatbot } from "./schema";

export const storageKey = "atendeia.chatbots.v1";
export interface Snapshot { bots: Chatbot[]; revision: string | null }
type StoragePort = Pick<Storage, "getItem" | "setItem">;

// The browser store is a demo adapter. A production repository requires server RBAC.
export function loadChatbots(storage: StoragePort): Snapshot {
  const revision = storage.getItem(storageKey);
  if (revision === null) return { bots: [structuredClone(chatbotExample)], revision };
  try {
    const bots = chatbotsSchema.parse(JSON.parse(revision));
    return { bots, revision };
  } catch {
    throw new Error("Os dados salvos são inválidos. O conteúdo original foi preservado; não foi substituído pelo exemplo.");
  }
}

export function saveChatbots(storage: StoragePort, bots: Chatbot[], revision: string | null): Snapshot {
  const checked = chatbotsSchema.parse(bots);
  if (storage.getItem(storageKey) !== revision) {
    throw new Error("Os dados foram alterados em outra aba. Recarregue a página antes de salvar.");
  }
  const next = JSON.stringify(checked);
  try { storage.setItem(storageKey, next); }
  catch { throw new Error("Não foi possível salvar. Verifique o espaço e as permissões do navegador."); }
  return { bots: checked, revision: next };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
