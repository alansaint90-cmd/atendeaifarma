# ADR 0015 — Interface de conversas compartilhável

Status: aceito em 2026-11-12. Complementa ADR-0007 e ADR-0014.

A apresentação fica em src/components/conversas, sem importar actions, credenciais ou regras da farmácia. Recebe lista tipada, seleção e área de resposta do adaptador. OperacaoPage fornece os dados autenticados e AtendimentoManual conserva as operações já autorizadas de assumir conversa, pausar IA e enviar com proteção contra repetição incerta.

Desktop usa duas colunas com rolagem própria; celular alterna lista e conversa, com retorno e foco acessível. Busca local não altera a seleção nem transforma falha de servidor em ausência de conversas. A atualização de dez segundos preserva a leitura quando o usuário está acima do fim do histórico.

O limite de exibição de contatos passa de 100 para 150 em uma constante compartilhada entre consulta e interface. Não é quota de armazenamento. Conversas e mensagens mantêm os recortes anteriores de 50.

A migração 0015 adiciona somente foto_url nullable ao contato existente. Fotos vêm dos eventos de contatos já documentados no [código da Evolution](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts), com webhook autenticado, vínculo à instância, validação HTTPS, versão e auditoria. Não há download no servidor, nova tabela ou importação de contatos por esse evento.

Os demais sistemas podem adotar o componente e a folha src/styles/conversas.css, fornecendo adaptadores próprios. Esta entrega altera somente o repositório da farmácia; não copia dados, segredos ou regras clínicas para outros projetos e não implanta outros serviços.
