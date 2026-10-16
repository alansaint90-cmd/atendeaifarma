import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { chatbotSchema } from "./schema";
import { listarChatbotsServidor, vincularChatbotAInstancia } from "./server-repository";

/** Separação idempotente dos vínculos legados compartilhados, com auditoria. */
export async function prepararAssistentes(banco: BancoSql, instancias: string[], usuario: string) {
  return banco.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('chatbots-instancias',0))`);
    const bots = await listarChatbotsServidor(tx);
    const vinculos = linhas<{ instance_name: string; chatbot_id: string | null }>(await tx.execute(sql`
      SELECT instance_name,chatbot_id FROM atendeia_channels WHERE provider='evolution' AND is_deleted=false`));
    const principal = bots.find(b => b.id === vinculos.find(c => c.instance_name === instancias[0])?.chatbot_id)
      ?? (bots.length === 1 ? bots[0] : null);
    const usados = new Set<string>();
    for (const instancia of instancias) {
      const vinculado = bots.find(b => b.id === vinculos.find(c => c.instance_name === instancia)?.chatbot_id);
      const base = vinculado ?? principal;
      if (!base) continue;
      let id = base.id;
      if (usados.has(id)) {
        id = randomUUID();
        const configuracao = chatbotSchema.parse({ ...base.configuracao, id,
          identifier: `${instancia.slice(0, 85)} - ${id.slice(0, 8)}` });
        await tx.execute(sql`INSERT INTO atendeia_chatbots(id,identifier,enabled,configuration,modified_by)
          VALUES (${id},${configuracao.identifier},true,${JSON.stringify(configuracao)}::jsonb,${usuario})`);
        await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields)
          VALUES (${usuario},'chatbot_separado_por_instancia','chatbot',${id},${JSON.stringify(["configuration"])}::jsonb)`);
      }
      if (!vinculado || vinculado.id !== id) await vincularChatbotAInstancia(tx, id, instancia, usuario);
      usados.add(id);
    }
    const itens = await listarChatbotsServidor(tx);
    const canais = linhas<{ instance_name: string; chatbot_id: string | null }>(await tx.execute(sql`
      SELECT instance_name,chatbot_id FROM atendeia_channels WHERE provider='evolution' AND is_deleted=false`));
    return { itens, instancias: instancias.map(nome => ({ nome, chatbotId: canais.find(c => c.instance_name === nome)?.chatbot_id ?? null })) };
  });
}
