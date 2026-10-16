# ADR-0007: Dados operacionais reais no painel

- Data: 2026-09-17
- Status: implementado; implantação no PostgreSQL do EasyPanel pendente.

Dashboard, contatos e caixa de entrada deixam de usar exemplos fixos. A Server
Action `carregarOperacao` exige o token e ator administrativo vivo da ADR-0004 antes de consultar o
PostgreSQL. O acesso demonstrativo não concede leitura. O CRM com sessão individual
continua separado e em homologação; a consulta administrativa global não é multiempresa.

O webhook autenticado registra messages.upsert no PostgreSQL antes de enfileirar
no Redis. Isso independe de AI_ENABLED e do worker. A configuração Redis continua
obrigatória no contrato existente; se a fila falhar, retorna 503 e o registro já
confirmado no PostgreSQL é deduplicado na nova tentativa. Banco indisponível também
retorna 503, sem enfileirar. Não existe transação distribuída entre os serviços.

Reutilizamos canais, contatos, conversas, mensagens e auditoria. A única tabela nova,
atendeia_webhook_recebimentos, guarda o hash de instância/ID com índice único permanente
e auditoria. Recibo e histórico são atômicos. Assim, repetir um evento após fechar ou
excluir logicamente uma conversa não cria outra conversa. O recibo não expira com Redis.
Mensagens preexistentes também são reconhecidas pela identidade externa e canal.

Aceitamos mensagens individuais com telefone E.164, inclusive LID com telefone
alternativo. Lotes são registrados, mas continuam fora das respostas automáticas.
Texto e legenda são guardados; mídia sem legenda recebe marcador de tipo, sem download,
URL privada ou binários. Eventos de protocolo/status e grupos não criam contatos.
Não há importação retroativa da fila antiga: aparecem eventos entregues ao novo webhook.
Nomes existentes e cadastros reais são preservados. Eventos fromMe são registrados como
saída de sistema, sem atribuir autoria humana ou de bot não comprovada. As respostas
aparecem quando a Evolution envia o respectivo messages.upsert, não só pela chamada sendText.

O painel exibe um snapshot consistente do banco e atualização manual. Banco vazio
mostra zero/listas vazias; falta de autenticação ou erro não se apresenta como zero.
Listas limitam a 100 contatos recentes, 50 conversas e 50 mensagens por conversa;
contadores agregam todos os registros vivos. A caixa de entrada é consulta, sem
simular envios ou transferências. Os demais módulos não integrados exibem seu estado
de indisponibilidade, sem equipe, campanhas ou assinaturas inventadas.

Testes usam migrações PostgreSQL isoladas via PGlite, sem chamadas aos provedores.
Validar PostgreSQL 16, persistência, webhook e ecos fromMe em homologação antes de
promover a produção. A migração nova é aditiva e não apaga registros nem credenciais.

O dashboard posterior consulta `carregarPainel` por canal e intervalo de datas. O
gráfico agrega novas conversas e conversas com atendimento identificado por dia
no fuso do navegador; a tabela de dados acompanha o gráfico para leitura acessível.
Envios confirmados da IA são registrados por instância e ID da Evolution na tabela
aditiva `atendeia_envios_ia`. Registro e eco usam a mesma trava por identidade,
permitindo atribuição `bot` independentemente da ordem de chegada. Uma mensagem
`system` sem correspondência não vira IA nem humano por suposição. Apenas autoria
`agent` comprovada entra em atendimento humano. A tabela guarda IDs de envio,
sem conteúdo de mensagens ou credenciais.
