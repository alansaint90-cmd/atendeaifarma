# ADR-0004: Follow-ups e tags administrativos

- Data: 2026-09-16
- Status: implementado, ativação de envio explícita pelo administrador.

As duas páginas seguem a navegação existente do Workspace. As Server Actions
validam o token administrativo em tempo constante e consultam o ator
bootstrap-admin vivo com papel super_admin em cada requisição. Esta é a adaptação
temporária das guards de sessão da base: a sessão de usuários continua fechada e
o login demonstrativo não concede acesso. Tokens ficam apenas na memória da tela.

Actions: carregarFollowups lê a configuração; salvarFollowups valida e salva uma
nova revisão; carregarTags lista registros vivos; salvarTag cria ou edita com
versão; excluirTag executa exclusão lógica com versão.

Tags usam a tabela operacional existente, com migração aditiva da coluna color.
Consultas filtram is_deleted=false; atualizações conferem version e incrementam
a versão. A transação inclui a auditoria. modified_by usa o ator técnico já
existente, sem atribuir falsamente a mudança ao usuário demonstrativo. A ação
auditada registra a origem administrativa; não há identificação individual por
um token compartilhado. Atribuição de tags aos contatos não faz parte destas telas.

Follow-ups são configuração criptografada no repositório de integrações existente,
com validação, auditoria e controle de versão. Cada salvamento gera uma revisão
nova, invalidando sequências anteriores, inclusive ao desligar e religar.
FOLLOW_UP_CONFIG é interno, editado pela página; não é necessário configurar env.

O processador Node/Redis da ADR-0003 também consome agendamentos, após esvaziar a
fila de eventos. Só agenda após resposta da IA confirmada e com a configuração
atual. Usa janela semanal e fuso, até três etapas e intervalos a partir do envio
anterior. Uma atividade individual mais recente cancela a sequência, inclusive
mídia ou mensagem manual do operador. Ecos dos envios próprios são identificados
pelo id retornado pela Evolution. Isso depende de a instância enviar os eventos
messages.upsert correspondentes; não há cancelamento se o evento não chegar.

Antes de enviar, confere novamente configuração, lease e fila. Há uma janela
inevitável entre a última leitura e a chamada externa: uma mensagem recebida nesse
instante pode cruzar com o envio já iniciado. Entrega ambígua nunca é repetida.
Não garantimos entrega exatamente uma vez. Não integramos status de atendimento
humano da caixa de entrada demonstrativa; somente a atividade recebida é usada.

Redis mantém agendamentos/deduplicação por 100 dias, histórico por 24 horas e
resultados limitados a 10 mil entradas. Precisa de persistência e noeviction.
Os pré-requisitos continuam ATENDEIA_WORKER_ENABLED=true, AI_ENABLED=true,
credenciais válidas e instância igual à configurada. As telas não ativam o worker.

Validação cobre permissões, schema, janela/fuso, pausa, entrega incerta, migração,
versão, exclusão lógica, auditoria e UI. Provedores são simulados; integração Redis
real roda somente com TEST_REDIS_URL local descartável (banco 15).
