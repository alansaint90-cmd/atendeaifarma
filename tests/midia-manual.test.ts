import test from "node:test";
import assert from "node:assert/strict";
import { configurarCanalManual } from "../src/lib/farmacia/canal-manual";
import { enviarMidiaManual,validarMidiaManual,LIMITE_MIDIA_MANUAL } from "../src/lib/farmacia/midia-manual";
const config={EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste-local",EVOLUTION_INSTANCE_NAME:"principal"};
const png={tipo:"image" as const,mime:"image/png" as const,base64:Buffer.from("89504e470d0a1a0a00000000","hex").toString("base64")};
const audio={tipo:"audio" as const,mime:"audio/webm" as const,base64:Buffer.from("1a45dfa300000000","hex").toString("base64")};
test("canal humano aceita configuração completa da IA desligada e seleciona o chip vinculado",()=>{
  const r=configurarCanalManual({...config,AI_ENABLED:"false",OPENAI_API_KEY:"sk-teste",OPENAI_MODEL:"teste",REDIS_URL:"redis://localhost:6379",EVOLUTION_SECOND_INSTANCE_NAME:"segundo"},"segundo","+5571999990001");
  assert.equal(r.config.EVOLUTION_INSTANCE_NAME,"segundo");assert.equal(r.numero,"5571999990001");
  assert.deepEqual(Object.keys(r.config).sort(),Object.keys(config).sort());
  assert.throws(()=>configurarCanalManual(config,"estrangeiro","+5571999990001"),/instância/);
  assert.throws(()=>configurarCanalManual({...config,EVOLUTION_API_KEY:undefined},"principal","+5571999990001"),/URL e a chave/);
  assert.throws(()=>configurarCanalManual(config,"principal","123@lid"),/telefone válido/);
});
test("mídia limita tamanho, tipo e assinatura e não permite URL ou SVG",()=>{
  assert.deepEqual(validarMidiaManual(png),png);assert.deepEqual(validarMidiaManual(audio),audio);
  for(const v of [{...png,base64:"https://example.invalid/a.png"},{...png,base64:Buffer.from('<svg/>').toString('base64')},{...png,tipo:"audio"},{...png,mime:"image/svg+xml"},{...png,base64:Buffer.alloc(LIMITE_MIDIA_MANUAL+1).toString("base64")}])assert.throws(()=>validarMidiaManual(v));
});
test("Evolution recebe imagem com legenda e áudio com conversão para voz, sem enviar por URL",async()=>{
  for(const [midia,endpoint] of [[png,"sendMedia"],[audio,"sendWhatsAppAudio"]] as const){
    let chamadas=0;
    const id=await enviarMidiaManual(config,"5571999990001",midia,"Legenda",async(url,init)=>{chamadas++;assert.equal(url,`${config.EVOLUTION_API_URL}/message/${endpoint}/principal`);const corpo=JSON.parse(String(init?.body));assert.equal(corpo.number,"5571999990001");if(midia.tipo==="audio"){assert.equal(corpo.audio,midia.base64);assert.equal(corpo.encoding,true);}else{assert.equal(corpo.media,midia.base64);assert.equal(corpo.caption,"Legenda");}return Response.json({key:{id:"provedor-teste"}});});
    assert.equal(id,"provedor-teste");assert.equal(chamadas,1);
  }
  await assert.rejects(enviarMidiaManual(config,"5571999990001",png,"",async()=>Response.json({})),/confirmacao_ausente/);
  await assert.rejects(enviarMidiaManual(config,"5571999990001",audio,"",async()=>{throw new Error("privado");}),/envio_incerto/);
});
