import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import ExcelJS from "exceljs";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { importarProdutos } from "../src/lib/farmacia/importacao";
import { consultarProdutos } from "../src/lib/farmacia/catalogo";
import { atenderIntencao } from "../src/lib/farmacia/agente";
import { linhaImportacaoSchema } from "../src/lib/farmacia/importacao-validacao";
import { lerPlanilha, modeloPlanilha, colunasPlanilha } from "../src/lib/farmacia/planilha";

const item = (dados:Record<string,unknown>={}) => linhaImportacaoSchema.parse({linha:2,nome:"Dipirona",concentracao:"500 mg",
  apresentacao:"caixa com 10 comprimidos",preco:"8,90",quantidade:25,lote:"L-01",validade:"2099-12-31",receita:false,
  controle:"",medicamento:true,sku:"",ean:null,embalagem:10,principio:"Dipirona",fabricante:"",...dados});
async function arquivo(linhas:ExcelJS.CellValue[][]) {
  const wb = new ExcelJS.Workbook();const aba=wb.addWorksheet("Produtos");aba.addRow(colunasPlanilha);
  for(const linha of linhas)aba.addRow(linha);
  return new Uint8Array(await wb.xlsx.writeBuffer()).buffer;
}
const linhaExcel = ():ExcelJS.CellValue[] => ["Dipirona","500 mg","caixa com 10 comprimidos","8,90",25,"L-01","31/12/2099","Não","","","01234567",10,"Dipirona","","Sim"];

test("Excel: modelo e leitura de preços, datas, EAN e erros por linha",async()=>{
  const wb = new ExcelJS.Workbook();await wb.xlsx.load(await modeloPlanilha());
  assert.equal(wb.worksheets.length,1);assert.equal(wb.worksheets[0].getCell("A1").value,"Nome");
  const primeira = linhaExcel(), segunda = linhaExcel();segunda[0]="Paracetamol";segunda[6]=new Date("2099-12-31T00:00:00Z");
  const previa = await lerPlanilha(await arquivo([primeira,segunda]));assert.equal(previa.erros.length,0);
  assert.equal(previa.linhas[0].preco,"8.90");assert.equal(previa.linhas[0].ean,"01234567");assert.equal(previa.linhas[1].validade,"2099-12-31");
  primeira[3]={formula:"1+1",result:2};segunda[7]="";
  const ruim=await lerPlanilha(await arquivo([primeira,segunda]));assert.equal(ruim.linhas.length,0);
  assert.match(ruim.erros[0],/Linha 2.*fórmulas/);assert.match(ruim.erros[1],/Linha 3.*receita/);
  const semValidade=linhaExcel();semValidade[6]="";assert.match((await lerPlanilha(await arquivo([semValidade]))).erros[0],/validade/);
  const semEstoque=linhaExcel();semEstoque[4]=0;semEstoque[5]="";semEstoque[6]="";
  assert.equal((await lerPlanilha(await arquivo([semEstoque]))).erros.length,0);
  await assert.rejects(lerPlanilha(new ArrayBuffer(2*1024*1024+1)),/2 MB/);
  await assert.rejects(lerPlanilha(await arquivo(Array.from({length:201},linhaExcel))),/200/);
  const vazio=await lerPlanilha(await modeloPlanilha());assert.match(vazio.erros[0],/vazia/);
});

test("Importação: transação auditada, permissões, repetição e consulta pelo agente",async t=>{
  const client=new PGlite();const banco=drizzle(client);const admin={userId:randomUUID(),papel:"admin" as const};
  const operador={userId:randomUUID(),papel:"operador" as const};
  try {
    await applyMigrations(banco);
    for(const ator of [admin,operador])await client.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES ($1,'Teste',$2,true,$3)",[ator.userId,ator.papel,systemUserId]);
    const contato=randomUUID(),canal=randomUUID(),conversa=randomUUID();
    await client.query("INSERT INTO atendeia_contacts(id,name,phone,modified_by) VALUES ($1,'Cliente','+5571999990001',$2)",[contato,systemUserId]);
    await client.query("INSERT INTO atendeia_channels(id,name,instance_name,modified_by) VALUES ($1,'Teste','importacao-teste',$2)",[canal,systemUserId]);
    await client.query("INSERT INTO atendeia_conversations(id,channel_id,contact_id,remote_jid,modified_by) VALUES ($1,$2,$3,'5571999990001@s.whatsapp.net',$4)",[conversa,canal,contato,systemUserId]);
    const v={chave:randomUUID(),linhas:[item(),item({linha:3,nome:"Sem saldo",quantidade:0,lote:"",validade:null})]};
    await t.test("operador e ator sistema não importam",async()=>{
      await assert.rejects(importarProdutos(banco,operador,v),/permissão/);
      await assert.rejects(importarProdutos(banco,{sistema:true},v),/atendente/);
      assert.equal((await client.query("SELECT id FROM atendeia_produtos")).rows.length,0);
    });
    await t.test("grava estoque e auditoria e repetir não duplica, inclusive quantidade zero",async()=>{
      assert.deepEqual(await importarProdutos(banco,admin,v),{produtos:2,embalagens:25});
      await importarProdutos(banco,admin,v);
      assert.equal((await client.query("SELECT id FROM atendeia_produtos")).rows.length,2);
      assert.equal((await client.query("SELECT id FROM atendeia_produtos_movimentos")).rows.length,1);
      assert.equal((await client.query("SELECT id FROM atendeia_audit_logs WHERE action='produto_criado' AND modified_by=$1",[admin.userId])).rows.length,2);
      const produtos=await consultarProdutos(banco,admin,{termo:"Dipirona"});assert.equal(produtos.produtos[0].disponivel,25);
      const resposta=await atenderIntencao(banco,{conversaId:conversa,contatoId:contato,produtos:[],pedidos:[]},{acao:"buscar",termo:"Dipirona 500",pedidoId:"",itens:[]},randomUUID());
      assert.match(String(resposta),/R\$ 8,90/);assert.match(String(resposta),/25 embalagens/);
    });
    await t.test("erro na última linha desfaz cadastros, estoque e auditoria anteriores",async()=>{
      const antes=(await client.query("SELECT id FROM atendeia_audit_logs")).rows.length;
      await assert.rejects(importarProdutos(banco,admin,{chave:randomUUID(),linhas:[item({nome:"Novo rollback"}),item({linha:3})]}),/Linha 3.*cadastrado/);
      assert.equal((await client.query("SELECT id FROM atendeia_produtos WHERE nome='Novo rollback'")).rows.length,0);
      assert.equal((await client.query("SELECT id FROM atendeia_audit_logs")).rows.length,antes);
    });
    await t.test("revalida dados adulterados, receita, validade e duplicidades no servidor",async()=>{
      await assert.rejects(importarProdutos(banco,admin,{chave:randomUUID(),linhas:[{...item(),validade:null}]}),/validade/);
      await assert.rejects(importarProdutos(banco,admin,{chave:randomUUID(),linhas:[{...item(),receita:"Não"}]}));
      await assert.rejects(importarProdutos(banco,admin,{chave:randomUUID(),linhas:[item({nome:"Repetido"}),item({nome:"Repetido",linha:3})]}),/Linha 3/);
      await assert.rejects(importarProdutos(banco,admin,{chave:randomUUID(),linhas:[item({nome:"Número repetido"}),item({nome:"Outro número"})]}),/linha repetido/);
      await assert.rejects(importarProdutos(banco,admin,{chave:v.chave,linhas:[item({preco:"9.00"}),v.linhas[1]]}),/outros dados/);
      await assert.rejects(importarProdutos(banco,admin,{chave:v.chave,linhas:[item({quantidade:0,lote:"",validade:null}),v.linhas[1]]}),/outros dados/);
    });
  } finally {await client.close();}
});
