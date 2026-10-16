import { z } from "zod";
export const tagSchema = z.strictObject({ name: z.string().trim().min(1, "Preencha o nome da tag.").max(80)
  .regex(/^[^<>\x00-\x1f]+$/u, "O nome contém caracteres inválidos."), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecione uma cor válida.") });
export const tagIdentity = z.strictObject({ id: z.uuid(), version: z.number().int().min(0) });
export interface Tag { id: string; name: string; color: string; version: number }
