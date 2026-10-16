# ADR-0013: Abertura configurável em balões

Status: aceito em 2026-10-06. Complementa ADR-0003 e ADR-0011.

O chatbot pode salvar até dois textos em `openingMessages` no JSON existente.
O painel edita esses textos por instância; não existe roteiro comercial no worker.
Sem configuração, preserva a geração atual. A abertura literal só atende saudação
simples, sem nome confirmado nem histórico recente. A migração de dados 0010 aplica
a abertura solicitada ao chatbot exclusivo de levaelava, com versão e auditoria.
Não altera tabelas nem substitui o prompt; cadastros novos usam o editor.

O diário Redis guarda partes e IDs confirmados. Antes de cada chamada, verifica
habilitação/pausa e grava `enviando`. Registra cada ID como saída da IA para que
o eco não seja atendimento humano. Após parte intermediária confirmada, salva o
próximo índice; após a última, confirma estado e histórico juntos. Queda durante
envio ou falha de registro termina como incerta, sem repetição automática.
Alteração de configuração após envio parcial não reinicia a abertura. Pausa humana
pode interromper a sequência; não existe garantia de cancelamento de chamada externa
já iniciada. Follow-up só é programado após a resposta completa.
