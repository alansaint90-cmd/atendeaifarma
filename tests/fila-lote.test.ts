import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { aplicarLoteFila } from "../src/lib/agendamentos/fila-lote";
import { ErroDeNegocio } from "../src/lib/acao";
test("lote informa exatamente os alterados e não alterados, sem interromper os demais",async()=>{
 const alvos=[0,1,2].map(()=>({origem:"individual" as const,id:randomUUID(),versao:"0"}));let chamados=0;
 const r=await aplicarLoteFila(alvos,async alvo=>{chamados++;if(alvo.id===alvos[1].id)throw new ErroDeNegocio("O envio já começou.");});
 assert.equal(chamados,3);assert.deepEqual(r,{alterados:2,naoAlterados:1,avisos:["O envio já começou."]});
});
