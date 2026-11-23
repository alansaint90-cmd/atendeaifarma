# ADR 0015 — Interface de conversas compartilhável

Status: aceito em 2026-11-12. Complementa ADR-0007 e ADR-0014.

A apresentação fica em src/components/conversas, sem importar actions, credenciais ou regras da farmácia. Recebe lista tipada, seleção e área de resposta do adaptador. OperacaoPage fornece os dados autenticados e AtendimentoManual conserva as operações já autorizadas de assumir conversa, pausar IA e enviar com proteção contra repetição incerta.

Desktop usa duas colunas com rolagem própria; celular alterna lista e conversa, com retorno e foco acessível. Busca local não altera a seleção nem transforma falha de servidor em ausência de conversas. A atualização de dez segundos preserva a leitura quando o usuário está acima do fim do histórico.

O limite de exibição de contatos passa de 100 para 150 em uma constante compartilhada entre consulta e interface. Não é quota de armazenamento. Conversas e mensagens mantêm os recortes anteriores de 50.

A migração 0015 adiciona somente foto_url nullable ao contato existente. Fotos vêm dos eventos de contatos já documentados no [código da Evolution](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts), com webhook autenticado, vínculo à instância, validação HTTPS, versão e auditoria. Não há download no servidor, nova tabela ou importação de contatos por esse evento.

A rota GET `/api/farmacia/foto/[id]` recupera perfis com foto ausente ou expirada sob demanda. O ID interno identifica uma conversa viva, e o chip e telefone vêm do vínculo no PostgreSQL. O operador é validado antes da consulta à Evolution e o vínculo é revisto antes do redirecionamento. Só a URL HTTPS em CDN autorizada é devolvida, com cache desativado no navegador e cache de URLs por dois minutos no processo do servidor. A interface compartilhada recebe a fonte alternativa da página de conversas, carrega conforme a necessidade e mostra iniciais em caso de indisponibilidade.

Os demais sistemas podem adotar o componente e a folha src/styles/conversas.css, fornecendo adaptadores próprios. Esta entrega altera somente o repositório da farmácia; não copia dados, segredos ou regras clínicas para outros projetos e não implanta outros serviços.

Em 2026-11-19, o adaptador passa ações opcionais de cabeçalho ao componente compartilhado. Apagar conversa usa a versão inteira já existente no schema ativo e exclusão lógica do atendimento, sem migração ou alteração dos filhos. Auditoria e exclusão ficam na mesma transação; o histórico preservado impede replay de mensagens legadas. O processador consulta o tombstone PostgreSQL antes de cada parte e antes de processar follow-ups antigos. Não há remoção distribuída de fila Redis na action: o worker encerra os jobs antigos sob sua própria trava. Mensagem posterior pode abrir atendimento novo. Envios já iniciados não são recolhidos.

A exclusão de contatos usa o mesmo padrão de versão e auditoria, arquivando logicamente seus atendimentos na transação. Uma trava consultiva por telefone é compartilhada com o recebimento; lotes adquirem as travas em ordem. Isso permite que mensagem posterior crie contato e atendimento novos, sem conversa viva ligada ao cadastro excluído. Deduplicação e tombstones são consultados antes de criar contatos, impedindo recriação por replay. Não há migração nem exclusão física, e pedidos e mensagens são preservados.
