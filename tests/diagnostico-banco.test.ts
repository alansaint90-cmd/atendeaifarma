import test from "node:test";
import assert from "node:assert/strict";
import { SQL } from "drizzle-orm";
import { applyMigrations } from "../src/lib/db/migrate";
import { codigoSeguroBanco, ErroPreparacaoBanco } from "../src/lib/db/diagnostico";

test("diagnóstico do banco encontra o código do driver sem expor detalhes",()=>{
  const erro = new Error("consulta e parâmetros privados",{cause:{code:"28P01",message:"credencial privada"}});
  assert.equal(codigoSeguroBanco(erro),"28P01");
  const seguro = new ErroPreparacaoBanco("conexao_transacao",codigoSeguroBanco(erro));
  assert.match(seguro.message,/28P01/);
  assert.doesNotMatch(seguro.message,/privad|parâmetros/);
  assert.equal(seguro.cause,undefined);
});

test("diagnóstico recusa códigos arbitrários, nomes herdados e causas cíclicas",()=>{
  for (const code of ["credencial_privada","constructor","toString","__proto__"]) assert.equal(codigoSeguroBanco({code}),"DESCONHECIDO");
  const ciclo:{cause?:unknown}={};ciclo.cause=ciclo;
  assert.equal(codigoSeguroBanco(ciclo),"DESCONHECIDO");
  assert.equal(codigoSeguroBanco(null),"DESCONHECIDO");
});

test("preparação identifica falha na conexão e descarta erro original",async()=>{
  await assert.rejects(applyMigrations({transaction:async()=>{throw Object.assign(new Error("endereço privado"),{code:"ECONNREFUSED"});}}),erro=>{
    assert.ok(erro instanceof ErroPreparacaoBanco);
    assert.equal(erro.etapa,"conexao_transacao");
    assert.equal(erro.codigoSeguro,"ECONNREFUSED");
    assert.doesNotMatch(erro.message,/privado/);
    return true;
  });
});

test("preparação distingue espera por trava de falha de autenticação",async()=>{
  let chamadas=0;
  const banco={transaction:async(trabalho:(tx:{execute:(consulta:SQL)=>Promise<unknown>})=>Promise<void>)=>trabalho({execute:async()=>{
    chamadas++;
    if(chamadas===3)throw new Error("consulta privada",{cause:{code:"55P03"}});
    return [];
  }})};
  await assert.rejects(applyMigrations(banco),erro=>{
    assert.ok(erro instanceof ErroPreparacaoBanco);
    assert.equal(erro.etapa,"trava_migracoes");
    assert.equal(erro.codigoSeguro,"55P03");
    assert.doesNotMatch(erro.message,/consulta privada/);
    return true;
  });
});
