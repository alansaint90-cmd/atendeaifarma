-- Abertura solicitada pelo proprietário; não altera o prompt nem os demais chips.
WITH corrigidos AS (
  UPDATE atendeia_chatbots AS bot
  SET configuration = jsonb_set(configuration, '{openingMessages}',
    '["Olá, bem-vindo à LevLava Lavanderia Express em Vilas do Atlântico.","Nós estamos abertos 24 horas. Qual é o seu nome para que eu possa te atender melhor?"]'::jsonb),
    version = version + 1, updated_at = now()
  WHERE bot.is_deleted = false
    AND NOT (configuration ? 'openingMessages')
    AND EXISTS (SELECT 1 FROM atendeia_channels AS canal
      WHERE canal.chatbot_id = bot.id AND canal.instance_name = 'levaelava'
        AND canal.provider = 'evolution' AND canal.is_deleted = false)
    AND NOT EXISTS (SELECT 1 FROM atendeia_channels AS outro
      WHERE outro.chatbot_id = bot.id AND outro.instance_name <> 'levaelava' AND outro.is_deleted = false)
  RETURNING bot.id, bot.modified_by
)
INSERT INTO atendeia_audit_logs (modified_by, action, entity_type, entity_id, changed_fields, details)
SELECT modified_by, 'abertura_corrigida_por_migracao', 'chatbot', id,
  '["configuration.openingMessages"]'::jsonb,
  '{"motivo":"Abertura em dois balões solicitada para levaelava; autor anterior preservado."}'::jsonb
FROM corrigidos;
