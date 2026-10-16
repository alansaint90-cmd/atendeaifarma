# ADR-0003: Processamento de respostas WhatsApp

- Status: Aceito para implementação; ativação externa explícita.
- Data: 2026-09-16

O webhook anterior somente enfileirava eventos. Implementamos um consumidor Redis
no processo Node persistente já usado pelo EasyPanel. Ele não roda durante build,
nem inicia sem ATENDEIA_WORKER_ENABLED=true. AI_ENABLED permite pausar os envios.
Não funciona como worker persistente em hospedagem serverless.

A Evolution 2.3.7 da instalação pode entregar eventos sem o cabeçalho secreto e
receber 401. O painel oferece sincronização explícita do webhook da instância pela
API da Evolution, com `x-webhook-secret` em `headers`. Preserva outros eventos
assinados, desliga By Events/Base64 e confirma o resultado por nova consulta. Não
aceitamos `apikey` do corpo como autenticação: segredo de máquina só em cabeçalho.

Mantemos a configuração administrativa existente no PostgreSQL, com criptografia,
autenticação e versão. O campo legado AI_SYSTEM_PROMPT permanece legível para não
invalidar dados já salvos, mas não é editável nem enviado ao provedor. Chatbots são
compartilhados no PostgreSQL e o chatbot vinculado ao canal Evolution fornece todas
as instruções: persona, missão, prompt de atendimento, fallback, transferência e
fluxos. Sem chatbot com prompt, o worker não responde. Ele recompõe a configuração
a cada mensagem; uma alteração salva passa a valer nas mensagens seguintes.

Entrega e histórico recente ficam no Redis dedicado. Consumer group com consumidor
fixo e lease global recuperam eventos pendentes; scripts Lua verificam posse antes
de mudar checkpoints, confirmar histórico ou arquivar/confirmar a fila. A execução
serial favorece consistência em instalação pequena; aumentar paralelismo exige
particionar por conversa e rever a recuperação, não apenas aumentar réplicas.

Saída manual individual `fromMe=true` registra no Redis, junto com a entrada
autenticada na fila, uma pausa de 30 minutos para aquela conversa. O prazo usa
o horário do evento e só aumenta com uma saída manual mais recente. O marcador
do ID de envio da própria IA impede que seu eco seja classificado como humano.
O worker verifica a pausa antes de gerar e novamente antes de enviar; mensagens
recebidas durante a pausa são arquivadas sem resposta atrasada. Como em qualquer
envio externo, o webhook manual e uma geração já em curso podem cruzar-se; a
verificação imediatamente anterior ao envio reduz essa janela, sem prometer
cancelamento de chamada externa já iniciada.

Falhas de geração têm até três tentativas. Não repetimos envios com resultado
incerto, pois a API externa não fornece uma garantia de idempotência comprovada.
Isso pode exigir intervenção manual após uma queda, mas evita respostas duplicadas.
Não declarar entrega exatamente uma vez. Redis deve ter persistência e noeviction.

Retenções: diário de entrega 30 dias, histórico de 12 turnos por 24 horas, arquivo
limitado a 10 mil resultados. As tabelas operacionais e a caixa de entrada não são
integradas por esta mudança. Grupos, outras mídias, lotes, fluxos e atendimento humano ficam
fora da automação de texto inicial. Eventos antigos não geram respostas atrasadas.

O nome fornecido pelo cliente é guardado separadamente no Redis, por conversa, por
até 100 dias. O agente pede o nome no primeiro contato quando ele não foi informado,
usa o primeiro nome nas respostas posteriores e substitui marcadores do prompt antes
do envio. O nome não é inferido do nome de exibição do WhatsApp.

Extensão de áudio (2026-09-20): a seleção também aceita audioMessage individual.
O adaptador consulta getBase64FromMediaMessage pelo ID, na instância configurada,
com convertToMp4=false; não baixa URLs fornecidas pelo evento. OGG/Opus segue para
OpenAI audio/transcriptions com gpt-4o-mini-transcribe, usando a chave existente.
O limite local é 10 MiB; download e transcrição têm 15 e 25 segundos de timeout.
Somados à geração (45 s) e envio (20 s), ficam abaixo da lease de 120 s; posse e
ativação continuam verificadas antes do envio. Webhook Base64 deve ficar desligado
e a Evolution deve persistir mensagens para permitir consulta por ID.

O binário existe apenas em memória. A transcrição é validada e salva no checkpoint
antes da geração, permitindo retomar sem retranscrever após falha de geração.
Usa as retenções existentes do diário e histórico Redis; não exige migração SQL.
Falha de transcrição não produz resposta inventada nem expõe o erro do provedor.
O retorno ao WhatsApp continua sendo texto e preserva a barreira de envio incerto.

- [OpenAI transcrição](https://developers.openai.com/api/reference/cli/resources/audio/subresources/transcriptions/methods/create): multipart, formatos e modelo.
- [Evolution mídia](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts): consulta por message.key.id e retorno base64/mimetype.

Fontes verificadas para os contratos externos:

- [OpenAI Responses](https://developers.openai.com/api/reference/cli/resources/responses/methods/create): instructions, input e store.
- [Evolution SendTextDto](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/dto/sendMessage.dto.ts): number, text e linkPreview. Testes usam provedores simulados; compatibilidade final depende da instalação Evolution ativa.

Validação: testes unitários de seleção de eventos, provedores, geração, pausa,
retentativas e quedas durante envio; testes de UI e proteção administrativa. O CI
inclui Redis 7 descartável no banco 15 para executar recuperação de pendentes,
diário, histórico, arquivo, deduplicação e rejeição de posse antiga com Lua real.

Verificação local executada: lint e TypeScript aprovados; auditor com 53 arquivos
e zero violações; 28/28 testes do auditor; 31 testes Node aprovados e um teste Redis
pulado por ausência de TEST_REDIS_URL; 6 testes de UI aprovados. Build compilou em
11 segundos e gerou as três páginas. Não houve chamada real aos provedores.
