import { sql, type SQL } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { systemUserId } from "../db/bootstrap";
import { tagSchema, tagIdentity, type Tag } from "./schema";

interface Transaction { execute(query: SQL): PromiseLike<unknown> }
export interface TagsDatabase extends Transaction { transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> }
function rows<T>(result: unknown): T[] { return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[]; }

export async function listTags(database: TagsDatabase): Promise<Tag[]> {
  return rows<Tag>(await database.execute(sql`SELECT id, name, color, version FROM atendeia_tags WHERE is_deleted=false ORDER BY lower(name)`));
}
export async function mutateTag(database: TagsDatabase, input: unknown, identity?: unknown, remove = false, autor = systemUserId): Promise<Tag> {
  const value = remove ? null : tagSchema.parse(input);
  const target = identity === undefined ? null : tagIdentity.parse(identity);
  if (remove && !target) throw new ErroDeNegocio("Selecione uma tag para excluir.");
  try {
    return await database.transaction(async tx => {
      const actor = rows(await tx.execute(sql`SELECT id FROM atendeia_settings_actors WHERE id='bootstrap-admin' AND role='super_admin' AND is_deleted=false`));
      if (!actor.length) throw new ErroDeNegocio("Administrador indisponível.");
      let updated: Tag[];
      if (!target) {
        updated = rows(await tx.execute(sql`INSERT INTO atendeia_tags (name, color, modified_by)
          VALUES (${value!.name}, ${value!.color.toLowerCase()}, ${autor}) RETURNING id,name,color,version`));
      } else if (remove) {
        updated = rows(await tx.execute(sql`UPDATE atendeia_tags SET is_deleted=true, deleted_at=now(), updated_at=now(),
          version=version+1, modified_by=${autor} WHERE id=${target.id} AND version=${target.version} AND is_deleted=false RETURNING id,name,color,version`));
      } else {
        updated = rows(await tx.execute(sql`UPDATE atendeia_tags SET name=${value!.name}, color=${value!.color.toLowerCase()}, updated_at=now(),
          version=version+1, modified_by=${autor} WHERE id=${target!.id} AND version=${target!.version} AND is_deleted=false RETURNING id,name,color,version`));
      }
      if (!updated.length) throw new ErroDeNegocio("A tag foi alterada ou excluída em outra sessão. Recarregue a lista.");
      await tx.execute(sql`INSERT INTO atendeia_audit_logs (action, entity_type, entity_id, changed_fields, modified_by)
        VALUES (${remove ? "admin_tag_excluida" : target ? "admin_tag_alterada" : "admin_tag_criada"}, 'tag', ${updated[0].id},
        ${JSON.stringify(remove ? ["is_deleted"] : ["name", "color"])}::jsonb, ${autor})`);
      return updated[0];
    });
  } catch (error) {
    const candidate = error as { code?: string; cause?: { code?: string } };
    if (candidate.code === "23505" || candidate.cause?.code === "23505") throw new ErroDeNegocio("Já existe uma tag com esse nome.");
    throw error;
  }
}
