# ADR 0016 — Envio humano de texto e mídia

Status: aceito em 2026-11-13.

O envio humano usa uma projeção estrita das três credenciais Evolution, separada do schema de IA. Omitir campos do schema de IA mantendo o objeto completo fazia a validação estrita recusar configurações legítimas. O chip vem da conversa e precisa estar configurado; não há fallback para outro número.

A action validarCanalAtendimento em src/lib/actions/atendimento-farmacia.ts exige sessão e permissão de operador, valida o ID da conversa e consulta somente a conexão do chip vinculado. Não envia mensagem, não altera dados e não devolve credenciais ao navegador.

Texto, imagem e áudio reutilizam a reserva persistente de envio, a autorização do atendente e a trilha auditável existentes. Não há nova tabela ou migração. Timeout ou resposta sem ID deixam a entrega incerta, sem repetição automática. Mídia limitada a 2 MB fica em memória durante a requisição; banco guarda somente tipo e marcador/legenda. Não introduz armazenamento público nem busca de URLs arbitrárias. Histórico do CRM não reproduz o binário enviado.

O mesmo transporte sendMedia atende também vídeo MP4/WebM e documento PDF/DOCX, com MIME, assinatura e nome gerado no servidor. A interface mantém anexos, emojis e ações em menus recolhidos para reduzir a altura do compositor. Confirmações são transitórias por quatro segundos; falhas permanecem visíveis. Nenhuma confirmação comercial ou autorização de envio foi removida.

Imagem usa sendMedia com base64, tipo e legenda; áudio usa sendWhatsAppAudio com encoding ligado para conversão em voz pela Evolution. Contratos conferidos no [DTO oficial](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/dto/sendMessage.dto.ts) e no [serviço Baileys](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts). A instância precisa suportar essa conversão. Não há chamada OpenAI para envio manual.

MediaRecorder captura só após clique e permissão, oferece prévia local e limita gravação a 60 segundos; arquivos anexados continuam limitados pelo tamanho. Permissions-Policy libera microphone apenas para self, mantendo câmera/geolocalização bloqueadas. Áudio também pode ser anexado quando a gravação não for suportada. Faixas, temporizador e URLs locais são liberados ao sair. O limite de Server Actions permanece em 4 MB, suficiente para base64 de um arquivo de 2 MB com metadados.
