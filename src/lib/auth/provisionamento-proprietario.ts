import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { auditarIdentidade, hashToken } from "./repositorio";

interface EntradaProvisionamento {
  nome: string;
  email: string;
  token: string;
  reiniciar: boolean;
}

interface ProprietarioExistente {
  id: string;
  email: string | null;
  ativo: boolean;
  semPasskey: boolean;
}

export async function provisionarProprietario(banco: BancoSql, entrada: EntradaProvisionamento) {
  return banco.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(712940862)`);
    const existentes = linhas<ProprietarioExistente>(await tx.execute(sql`
      SELECT u.id,u.email,u.enabled AS ativo,
        NOT EXISTS(SELECT 1 FROM atendeia_users_passkeys p WHERE p.user_id=u.id AND p.is_deleted=false) AS "semPasskey"
      FROM atendeia_users u WHERE u.role='super_admin' AND u.is_deleted=false FOR UPDATE`));
    let id: string;
    if (existentes.length) {
      const proprietario = existentes[0];
      const correspondeAoPedido = proprietario.email?.toLowerCase() === entrada.email.toLowerCase();
      if (!entrada.reiniciar || !correspondeAoPedido || proprietario.ativo || !proprietario.semPasskey) {
        throw new Error("Já existe proprietário. O provisionamento inicial não pode ser repetido.");
      }
      id = proprietario.id;
      await auditarIdentidade(tx, systemUserId, "proprietario_convite_reemitido", id);
      await tx.execute(sql`UPDATE atendeia_users_convites SET is_deleted=true,deleted_at=now(),updated_at=now(),modified_by=${systemUserId}
        WHERE user_id=${id} AND is_deleted=false`);
      await tx.execute(sql`UPDATE atendeia_users SET name=${entrada.nome},password_hash=NULL,version=version+1,updated_at=now(),modified_by=${systemUserId}
        WHERE id=${id} AND enabled=false AND is_deleted=false`);
    } else {
      id = crypto.randomUUID();
      await auditarIdentidade(tx, systemUserId, "proprietario_provisionado", id);
      await tx.execute(sql`INSERT INTO atendeia_users(id,name,email,role,enabled,modified_by)
        VALUES (${id},${entrada.nome},${entrada.email},'super_admin',false,${systemUserId})`);
    }
    await tx.execute(sql`INSERT INTO atendeia_users_convites(user_id,token_hash,expira_em,modified_by)
      VALUES (${id},${hashToken(entrada.token)},now()+interval '15 minutes',${systemUserId})`);
    return id;
  });
}
