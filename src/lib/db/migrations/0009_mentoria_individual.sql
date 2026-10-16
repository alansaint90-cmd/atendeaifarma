WITH corrigidos AS (
  UPDATE atendeia_chatbots
  SET configuration = jsonb_set(
    configuration,
    '{context}',
    to_jsonb(replace(
      regexp_replace(
        configuration->>'context',
        'Primeiro pergunte:[[:space:]]*"Claro![^"[:cntrl:]]*mentoria em grupo\?"',
        'Primeiro explique: "Claro! 😊 O atendimento e a mentoria com Wellington Junior são individuais e personalizados."',
        'gi'
      ),
      'Se responder individual:',
      'Sobre o atendimento individual:'
    ))
  ),
  updated_at = now(),
  version = version + 1
  WHERE is_deleted = false
    AND configuration->>'context' ~* 'Wellington[[:space:]]+Junior'
    AND configuration->>'context' LIKE '%Você está buscando um atendimento individual ou uma mentoria em grupo?%'
  RETURNING id, modified_by
)
INSERT INTO atendeia_audit_logs (modified_by, action, entity_type, entity_id, changed_fields, details)
SELECT modified_by, 'prompt_corrigido_por_migracao', 'chatbot', id,
  '["configuration.context"]'::jsonb,
  '{"motivo":"Correção automática da oferta indevida de mentoria coletiva; autor da edição anterior preservado."}'::jsonb
FROM corrigidos;
