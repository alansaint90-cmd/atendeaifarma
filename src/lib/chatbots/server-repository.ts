import { sql } from "drizzle-orm";
import { chatbotSchema, type Chatbot } from "./schema";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";

export interface ChatbotPersistido {
  id: string;
  configuracao: Chatbot;
  versao: number;
}

interface LinhaChatbot { id: string; configuration: unknown; version: number }

function converter(linha: LinhaChatbot): ChatbotPersistido {
  return {
    id: linha.id,
    configuracao: chatbotSchema.parse(linha.configuration),
    versao: Number(linha.version),
  };
}

export async function listarChatbotsServidor(banco: TransacaoSql): Promise<ChatbotPersistido[]> {
  const registros = linhas<LinhaChatbot>(await banco.execute(sql`SELECT id,configuration,version
    FROM atendeia_chatbots WHERE is_deleted=false ORDER BY identifier`));
  return registros.map(converter);
}

export async function chatbotDaInstancia(banco: BancoSql, instancia: string): Promise<Chatbot | null> {
  const [registro] = linhas<LinhaChatbot>(await banco.execute(sql`SELECT b.id,b.configuration,b.version
    FROM atendeia_channels c JOIN atendeia_chatbots b ON b.id=c.chatbot_id
    WHERE c.provider='evolution' AND c.instance_name=${instancia} AND c.is_deleted=false
      AND b.is_deleted=false AND b.enabled=true LIMIT 1`));
  if (registro) return converter(registro).configuracao;
  const vinculo = linhas(await banco.execute(sql`SELECT id FROM atendeia_channels
    WHERE provider='evolution' AND instance_name=${instancia} AND chatbot_id IS NOT NULL AND is_deleted=false`));
  if (vinculo.length) return null;
  const habilitados = linhas<LinhaChatbot>(await banco.execute(sql`SELECT id,configuration,version FROM atendeia_chatbots
    WHERE is_deleted=false AND enabled=true ORDER BY updated_at DESC LIMIT 2`));
  return habilitados.length === 1 ? converter(habilitados[0]).configuracao : null;
}

export async function vincularChatbotAInstancia(tx: TransacaoSql, chatbotId: string, instancia: string, usuario: string) {
  if (!instancia) return;
  await tx.execute(sql`INSERT INTO atendeia_channels(name,instance_name,modified_by)
    VALUES (${instancia},${instancia},${usuario}) ON CONFLICT DO NOTHING`);
  await tx.execute(sql`UPDATE atendeia_channels SET chatbot_id=${chatbotId},updated_at=now(),version=version+1,modified_by=${usuario}
    WHERE provider='evolution' AND instance_name=${instancia} AND is_deleted=false`);
  const [canal] = linhas<{ id: string }>(await tx.execute(sql`SELECT id FROM atendeia_channels
    WHERE provider='evolution' AND instance_name=${instancia} AND is_deleted=false`));
  if (canal) await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields)
    VALUES (${usuario},'chatbot_vinculado','canal',${canal.id},${JSON.stringify(["chatbot_id"])}::jsonb)`);
}

export async function salvarChatbotServidor(banco: BancoSql, dados: {
  id: string | null; versao: number | null; configuracao: Chatbot; instancia: string; usuario: string;
}): Promise<ChatbotPersistido> {
  const { id, versao, configuracao, instancia, usuario } = dados;
  return banco.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('chatbots-instancias',0))`);
    if (id && instancia) {
      const atual = linhas<{ chatbot_id: string | null }>(await tx.execute(sql`SELECT chatbot_id FROM atendeia_channels
        WHERE instance_name=${instancia} AND provider='evolution' AND is_deleted=false`));
      if (atual[0]?.chatbot_id && atual[0].chatbot_id !== id) throw new ErroDeNegocio("O chatbot desta instância mudou. Recarregue os assistentes.");
      const vinculos = linhas<{ instance_name: string }>(await tx.execute(sql`SELECT instance_name FROM atendeia_channels
        WHERE chatbot_id=${id} AND provider='evolution' AND is_deleted=false`));
      if (vinculos.some(c => c.instance_name !== instancia)) throw new ErroDeNegocio("Este chatbot pertence a outra instância. Recarregue os assistentes.");
    }
    let registros: { id: string; version: number }[];
    if (id && versao !== null) {
      registros = linhas(await tx.execute(sql`UPDATE atendeia_chatbots SET identifier=${configuracao.identifier},
        configuration=${JSON.stringify(configuracao)}::jsonb,enabled=true,updated_at=now(),version=version+1,modified_by=${usuario}
        WHERE id=${id} AND version=${versao} AND is_deleted=false RETURNING id,version`));
      if (!registros.length) throw new ErroDeNegocio("Outro usuário alterou este chatbot. Recarregue a página.");
    } else {
      registros = linhas(await tx.execute(sql`INSERT INTO atendeia_chatbots(identifier,enabled,configuration,modified_by)
        VALUES (${configuracao.identifier},true,${JSON.stringify(configuracao)}::jsonb,${usuario}) RETURNING id,version`));
    }
    const registro = registros[0];
    await vincularChatbotAInstancia(tx, registro.id, instancia, usuario);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(modified_by,action,entity_type,entity_id,changed_fields)
      VALUES (${usuario},${id ? "chatbot_atualizado" : "chatbot_criado"},'chatbot',${registro.id},
        ${JSON.stringify(["identifier", "configuration", "enabled"])}::jsonb)`);
    return { id: registro.id, configuracao, versao: Number(registro.version) };
  });
}
