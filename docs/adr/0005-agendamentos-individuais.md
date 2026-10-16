# ADR-0005: Agendamentos individuais

- Data: 2026-09-16
- Status: implementado; ativação operacional depende do worker existente.

A página Agendamentos segue a navegação e o acesso administrativo da ADR-0004.
carregarAgendamentos lista dados, chip e habilitação do processador;
gravarAgendamento cria/edita; cancelarEnvioAgendado cancela somente pendentes.
Todas as actions verificam token e ator vivo no banco, validam entrada com Zod
e retornam Resultado. Mutações e auditoria ficam na mesma transação. O ator
técnico registra a origem administrativa, sem fingir identidade individual.

Nova tabela atendeia_agendamentos conserva telefone E.164, instância, texto,
instante UTC, status, identificação de entrega, versão e auditoria. Usa as
colunas de auditoria da base, precisão de milissegundos e FK RESTRICT para o ator
operacional. A migração é apenas aditiva; não altera tabelas ou credenciais antigas.
Cancelamento preserva o registro e não permite cancelamento após reserva do envio.

O formulário apresenta horários no fuso do navegador e converte para ISO UTC.
O servidor exige pelo menos um minuto de antecedência e no máximo um ano.
O UUID do formulário evita duplicação ao repetir a mesma criação por falha de rede.
Edição/cancelamento usam versão e status pendente no predicado atômico.

O loop Node existente executa agendamentos antes de cada ciclo da IA, quando
ATENDEIA_WORKER_ENABLED=true. Envio de texto fixo não exige OpenAI nem AI_ENABLED.
Credenciais Evolution vêm exclusivamente das configurações do servidor.
Só reserva agendamentos do chip configurado, após a data prevista. Reservas usam
FOR UPDATE SKIP LOCKED e status enviando antes de fazer a chamada externa.
Várias réplicas não reservam o mesmo registro. Não há promessa de execução no
segundo exato: filas, geração de IA ou indisponibilidade podem causar atraso.

Uma mudança de configuração antes da chamada encerra o registro com erro.
Timeout, resposta inválida ou falha do provedor tornam o envio incerto sem repetição.
Reservas interrompidas por mais de cinco minutos são marcadas incertas. A gravação
de enviado exige a versão reservada; falha de confirmação nunca retorna o registro
para pendente. Enviado significa aceito pela Evolution, não entregue/lido no WhatsApp.
Para tentar novamente, o administrador deve conferir a Evolution e criar outro
agendamento, confirmando explicitamente o novo envio.

Envios individuais não integram campanhas, anexos nem histórico de IA. O evento
fromMe correspondente é tratado como atividade manual e pode cancelar follow-ups.
Testes de banco/entrega usam PostgreSQL isolado via PGlite e provedores simulados.
Não são enviadas mensagens reais durante a validação.
