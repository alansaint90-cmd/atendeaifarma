import test from "node:test";
import assert from "node:assert/strict";
import { incomingMessage } from "../src/lib/agent/message";
import { processMessage, type DeliveryState, type ProcessingPort } from "../src/lib/agent/processor";
import { generateReply, sendReply, type Turn } from "../src/lib/agent/providers";
import { agentBaseConfigSchema, agentConfigSchema, configurarAgente, type AgentConfig } from "../src/lib/agent/config";
import type { EvolutionEvent } from "../src/lib/evolution/schema";
import { transcribeAudio } from "../src/lib/agent/audio";
import { ProviderError } from "../src/lib/agent/providers";
import { montarInstrucoesDoAgente } from "../src/lib/chatbots/prompt-servidor";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { extrairNomeInformado, respostaComNome } from "../src/lib/agent/nome";
import { pausaManualParaEvento } from "../src/lib/agent/pausa";

const config: AgentConfig = { AI_ENABLED: "true", AI_SYSTEM_PROMPT: "Atenda com o contexto cadastrado.",
  OPENAI_API_KEY: "sk-test-only", OPENAI_MODEL: "gpt-4.1-mini", EVOLUTION_API_KEY: "teste",
  EVOLUTION_API_URL: "https://evolution.example.com", EVOLUTION_INSTANCE_NAME: "teste", REDIS_URL: "redis://localhost:6379" };
const event: EvolutionEvent = { event: "messages.upsert", instance: "teste", data: {
  key: { id: "mensagem-1", fromMe: false, remoteJid: "123@lid", remoteJidAlt: "5511999999999@s.whatsapp.net" },
  messageTimestamp: 1700000000, message: { conversation: "Oi" },
} };
const message = incomingMessage(event, "teste", 1700000000000)!;

test("somente saída manual individual cria prazo de 30 minutos", () => {
  const saida: EvolutionEvent = { ...event, data: { key: { id: "mensagem-saida", fromMe: true,
    remoteJid: "123@lid", remoteJidAlt: "5511999999999@s.whatsapp.net" },
    messageTimestamp: 1700000000, message: { conversation: "Oi" } } };
  const pausa = pausaManualParaEvento(saida);
  assert.ok(pausa);
  assert.equal(pausa.ate, 1700000000000 + 1800000);
  assert.equal(pausa.conversation, message.conversation);
  assert.equal(pausaManualParaEvento(event), null);
  assert.equal(pausaManualParaEvento({ ...saida, data: { key: { id: "grupo", fromMe: true,
    remoteJid: "grupo@g.us" }, messageTimestamp: 1700000000 } }), null);
});

test("aceita áudio individual recente para transcrição", () => {
  const audio = incomingMessage({ ...event, data: { ...event.data,
    message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 12 } },
  } }, "teste", 1700000000000);
  assert.ok(audio, "áudio não pode ser descartado como mídia sem suporte");
  assert.equal(audio.number, message.number);
});

function fixture() {
  let state: DeliveryState | null = null;
  let contactName: string | null = null;
  const turns: Turn[] = [];
  const sentTexts: string[] = [];
  let sends = 0;
  let generations = 0;
  const port: ProcessingPort = {
    read: async () => state, write: async value => { state = value; }, history: async () => turns,
    contactName: async () => contactName, rememberName: async name => { contactName = name; },
    complete: async (value, items) => { state = value; turns.push(...items); }, enabled: async () => true,
    generate: async () => { generations++; return "Olá! Como posso ajudar?"; },
    send: async (_config, _number, text) => { sends++; sentTexts.push(text); return "resposta-1"; },
  };
  return { port, state: () => state, sends: () => sends, generations: () => generations, turns, sentTexts,
    contactName: () => contactName, nextMessage: () => { state = null; } };
}

test("agenda envia menu, conferência e confirmação em partes sem repetir entrega incerta", async () => {
  for (const partes of [
    ["Consultei a agenda e estes são os horários livres: 👇", "1. 15/10/2026, 08:40\n2. 15/10/2026, 09:20", "Qual desses horários você prefere? Responda com o número da opção ou com o horário. A vaga é reservada após o cadastro completo e a conferência dos dados."],
    ["Confira os dados antes de agendar.", "Nome: Paciente Exemplo\nData de nascimento: 20/02/1990\nData da consulta: 15/10/2026, 08:40", "Os dados e o horário estão corretos? Confirma pra gente concluir o nosso agendamento? Responda confirmo ou corrigir."],
    ["Consulta confirmada:\nDia: 15/10/2026\nHorário: 08:40 (horário de Brasília)\nNome do paciente: Paciente Exemplo\nProtocolo: teste\nO seu cadastro foi registrado em nosso sistema.", "Chegue 20 minutos antes para fazer o cadastro presencial e agilizar seu atendimento."],
  ]) {
  for (const falhar of [false, true]) {
    const f = fixture(); const enviados: string[] = []; const registrados: string[] = [];
    f.port.cadastroConsulta = async () => partes.join("\n\n");
    f.port.send = async (_config, _numero, texto) => {
      enviados.push(texto);
      if (falhar && enviados.length === 2) throw new ProviderError("envio_incerto");
      return `parte-${enviados.length}`;
    };
    f.port.registrarParte = async id => { registrados.push(id); };
    const configuracao = { ...config, agendaConsultas: true };
    assert.equal(await processMessage(message, configuracao, f.port), falhar ? "incerta" : "enviada");
    await processMessage(message, configuracao, f.port);
    assert.deepEqual(enviados, falhar ? partes.slice(0, 2) : partes);
    assert.deepEqual(registrados, falhar ? ["parte-1"] : partes.map((_p, i) => `parte-${i + 1}`));
  }
  }
});

test("pedido de agendamento consulta vagas antes de gerar promessas ou negar acesso", async () => {
  for (const texto of ["Quero agendar uma consulta", "Tem horário disponível na quinta?", "Quais são os horários livres?"]) {
    const f = fixture(); const chamadas: boolean[] = [];
    f.port.cadastroConsulta = async (_texto, iniciar) => { chamadas.push(iniciar); return iniciar ? "Quinta-feira: 08:00 e 11:20. Qual desses horários?" : null; };
    f.port.generate = async () => { throw new Error("Não deve gerar uma promessa antes de consultar"); };
    assert.equal(await processMessage({ ...message, text: texto }, { ...config, agendaConsultas: true }, f.port), "enviada");
    assert.deepEqual(chamadas, [false, true]); assert.match(f.sentTexts[0], /08:00 e 11:20/);
  }
});

test("aceite e horário retomam oferta anterior; Camaçari, cancelamento e urgência não iniciam reserva", async () => {
  for (const texto of ["Sim", "11 e 20 pode ser ?"]) {
    const f = fixture(); f.turns.push({ role: "assistant", content: "Posso verificar os horários disponíveis para quinta-feira. Gostaria que eu faça isso?" });
    f.port.cadastroConsulta = async (_texto, iniciar) => iniciar ? "Horários livres de quinta: 08:00." : null;
    await processMessage({ ...message, text: texto }, { ...config, agendaConsultas: true }, f.port);
    assert.equal(f.generations(), 0); assert.match(f.sentTexts[0], /Horários livres/);
  }
  for (const texto of ["Quero agendar em Camaçari", "Quero cancelar minha consulta", "Quero remarcar", "Não quero agendar", "Estou com falta de ar, tem horário?", "Quanto custa a consulta?"]) {
    const f = fixture(); f.port.cadastroConsulta = async (_texto, iniciar) => { assert.equal(iniciar, false); return null; };
    await processMessage({ ...message, text: texto }, { ...config, agendaConsultas: true }, f.port);
    assert.equal(f.generations(), 1);
  }
});

test("dúvida devolvida pelo cadastro ativo continua no atendimento sem entrar em repetição", async () => {
  const f = fixture();
  f.port.cadastroConsulta = async () => null;
  assert.equal(await processMessage({ ...message, text: "Posso agendar para outra pessoa?" }, { ...config, agendaConsultas: true }, f.port), "enviada");
  assert.equal(f.generations(), 1);
});

test("pergunta o nome no início, substitui marcador e mantém o tratamento após o histórico expirar", async () => {
  const f = fixture();
  f.port.generate = async () => "Olá! 😊 Eu sou a Thaís. Como posso ajudar hoje?";
  assert.equal(await processMessage(message, config, f.port), "enviada");
  assert.match(f.sentTexts[0], /qual é o seu nome\?/u);
  f.port.generate = async (agentConfig) => {
    assert.match(agentConfig.AI_SYSTEM_PROMPT, /Nome confirmado pelo próprio cliente: Alan/u);
    return "Prazer, [NOME]! 😊 Me conta o que você procura.";
  };
  f.nextMessage();
  const respostaNome = { ...message, identity: "mensagem-2", text: "Alan" };
  assert.equal(await processMessage(respostaNome, config, f.port), "enviada");
  assert.equal(f.contactName(), "Alan");
  assert.match(f.sentTexts[1], /Prazer, Alan!/u);
  assert.ok(!f.sentTexts[1].includes("[NOME]"));
  f.turns.splice(0);
  f.port.generate = async () => "Tudo bem. Posso esclarecer mais algum ponto?";
  f.nextMessage();
  const continuacao = { ...message, identity: "mensagem-3", text: "Obrigado" };
  assert.equal(await processMessage(continuacao, config, f.port), "enviada");
  assert.equal(f.sentTexts[2], "Tudo bem. Posso esclarecer mais algum ponto?");
});

test("não transforma saudação ou interesse em nome e bloqueia marcador em resposta retomada", async () => {
  const f = fixture();
  f.turns.push({ role: "assistant", content: "Qual é o seu nome?" });
  f.port.generate = async () => "Entendo, [NOME]! Posso ajudar.";
  assert.equal(await processMessage({ ...message, text: "Mentoria em grupo" }, config, f.port), "enviada");
  assert.equal(f.contactName(), null);
  assert.ok(!f.sentTexts[0].includes("[NOME]"));
  assert.match(f.sentTexts[0], /qual é o seu nome\?/u);
  const retomada = fixture();
  await retomada.port.write({ status: "gerada", attempts: 1, reply: "Tudo bem, [NOME]!" });
  assert.equal(await processMessage(message, config, retomada.port), "enviada");
  assert.ok(!retomada.sentTexts[0].includes("[NOME]"));
});

test("aceita apresentação explícita e usa o primeiro nome sem expor marcador", () => {
  assert.equal(extrairNomeInformado("Meu nome é Ana Maria e preciso de ajuda.", []), "Ana Maria");
  assert.equal(extrairNomeInformado("Obrigado", [{ role: "assistant", content: "Qual é o seu nome?" }]), null);
  assert.equal(respostaComNome("Entendo, [NOME]!", "Ana Maria"), "Entendo, Ana!");
});

test("não prefixa a resposta com a persona nem reutiliza seu nome como cliente", async () => {
  const f = fixture();
  await f.port.rememberName!("Thaís");
  f.port.generate = async agentConfig => {
    assert.doesNotMatch(agentConfig.AI_SYSTEM_PROMPT, /Nome confirmado pelo próprio cliente: Thaís/u);
    return "Thaís, Oi, Carlos! 😊";
  };
  await processMessage(message, { ...config, AI_SYSTEM_PROMPT: "Persona: Thaís (Feminino)\nAtenda conforme o prompt." }, f.port);
  assert.match(f.sentTexts[0], /^Oi, Carlos!/u);
  assert.doesNotMatch(f.sentTexts[0], /^Thaís,/u);
});

test("preserva apresentação da assistente e tratamento natural do cliente", () => {
  assert.equal(respostaComNome("Oi, Carlos!", "Carlos"), "Oi, Carlos!");
  assert.equal(respostaComNome("Eu sou a Thaís. Posso ajudar?", "Carlos"), "Eu sou a Thaís. Posso ajudar?");
});

test("transcreve uma vez, reaproveita após falha de geração e registra a fala no histórico", async () => {
  const f = fixture(); let transcriptions = 0; let generations = 0;
  const audio = { ...message, text: "", audio: { id: "audio-1" } };
  f.port.transcribe = async () => { transcriptions++; return "Quero saber das aulas"; };
  f.port.generate = async (_config, _history, text) => {
    assert.equal(text, "Quero saber das aulas");
    if (++generations === 1) throw new ProviderError("openai_http_429");
    return "Como posso ajudar com as aulas?";
  };
  assert.equal(await processMessage(audio, config, f.port), "repetir");
  assert.equal(await processMessage(audio, config, f.port), "enviada");
  assert.equal(await processMessage(audio, config, f.port), "enviada");
  assert.equal(transcriptions, 1); assert.equal(f.sends(), 1);
  assert.equal(f.turns[0].content, "Quero saber das aulas");
});

test("falha de transcrição não gera nem envia e não expõe erro privado", async () => {
  const f = fixture();
  f.port.transcribe = async () => { throw new Error("conteúdo privado"); };
  const audio = { ...message, text: "", audio: { id: "audio-1" } };
  for (const result of ["repetir", "repetir", "falhou", "falhou"]) {
    assert.equal(await processMessage(audio, config, f.port), result);
  }
  assert.equal(f.generations(), 0); assert.equal(f.sends(), 0);
  assert.ok(!JSON.stringify(f.state()).includes("privado"));
});

test("pausa durante transcrição impede geração e envio; retomada usa transcrição salva", async () => {
  const f = fixture(); let enabled = true; let transcriptions = 0;
  f.port.enabled = async () => enabled;
  f.port.transcribe = async () => { transcriptions++; enabled = false; return "Olá"; };
  const audio = { ...message, text: "", audio: { id: "audio-1" } };
  assert.equal(await processMessage(audio, config, f.port), "pausada");
  assert.equal(f.generations(), 0); assert.equal(f.sends(), 0);
  enabled = true;
  assert.equal(await processMessage(audio, config, f.port), "enviada");
  assert.equal(transcriptions, 1);
});

test("provedor busca áudio pelo ID e envia multipart autenticado à OpenAI", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(init?.redirect, "error");
    if (calls === 1) {
      assert.equal(url, "https://evolution.example.com/chat/getBase64FromMediaMessage/teste");
      assert.equal(new Headers(init?.headers).get("apikey"), "teste");
      assert.deepEqual(JSON.parse(String(init?.body)), { message: { key: { id: "audio-1" } }, convertToMp4: false });
      return Response.json({ mimetype: "audio/ogg; codecs=opus", base64: Buffer.from("audio simulado").toString("base64") });
    }
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer sk-test-only");
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get("model"), "gpt-4o-mini-transcribe");
    const file = init.body.get("file"); assert.ok(file instanceof File);
    assert.equal(file.name, "mensagem.ogg"); assert.equal(file.type, "audio/ogg");
    assert.equal(await file.text(), "audio simulado");
    return Response.json({ text: " Quero uma aula. " });
  };
  assert.equal(await transcribeAudio(config, { ...message, audio: { id: "audio-1" } }, request), "Quero uma aula.");
  assert.equal(calls, 2);
});

test("recusa mídia inválida, excessiva e erros dos provedores sem vazar conteúdo", async () => {
  const audio = { ...message, audio: { id: "audio-1" } };
  for (const media of [
    { mimetype: "image/png", base64: "YQ==" },
    { mimetype: "audio/ogg", base64: "!inválido" },
    { mimetype: "audio/ogg", base64: "" },
    { mimetype: "audio/ogg", base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64") },
  ]) {
    let calls = 0;
    await assert.rejects(transcribeAudio(config, audio, async () => { calls++; return Response.json(media); }), ProviderError);
    assert.equal(calls, 1);
  }
  await assert.rejects(transcribeAudio(config, audio, async () => new Response("segredo", { status: 401 })),
    { message: "evolution_audio_http_401" });
  let calls = 0;
  await assert.rejects(transcribeAudio(config, audio, async () => ++calls === 1
    ? Response.json({ mimetype: "audio/ogg", base64: "YQ==" })
    : Response.json({ text: " " })), { message: "audio_transcricao_invalida" });
});

test("aceita texto individual e resolve LID somente pelo telefone alternativo", () => {
  assert.equal(message.number, "5511999999999");
  assert.equal(message.text, "Oi");
  assert.equal(incomingMessage({ ...event, date_time: "outro-envelope" }, "teste", 1700000000000)?.identity, message.identity);
  assert.equal(incomingMessage(event, "outra-instancia", 1700000000000), null);
  assert.equal(incomingMessage(event, "teste", 1700000400000), null);
  assert.equal(incomingMessage({ ...event, event: "messages.update" }, "teste", 1700000000000), null);
  for (const key of [
    { id: "1", fromMe: true, remoteJid: "5511999999999@s.whatsapp.net" },
    { id: "1", fromMe: false, remoteJid: "grupo@g.us", remoteJidAlt: "5511999999999@s.whatsapp.net" },
    { id: "1", fromMe: false, remoteJid: "123@lid" },
  ]) assert.equal(incomingMessage({ ...event, data: { ...event.data, key } }, "teste", 1700000000000), null);
});

test("gera, envia, registra histórico e não responde novamente ao mesmo ID", async () => {
  const f = fixture();
  assert.equal(await processMessage(message, config, f.port), "enviada");
  assert.equal(await processMessage(message, config, f.port), "enviada");
  assert.equal(f.sends(), 1); assert.equal(f.generations(), 1);
  assert.deepEqual(f.turns.map(turn => turn.role), ["user", "assistant"]);
});

test("falha ao gerar permite três tentativas, sem enviar texto de erro", async () => {
  const f = fixture(); f.port.generate = async () => { throw new Error("credencial privada"); };
  assert.equal(await processMessage(message, config, f.port), "repetir");
  assert.equal(await processMessage(message, config, f.port), "repetir");
  assert.equal(await processMessage(message, config, f.port), "falhou");
  assert.equal(await processMessage(message, config, f.port), "falhou");
  assert.equal(f.sends(), 0); assert.ok(!JSON.stringify(f.state()).includes("credencial"));
});

test("timeout do envio e reinício durante envio não causam duplicatas", async () => {
  const f = fixture(); let sends = 0;
  f.port.send = async () => { sends++; throw new Error("timeout"); };
  assert.equal(await processMessage(message, config, f.port), "incerta");
  assert.equal(await processMessage(message, config, f.port), "incerta");
  assert.equal(sends, 1);
  const interrupted = fixture();
  await interrupted.port.write({ status: "enviando", attempts: 1, reply: "Olá" });
  assert.equal(await processMessage(message, config, interrupted.port), "incerta");
  assert.equal(interrupted.sends(), 0);
});

test("perda de persistência antes do envio impede chamada à Evolution", async () => {
  const f = fixture(); const write = f.port.write;
  f.port.write = async state => { if (state.status === "enviando") throw new Error("Redis indisponível"); await write(state); };
  await assert.rejects(processMessage(message, config, f.port));
  assert.equal(f.sends(), 0);
});

test("queda após envio confirmado não repete chamada externa", async () => {
  const f = fixture(); f.port.complete = async () => { throw new Error("Redis indisponível"); };
  await assert.rejects(processMessage(message, config, f.port));
  assert.equal(await processMessage(message, config, f.port), "incerta");
  assert.equal(f.sends(), 1);
});

test("desativação durante geração impede envio", async () => {
  const f = fixture(); let active = true;
  f.port.enabled = async () => active;
  f.port.generate = async () => { active = false; return "Olá"; };
  assert.equal(await processMessage(message, config, f.port), "pausada");
  assert.equal(f.sends(), 0);
});

test("configuração exige ativação explícita, chatbot, modelo e credenciais", () => {
  assert.equal(agentConfigSchema.safeParse(config).success, true);
  assert.equal(agentBaseConfigSchema.safeParse({ ...config, AI_SYSTEM_PROMPT: undefined }).success, true);
  for (const field of ["AI_ENABLED", "AI_SYSTEM_PROMPT", "OPENAI_MODEL", "OPENAI_API_KEY", "EVOLUTION_API_KEY"])
    assert.equal(agentConfigSchema.safeParse({ ...config, [field]: "" }).success, false);
});

test("somente o prompt do chatbot compõe as instruções; sem ele o agente não responde", () => {
  const bot = {
    ...chatbotExample, context: "Apresente-se como Thaís e siga este roteiro.", mission: "Atender os clientes do TMF.",
  };
  const instrucoes = montarInstrucoesDoAgente(bot);
  assert.equal(montarInstrucoesDoAgente(null), "");
  assert.equal(montarInstrucoesDoAgente(chatbotExample), "");
  assert.ok(!instrucoes.includes("CONTEXTO GERAL DA OPERAÇÃO"));
  assert.ok(instrucoes.includes("Apresente-se como Thaís e siga este roteiro."));
  assert.ok(instrucoes.includes("CONFIGURAÇÃO DO CHATBOT SDR"));
  assert.equal(configurarAgente({ ...config, AI_SYSTEM_PROMPT: "CONTEXTO LEGADO" }, null).success, false);
  const compilado = configurarAgente({ ...config, AI_SYSTEM_PROMPT: "CONTEXTO LEGADO" }, bot);
  assert.equal(compilado.success, true);
  if (compilado.success) {
    assert.ok(compilado.data.AI_SYSTEM_PROMPT.includes(bot.context));
    assert.ok(!compilado.data.AI_SYSTEM_PROMPT.includes("CONTEXTO LEGADO"));
  }
});

test("agente da farmácia não injeta regras dos negócios anteriores", () => {
  const bot = { ...chatbotExample, context: "Atenda os clientes desta farmácia." };
  const instrucoes = montarInstrucoesDoAgente(bot);
  assert.ok(!instrucoes.includes("mentoria em grupo"));
  assert.ok(instrucoes.includes("ESTOQUE REAL"));
  assert.ok(instrucoes.includes("confirmação autorizada"));
  assert.ok(!instrucoes.includes("Juliana"));
  assert.ok(!instrucoes.includes("Wellington"));
});

test("OpenAI recebe contexto e histórico separados, sem salvar resposta no provedor", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.model, config.OPENAI_MODEL);
    assert.ok(body.instructions.includes(config.AI_SYSTEM_PROMPT));
    assert.deepEqual(body.input, [{ role: "assistant", content: "Olá" }, { role: "user", content: "Preciso de ajuda" }]);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Posso ajudar." }] }] });
  };
  assert.equal(await generateReply(config, [{ role: "assistant", content: "Olá" }], "Preciso de ajuda", fake), "Posso ajudar.");
  await assert.rejects(generateReply(config, [], "Oi", async () => Response.json({ status: "incomplete", output: [] })));
  await assert.rejects(generateReply(config, [], "Oi", async () => Response.json({}, { status: 401 })), /openai_http_401/);
});

test("Evolution recebe texto e telefone corretos; exige confirmação de envio", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(url, "https://evolution.example.com/message/sendText/teste");
    assert.deepEqual(JSON.parse(String(init?.body)), { number: message.number, text: "Olá", linkPreview: false });
    assert.equal(new Headers(init?.headers).get("apikey"), "teste");
    assert.equal(init?.redirect, "error");
    return Response.json({ key: { id: "sent-id" } });
  };
  assert.equal(await sendReply(config, message.number, "Olá", fake), "sent-id");
  await assert.rejects(sendReply(config, message.number, "Olá", async () => Response.json({})), /confirmacao_ausente/);
});
