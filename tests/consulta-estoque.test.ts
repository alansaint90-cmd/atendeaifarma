import test from "node:test";
import assert from "node:assert/strict";
import { processMessage, type DeliveryState, type ProcessingPort } from "../src/lib/agent/processor";
import type { AgentConfig } from "../src/lib/agent/config";
import type { RespostaGerada, Turn } from "../src/lib/agent/providers";

const config: AgentConfig = { AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Farmácia",perguntarNome:false,
  OPENAI_API_KEY:"teste",OPENAI_MODEL:"teste",EVOLUTION_API_URL:"https://example.invalid",
  EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"teste",REDIS_URL:"redis://localhost:6379" };
const mensagem = { identity:"consulta-teste",conversation:"conversa-teste",number:"5511999990001",text:"Tem dipirona?",timestamp:1 };
function cenario(resposta: RespostaGerada = {mensagens:["Temos sim Dipirona por R$ 8,90.","Gostaria de fazer o seu pedido?"]}) {
  let estado: DeliveryState | null = null, agora = 100000, ativo = true, geracoes = 0, consultas = 0;
  const envios: {texto:string;instante:number}[] = [], registros: string[] = [], transferencias: string[] = [], historico:Turn[]=[];
  const porta: ProcessingPort = { read:async()=>estado,write:async valor=>{estado=structuredClone(valor);},
    history:async()=>[],enabled:async()=>ativo,agora:()=>agora,
    generate:async()=>{geracoes++;return {consultarEstoque:"Dipirona"};},
    consultarEstoque:async termo=>{assert.equal(termo,"Dipirona");consultas++;return resposta;},
    registrarParte:async id=>{registros.push(id);},
    send:async(_c,_n,texto)=>{envios.push({texto,instante:agora});return `saida-${envios.length}`;},
    transferir:async(destino,motivo)=>{transferencias.push(`${destino}:${motivo}`);},
    complete:async(valor,turnos)=>{estado=structuredClone(valor);historico.push(...turnos);},
  };
  return {porta,envios,registros,transferencias,historico,estado:()=>estado,geracoes:()=>geracoes,consultas:()=>consultas,
    avancar:(ms:number)=>{agora+=ms;},pausar:()=>{ativo=false;}};
}
test("consulta persiste espera de 15 segundos e só então consulta saldo atual, sem repetir balões",async()=>{
  const c=cenario();
  assert.equal(await processMessage(mensagem,config,c.porta),"aguardando_estoque");
  assert.deepEqual(c.envios,[{texto:"Um momento, vou consultar o estoque.",instante:100000}]);
  assert.equal(c.consultas(),0);c.avancar(14999);
  assert.equal(await processMessage(mensagem,config,c.porta),"aguardando_estoque");
  assert.equal(c.envios.length,1);assert.equal(c.consultas(),0);c.avancar(1);
  // Nova porta simula retomada após reinício com o mesmo checkpoint.
  assert.equal(await processMessage(mensagem,config,{...c.porta}),"enviada");
  assert.equal(c.envios[1].texto,"Consultando…");assert.equal(c.envios[1].instante,115000);
  assert.equal(c.envios.length,4);assert.equal(c.geracoes(),1);assert.equal(c.consultas(),1);
  assert.equal(c.registros.length,4);assert.equal(c.transferencias.length,0);
  await processMessage(mensagem,config,c.porta);assert.equal(c.envios.length,4);
  assert.match(c.historico[1].content,/Um momento.*Consultando.*Temos sim/s);
});
test("sem saldo notifica somente a equipe e encerra a fala do agente em Consultando",async()=>{
  const c=cenario({mensagens:[],transferirEstoque:true});
  await processMessage(mensagem,config,c.porta);c.avancar(15000);
  assert.equal(await processMessage(mensagem,config,c.porta),"enviada");
  assert.deepEqual(c.transferencias,["Suporte:estoque_indisponivel"]);
  assert.deepEqual(c.envios.map(e=>e.texto),["Um momento, vou consultar o estoque.","Consultando…"]);
  assert.deepEqual(c.registros,["saida-1","saida-2"]);
  assert.equal(c.estado()?.transferencia,true);
  await processMessage(mensagem,config,c.porta);assert.equal(c.transferencias.length,1);
});
test("pausa durante a espera impede consultando, consulta e transferência",async()=>{
  const c=cenario();await processMessage(mensagem,config,c.porta);c.avancar(15000);c.pausar();
  assert.equal(await processMessage(mensagem,config,c.porta),"pausada");
  assert.equal(c.envios.length,1);assert.equal(c.consultas(),0);assert.equal(c.transferencias.length,0);
});
test("erro na consulta não vira falta de estoque nem dispara transferência por indisponibilidade",async()=>{
  const c=cenario();c.porta.consultarEstoque=async()=>{throw new Error("Falha simulada do banco");};
  await processMessage(mensagem,config,c.porta);c.avancar(15000);
  assert.equal(await processMessage(mensagem,config,c.porta),"enviada");
  assert.match(c.envios.at(-1)!.texto,/Não consegui consultar o sistema/);
  assert.doesNotMatch(c.envios.at(-1)!.texto,/não temos|Falha simulada/);assert.equal(c.transferencias.length,0);
});
test("entregas incertas em cada balão não são repetidas nem iniciam envio posterior",async()=>{
  for(const falha of [1,2,3,4]) {
    const c=cenario(),enviar=c.porta.send;
    c.porta.send=async(...args)=>{const id=await enviar(...args);if(c.envios.length===falha)throw new Error("Timeout");return id;};
    let resultado=await processMessage(mensagem,config,c.porta);
    if(falha>1){c.avancar(15000);resultado=await processMessage(mensagem,config,c.porta);}
    assert.equal(resultado,"incerta");await processMessage(mensagem,config,c.porta);
    assert.equal(c.envios.length,falha);assert.equal(c.transferencias.length,0);
  }
});
test("queda ao salvar aviso mantém reserva incerta e não repete após reinício",async()=>{
  const c=cenario(),salvar=c.porta.write;
  c.porta.write=async estado=>{if(estado.estoque?.etapa==="consultando")throw new Error("Queda simulada");await salvar(estado);};
  await assert.rejects(processMessage(mensagem,config,c.porta));
  c.porta.write=salvar;c.avancar(15000);
  assert.equal(await processMessage(mensagem,config,c.porta),"incerta");assert.equal(c.envios.length,1);
});
test("falha interna ao transferir retoma só o encaminhamento, sem repetir resposta",async()=>{
  const c=cenario({mensagens:["No momento não temos esse produto disponível."],transferirEstoque:true});
  const transferir=c.porta.transferir!;let falhar=true;
  c.porta.transferir=async(...args)=>{if(falhar)throw new Error("Falha interna");await transferir(...args);};
  await processMessage(mensagem,config,c.porta);c.avancar(15000);
  await assert.rejects(processMessage(mensagem,config,c.porta));assert.equal(c.envios.length,2);
  falhar=false;assert.equal(await processMessage(mensagem,config,c.porta),"enviada");
  assert.equal(c.envios.length,2);assert.equal(c.transferencias.length,1);
});

test("retomada de checkpoint antigo descarta aviso de indisponibilidade ainda não enviado",async()=>{
  const c=cenario();await processMessage(mensagem,config,c.porta);
  c.envios.push({texto:"Consultando…",instante:115000});
  await c.porta.write({...c.estado()!,status:"gerada",transferencia:true,
    partes:["No momento não temos esse produto disponível."],providerIds:["saida-1","saida-2"],
    reply:"Um momento, vou consultar o estoque.\n\nConsultando…\n\nNo momento não temos esse produto disponível.",
    estoque:{termo:"Dipirona",etapa:"resposta"}});
  assert.equal(await processMessage(mensagem,config,c.porta),"enviada");
  assert.equal(c.envios.length,2);assert.equal(c.transferencias.length,1);
  assert.doesNotMatch(c.historico[1].content,/não temos|indisponível/);
});
test("configuração alterada durante espera encerra sequência sem retomar com instruções diferentes",async()=>{
  const c=cenario();await processMessage(mensagem,config,c.porta);c.avancar(15000);
  assert.equal(await processMessage(mensagem,{...config,AI_SYSTEM_PROMPT:"Outro prompt"},c.porta),"falhou");
  assert.equal(c.envios.length,1);assert.equal(c.consultas(),0);
});
