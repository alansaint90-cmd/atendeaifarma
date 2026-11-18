import { sql } from "drizzle-orm";
import { linhas,type TransacaoSql } from "../../db/porta";
import { systemUserId } from "../../db/bootstrap";
import { ErroDeNegocio } from "../../acao";
export async function exigirGestorCampanha(tx:TransacaoSql,autor:string){
 // O ator de sistema é exclusivo do worker e dos testes internos, nunca vem da action.
 if(autor===systemUserId)return;
 const [u]=linhas(await tx.execute(sql`SELECT id FROM atendeia_users WHERE id=${autor} AND enabled=true AND role IN ('admin','super_admin') AND is_deleted=false`));
 if(!u)throw new ErroDeNegocio("Sem permissão para alterar campanhas ou fila.");
}
