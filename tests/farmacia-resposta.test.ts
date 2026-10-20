import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { respostaProduto } from "../src/lib/farmacia/agente";
import type { Produto } from "../src/lib/farmacia/catalogo";
import { processMessage, type DeliveryState, type ProcessingPort } from "../src/lib/agent/processor";
import { incomingMessage } from "../src/lib/agent/message";
import { ProviderError } from "../src/lib/agent/providers";
import type { AgentConfig } from "../src/lib/agent/config";

const produto = (v:Partial<Produto>={}):Produto => ({id:randomUUID(),nome:"Dipirona",principio:"",generico:"",fabricante:"",
  categoria:"Medicamentos",concentracao:"500 mg",apresentacao:"caixa com 30 comprimidos",embalagem:30,ean:null,
  sku:randomUUID(),preco:"8.90",promocional:null,minimo:0,receita:false,controle:"",ativo:true,medicamento:true,
  observacoes:"",aliases:"",atualizadoEm:new Date().toISOString(),disponivel:10,fisico:10,reservado:0,validade:"2099-12-31",vencido:false,vencendo:false,...v});
function mensagens(r:unknown):string[] {
  assert.ok(r && typeof r==="object" && "mensagens" in r,"Informação e CTA devem ser balões separados.");
  return (r as {mensagens:string[]}).mensagens;
}
test("produto disponível tem oferta curta e CTA separado, sem saldo nem lote",()=>{
  const partes=mensagens(respostaProduto([produto()],1));
  assert.equal(partes.length,2);assert.match(partes[0],/Temos sim.*Dipirona.*500 mg.*caixa com 30 comprimidos.*R\$ 8,90/s);
  assert.doesNotMatch(partes[0],/10 embalagens|lote|validade|sujeita à reserva|1\./i);
  assert.equal(partes[1],"Gostaria de fazer o seu pedido ou acrescentar mais alguma coisa?");
});
test("cadastro sem saldo não aparece junto à apresentação disponível",()=>{
  const partes=mensagens(respostaProduto([produto({disponivel:0,preco:"5.00",apresentacao:"gotas"}),produto()],2));
  assert.doesNotMatch(partes.join(" "),/Indisponível|gotas|5,00/);assert.match(partes[0],/R\$ 8,90/);
});
test("não oferece compra quando todas as apresentações estão sem saldo",()=>{
  const r=respostaProduto([produto({disponivel:0})],1);
  assert.equal(typeof r,"string");assert.match(String(r),/não temos.*disponível/i);assert.doesNotMatch(String(r),/Gostaria de fazer|R\$/);
});
test("opções disponíveis mantêm concentração, apresentação, promoção e aviso de receita",()=>{
  const partes=mensagens(respostaProduto([produto(),produto({concentracao:"1 g",apresentacao:"caixa com 10 comprimidos",promocional:"7.90",receita:true})],2));
  assert.match(partes[0],/500 mg.*30 comprimidos/s);assert.match(partes[0],/1 g.*10 comprimidos.*R\$ 7,90/s);
  assert.match(partes[0],/farmacêutico/);assert.equal(partes.length,2);
});
test("balões comerciais têm checkpoint por envio, pausa e proteção contra repetição",async()=>{
  const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atendimento da farmácia",perguntarNome:false,
    OPENAI_API_KEY:"teste",OPENAI_MODEL:"teste",EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"teste",REDIS_URL:"redis://localhost:6379"};
  const entrada=incomingMessage({event:"messages.upsert",instance:"teste",data:{key:{id:randomUUID(),remoteJid:"5571999990001@s.whatsapp.net",fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Tem dipirona?"}}},"teste")!;
  for(const modo of ["normal","pausa","incerta"]){
    let estado:DeliveryState|null=null;const envios:string[]=[],registrados:string[]=[];
    const partes=["Temos sim Dipirona por R$ 8,90.","Gostaria de fazer o seu pedido?"];
    const porta:ProcessingPort={read:async()=>estado,write:async v=>{estado=v;},history:async()=>[],
      complete:async v=>{estado=v;},enabled:async()=>modo!=="pausa"||envios.length===0,
      generate:async()=>({mensagens:partes}),registrarParte:async id=>{registrados.push(id);},
      send:async(_c,_n,texto)=>{envios.push(texto);if(modo==="incerta"&&envios.length===2)throw new ProviderError("envio_incerto");return `id-${envios.length}`;}};
    assert.equal(await processMessage(entrada,config,porta),modo==="normal"?"enviada":modo==="pausa"?"pausada":"incerta");
    await processMessage(entrada,config,porta);
    assert.deepEqual(envios,modo==="pausa"?partes.slice(0,1):partes);
    assert.deepEqual(registrados,modo==="normal"?["id-1","id-2"]:["id-1"]);
  }
});
