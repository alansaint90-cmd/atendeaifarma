// Compatible with the credential tables deployed before versioned migrations.
export const bootstrapSql = `
CREATE TABLE IF NOT EXISTS atendeia_settings_actors (
  id text PRIMARY KEY, role text NOT NULL CHECK (role = 'super_admin'),
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp, is_deleted boolean NOT NULL DEFAULT false,
  modified_by text NOT NULL REFERENCES atendeia_settings_actors(id) ON DELETE RESTRICT
);
INSERT INTO atendeia_settings_actors (id, role, modified_by)
  VALUES ('bootstrap-admin', 'super_admin', 'bootstrap-admin') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS atendeia_integration_settings (
  id text PRIMARY KEY, encrypted_payload text NOT NULL, version integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp, is_deleted boolean NOT NULL DEFAULT false,
  modified_by text NOT NULL REFERENCES atendeia_settings_actors(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS atendeia_settings_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settings_id text NOT NULL REFERENCES atendeia_integration_settings(id) ON DELETE RESTRICT,
  version integer NOT NULL, changed_fields text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp, is_deleted boolean NOT NULL DEFAULT false,
  modified_by text NOT NULL REFERENCES atendeia_settings_actors(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS atendeia_migrations (
  id text PRIMARY KEY, checksum text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp, is_deleted boolean NOT NULL DEFAULT false,
  modified_by text NOT NULL REFERENCES atendeia_settings_actors(id) ON DELETE RESTRICT
);
`;
export const systemUserId = "00000000-0000-4000-8000-000000000001";
export const seedSql = `
INSERT INTO atendeia_users (id, name, role, enabled, modified_by)
VALUES ('${systemUserId}', 'Sistema', 'visualizador', false, '${systemUserId}') ON CONFLICT DO NOTHING;
INSERT INTO atendeia_departments (id, name, modified_by) VALUES
 ('00000000-0000-4000-8000-000000000010', 'Atendimento humano', '${systemUserId}'),
 ('00000000-0000-4000-8000-000000000011', 'Comercial', '${systemUserId}'),
 ('00000000-0000-4000-8000-000000000012', 'Suporte', '${systemUserId}'),
 ('00000000-0000-4000-8000-000000000013', 'Financeiro', '${systemUserId}')
ON CONFLICT DO NOTHING;
`;
