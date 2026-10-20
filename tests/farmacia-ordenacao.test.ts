import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { consultarProdutos, salvarProduto } from "../src/lib/farmacia/catalogo";
import { produtoVazio } from "../src/lib/farmacia/cadastro";
import type { BancoSql } from "../src/lib/db/porta";

async function verificarOrdenacao(banco:BancoSql) {
  await applyMigrations(banco);
  const ator={userId:randomUUID(),papel:"admin" as const};
  await banco.execute(sql`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES (${ator.userId},'Teste de ordenação','admin',true,${systemUserId})`);
  const categoria=randomUUID();
  const cadastrar=(nome:string,sku:string,grupo=categoria)=>salvarProduto(banco,ator,{id:null,atualizadoEm:null,
    produto:{...produtoVazio,nome,categoria:grupo,sku,apresentacao:"caixa",preco:"8.90"}});
  const nomes=["Captopril","amoxicilina","Ácido acetilsalicílico","AAS","ácido fólico","Amoxicilina","Ácido ascórbico","Beta","zinco"];
  for(let i=0;i<nomes.length;i++)await cadastrar(nomes[i],`${categoria}-${i}`);
  const esperado=["AAS","Ácido acetilsalicílico","Ácido ascórbico","ácido fólico","amoxicilina","Amoxicilina","Beta","Captopril","zinco"];
  assert.deepEqual((await consultarProdutos(banco,ator,{categoria})).produtos.map(p=>p.nome),esperado);
  assert.deepEqual((await consultarProdutos(banco,ator,{categoria,ordenar:"quantidade"})).produtos.map(p=>p.nome),esperado,"Opção legada não pode mudar a ordem alfabética.");
  await cadastrar("Abacate",`${categoria}-novo`);
  const atual=(await consultarProdutos(banco,ator,{categoria})).produtos.map(p=>p.nome);
  assert.deepEqual(atual,["AAS","Abacate",...esperado.slice(1)],"Novo A entra junto aos demais A, independentemente do cadastro.");
  const grupo=randomUUID();
  for(let i=42;i>=0;i--)await cadastrar(`Produto ${String(i).padStart(2,"0")}`,`${grupo}-${i}`,grupo);
  const primeira=await consultarProdutos(banco,ator,{categoria:grupo,pagina:1});
  const segunda=await consultarProdutos(banco,ator,{categoria:grupo,pagina:2});
  assert.equal(primeira.total,43);
  assert.deepEqual([...primeira.produtos,...segunda.produtos].map(p=>p.nome),Array.from({length:43},(_,i)=>`Produto ${String(i).padStart(2,"0")}`),"Ordenação precisa acontecer antes da paginação.");
}
test("estoque ordena A–Z antes de paginar, sem diferenças de caixa e acentos",async()=>{
  const cliente=new PGlite();try{await verificarOrdenacao(drizzle(cliente));}finally{await cliente.close();}
});
test("PostgreSQL 16 real mantém a ordenação alfabética independente da sequência de cadastro",{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/atendefarma_test");
  const conexao=postgres(url.toString(),{max:1,onnotice:()=>{}});
  try{assert.match((await conexao`SHOW server_version`)[0].server_version,/^16\./);await verificarOrdenacao(drizzlePostgres(conexao));}
  finally{await conexao.end();}
});
