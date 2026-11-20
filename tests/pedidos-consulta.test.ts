import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {drizzle as drizzlePostgres} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {sql} from "drizzle-orm";
import {applyMigrations} from "../src/lib/db/migrate";
import {systemUserId} from "../src/lib/db/bootstrap";
import {listarPedidos} from "../src/lib/farmacia/consultas";
import {salvarProduto} from "../src/lib/farmacia/catalogo";
import {produtoVazio} from "../src/lib/farmacia/cadastro";
import {STATUS_PEDIDO} from "../src/lib/db/schema/_enums";
import type {BancoSql} from "../src/lib/db/porta";
async function verificar(banco:BancoSql){
 await applyMigrations(banco);const ator={userId:randomUUID(),papel:"admin" as const},contato=randomUUID(),marca=randomUUID();
 await banco.execute(sql`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES(${ator.userId},'Teste de pedidos','admin',true,${systemUserId})`);
 await banco.execute(sql`INSERT INTO atendeia_contacts(id,name,modified_by) VALUES(${contato},${marca+' Ana'},${ator.userId})`);
 const produto=await salvarProduto(banco,ator,{id:null,atualizadoEm:null,produto:{...produtoVazio,nome:"Produto de teste",sku:randomUUID(),apresentacao:"caixa",preco:"11.90"}});
 const ids:string[]=[];
 for(let i=0;i<38;i++){
  const id=randomUUID();ids.push(id);const data=i===35?"2030-05-20T02:59:59.999Z":i===36?"2030-05-21T03:00:00Z":"2030-05-20T03:00:00Z";
  await banco.execute(sql`INSERT INTO atendeia_pedidos(id,numero,contato_id,status,origem,total,chave,created_at,is_deleted,modified_by) VALUES(${id},${marca+'-'+i},${contato},${STATUS_PEDIDO[i%7]},'painel','11.90',${randomUUID()},${data}::timestamptz,${i===37},${ator.userId})`);
  if(i===0||i===10)await banco.execute(sql`INSERT INTO atendeia_pedidos_itens(pedido_id,produto_id,quantidade,preco,descricao,modified_by) VALUES(${id},${produto},1,'11.90',${'alvo-'+marca},${ator.userId})`);
 }
 const filtro={termo:marca,periodo:{inicio:"2030-05-20",fim:"2030-05-20"}};
 const pagina1=await listarPedidos(banco,ator,filtro),pagina2=await listarPedidos(banco,ator,{...filtro,pagina:2});
 assert.equal(pagina1.total,35);assert.deepEqual(pagina1.resumo,{total:35,concluidos:5,andamento:25,cancelados:5});
 assert.equal(pagina1.pedidos.length,30);assert.equal(pagina2.pedidos.length,5);assert.equal(new Set([...pagina1.pedidos,...pagina2.pedidos].map(p=>p.id)).size,35);
 const concluidos=await listarPedidos(banco,ator,{...filtro,status:"concluido"});assert.equal(concluidos.total,5);assert.deepEqual(concluidos.resumo,pagina1.resumo);
 assert.equal((await listarPedidos(banco,ator,{...filtro,status:"em_andamento"})).total,25);
 assert.equal((await listarPedidos(banco,ator,{...filtro,termo:'alvo-'+marca})).total,2);
 assert.equal((await listarPedidos(banco,ator,{...filtro,termo:marca+' Ana'})).total,35);
 assert.equal((await listarPedidos(banco,ator,{id:ids[35]})).total,1,"Contrato legado sem período preservado.");
 await assert.rejects(listarPedidos(banco,ator,{status:"qualquer"}));await assert.rejects(listarPedidos(banco,ator,{periodo:{inicio:"2030-05-21",fim:"2030-05-20"}}));
 await banco.execute(sql`UPDATE atendeia_contacts SET is_deleted=true WHERE id=${contato}`);assert.equal((await listarPedidos(banco,ator,filtro)).total,35,"Pedidos preservam a identificação histórica do contato.");
 await banco.execute(sql`UPDATE atendeia_users SET enabled=false WHERE id=${ator.userId}`);await assert.rejects(listarPedidos(banco,ator,filtro),/permissão/);
}
test("pedidos filtram busca, etapa e período em Brasília sem inventar contagens ou perder páginas",async()=>{const c=new PGlite();try{await verificar(drizzle(c));}finally{await c.close();}});
test("PostgreSQL 16: indicadores e filtros de pedidos usam a fila de pedidos persistida",{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
 const c=postgres(url.toString(),{max:1,onnotice:()=>{}});try{assert.match((await c`SHOW server_version`)[0].server_version,/^16\./);await verificar(drizzlePostgres(c));}finally{await c.end();}
});
