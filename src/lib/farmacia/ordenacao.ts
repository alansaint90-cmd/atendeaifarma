import { sql, type SQL } from "drizzle-orm";

/** Compara o nome sem caixa ou acentos portugueses, preservando a grafia exibida. */
export function chaveAlfabetica(campo: SQL): SQL {
  return sql`lower(translate(normalize(btrim(${campo}), NFC),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) COLLATE "C"`;
}
