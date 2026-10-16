import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {applyMigrations} from '../src/lib/db/migrate';
import {systemUserId} from '../src/lib/db/bootstrap';
import {salvarProduto,entradaEstoque} from '../src/lib/farmacia/catalogo';
import {criarPedido,executarPedido} from '../src/lib/farmacia/pedidos';

test('PostgreSQL 16 real: conexões independentes disputam a última unidade e repetem confirmação',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/atendefarma_test','Somente banco local de teste.');
  const a=postgres(url.toString(),{max:1,onnotice:()=>{}}),b=postgres(url.toString(),{max:1,onnotice:()=>{}});
  const dbA=drizzle(a),dbB=drizzle(b);const usuario=randomUUID();const ator={userId:usuario,papel:'admin' as const};
  try{
    assert.match((await a`SHOW server_version`)[0].server_version,/^16\./);
    await applyMigrations(dbA);
    await a`INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES (${usuario},'Teste concorrente','admin',true,${systemUserId})`;
    const contato=randomUUID();await a`INSERT INTO atendeia_contacts(id,name,modified_by) VALUES (${contato},'Cliente teste',${usuario})`;
    const produto=await salvarProduto(dbA,ator,{id:null,atualizadoEm:null,produto:{nome:'Última unidade real',principio:'Teste',generico:'',fabricante:'',categoria:'Teste',concentracao:'500 mg',apresentacao:'caixa',embalagem:10,ean:null,sku:randomUUID(),preco:'8.90',promocional:null,minimo:1,receita:false,controle:'',ativo:true,medicamento:true,observacoes:'',aliases:''}});
    await entradaEstoque(dbA,ator,{produtoId:produto,codigo:'UNICO',validade:'2099-12-31',quantidade:1,bloqueado:false,chave:randomUUID()});
    const criar=(db:typeof dbA)=>criarPedido(db,ator,{contatoId:contato,conversaId:null,chave:randomUUID(),itens:[{produtoId:produto,quantidade:1}]});
    const p1=await criar(dbA),p2=await criar(dbB);
    const comando=(id:string,acao:string)=>({id,acao,chave:randomUUID(),referencia:'Conferido no teste transacional'});
    const reservas=await Promise.allSettled([executarPedido(dbA,ator,comando(p1,'reservar')),executarPedido(dbB,ator,comando(p2,'reservar'))]);
    assert.equal(reservas.filter(r=>r.status==='fulfilled').length,1);
    const vencedor=reservas[0].status==='fulfilled'?p1:p2;
    const confirmar=comando(vencedor,'confirmar');await Promise.all([executarPedido(dbA,ator,confirmar),executarPedido(dbB,ator,confirmar)]);
    assert.equal((await a`SELECT sum(quantidade)::int saldo FROM atendeia_produtos_lotes WHERE produto_id=${produto}`)[0].saldo,0);
    assert.equal((await a`SELECT count(*)::int total FROM atendeia_produtos_movimentos WHERE pedido_id=${vencedor} AND tipo='venda'`)[0].total,1);
    await Promise.all([executarPedido(dbA,ator,comando(vencedor,'cancelar')),executarPedido(dbB,ator,comando(vencedor,'cancelar'))]);
    assert.equal((await a`SELECT sum(quantidade)::int saldo FROM atendeia_produtos_lotes WHERE produto_id=${produto}`)[0].saldo,1);
  }finally{await a.end();await b.end();}
});
