# Auditoria da evolução — 17/09/2026

## Base encontrada antes das alterações desta evolução

Next.js App Router/React, TypeScript, Drizzle/postgres-js, PostgreSQL e Redis.
Navegação principal em Workspace, com componentes interativos e telas HTML de
demonstração em src/lib/demo/views.ts. Schema ativo em src/lib/db/schema.ts;
modelos usuarios/auditoria da pasta schema não estão integrados ao banco ativo.
Migrações 0000–0002 possuem checksum e transação. Credenciais criptografadas no
PostgreSQL. Worker persistente no processo Node; hospedagem atual EasyPanel.

Autorização administrativa usa SETTINGS_ADMIN_TOKEN e ator bootstrap-admin.
Login do Workspace é demonstrativo; obterSessao retorna null. Não há autorização
individual, tenant ou funis. Tabelas operacionais existentes não equivalem a
funcionalidades completas: contatos, conversas, campanhas e fluxos não possuem
repositórios operacionais vinculados às telas. Não criar entidades duplicadas.

Evolution recebe webhook autenticado e limitado, com deduplicação Redis. IA
responde texto individual usando histórico limitado; não persiste conversa no
PostgreSQL. Follow-ups possuem dias, janela, fuso e três textos em uma instância.
Agendamentos de texto usam PostgreSQL, reserva exclusiva e entrega conservadora.
Testes usam provedores simulados e PGlite; Redis real é condicional. Não há prova
de implantação/migrações/integração ponta a ponta na produção nesta auditoria.

## Matriz antes das alterações

| Requisito | Estado atual | Evidência e ação |
|---|---|---|
| 1. Kanban/oportunidades | NÃO IMPLEMENTADO | Criar funis, etapas, oportunidades, fechamento e motivos relacionais. |
| 2. Conversão | NÃO IMPLEMENTADO | Dashboard contém números demonstrativos; agregar dados reais. |
| 3. Receita por funil | NÃO IMPLEMENTADO | Usar numeric e fechamento, filtros de período e responsável. |
| 4. Análise de perdas | NÃO IMPLEMENTADO | Motivos, valor potencial e detalhamento filtrado. |
| 5. Filtros Kanban | NÃO IMPLEMENTADO | Combinar datas, responsável, etapa, status e tags. |
| 6. Permissões de funil | NÃO IMPLEMENTADO | Escopo obrigatório em consultas e mutações no backend. |
| 7. Follow-ups | PARCIAL | Dias/janelas/fuso existentes; faltam tags/funis/etapas. |
| 8. Follow-up por chip | PARCIAL | Instância única; migrar configuração sem apagar o formato atual. |
| 9. Follow-up IA | NÃO IMPLEMENTADO | Gerar rascunho, editar e aprovar sem envio implícito. |
| 10. Resumo IA | NÃO IMPLEMENTADO | Depende de conversa real persistida e autorização. |
| 11. IA aciona fluxos | NÃO IMPLEMENTADO | Criar registro de ações permitidas e executor validado. |
| 12. Condição chip | NÃO IMPLEMENTADO | Construtor é demonstração, sem execução. |
| 13. Condição tag | NÃO IMPLEMENTADO | Implementar no mesmo motor de fluxo. |
| 14. Variáveis globais | NÃO IMPLEMENTADO | Cadastro e rastreamento de referências. |
| 15. Variáveis contato | NÃO IMPLEMENTADO | Contato ainda sem campos personalizados operacionais. |
| 16. Variáveis em menus | NÃO IMPLEMENTADO | Renderizador compartilhado com limites. |
| 17. JavaScript isolado | NÃO IMPLEMENTADO | Não usar eval/vm como fronteira de segurança. |
| 18. Duplicação de blocos | NÃO IMPLEMENTADO | IDs novos e referências internas remapeadas. |
| 19. Alterações não salvas | PARCIAL | Rascunhos montados, sem proteção de saída de fluxo. |
| 20. Importar/exportar fluxos | NÃO IMPLEMENTADO | Schema versionado, validação de grafo e limite de arquivo. |
| 21. Temporizador | NÃO IMPLEMENTADO | Execução durável, sem bloquear processo Node. |
| 22. Randomizador | NÃO IMPLEMENTADO | Validar pesos e preservar decisão em retomadas. |
| 23. Horário atendimento | PARCIAL | Janela existe em follow-up; falta bloco no motor. |
| 24. Distribuição | NÃO IMPLEMENTADO | Estado transacional, distribuição igualitária. |
| 25. Inatividade | PARCIAL | Follow-up de texto existe; demais ações não. |
| 26. Palavra-chave | NÃO IMPLEMENTADO | Correspondência exata/contém com deduplicação. |
| 27. Gatilhos por chip | NÃO IMPLEMENTADO | Escopo explícito de canais no motor. |
| 28. Webhooks de saída | NÃO IMPLEMENTADO | Entrada Evolution existe; criar outbox, assinatura e retry. |
| 29. API disparar fluxo | NÃO IMPLEMENTADO | Autenticação de máquina, escopo, limites e idempotência. |
| 30. Agendamentos | PARCIAL | Texto persistente/reserva/status existentes; falta mídia. |
| 31. Legendas de mídia | NÃO IMPLEMENTADO | Integrar provider/mídia/fluxos. |
| 32. Responder mensagem | NÃO IMPLEMENTADO | UI e referência persistida ausentes. |
| 33. Timeline de sistema | NÃO IMPLEMENTADO | Ações do Inbox são apenas estado local. |
| 34. Assinatura | NÃO IMPLEMENTADO | Preferência por usuário/canal/global. |
| 35. Contatos | PARCIAL | Tabelas e tags existentes; tela e filtros demonstrativos. |
| 36. Exportar contatos | NÃO IMPLEMENTADO | CSV autorizado com filtros e prevenção de fórmulas. |
| 37. Importar contatos | NÃO IMPLEMENTADO | Botão demonstrativo; implementar prévia e validação. |
| 38. Permissões | PARCIAL | Token administrativo real; sessão humana e permissões granulares ausentes. |
| 39. Campanhas | PARCIAL | Tabelas existentes, UI demonstrativa, sem executor. |
| 40. Campanhas por tag | NÃO IMPLEMENTADO | Seleção e exclusão relacionais. |
| 41. Conversas em tempo real | NÃO IMPLEMENTADO | Inbox não recebe eventos do worker. |
| 42. Filtros de conversa | PARCIAL | Filtros locais em dados fictícios. |
| 43. Canais | PARCIAL | Tabela e configuração única; falta cadastro operacional/status. |
| 44. Reconexão | NÃO IMPLEMENTADO | Eventos chegam, sem histórico/gestão de reconexão. |
| 45. Providers | PARCIAL | Chamadas Evolution concentradas, sem contrato multiprovider. |
| 46. Templates Meta | NÃO IMPLEMENTADO | Provider Meta e credenciais não integrados. |
| 47. IA/humano | PARCIAL | Coluna humanTakeover existe; worker não consulta conversa. |
| 48. Delay humanizado | PARCIAL | Editor local tem atraso; worker não o executa. |
| 49. Biblioteca mídia | NÃO IMPLEMENTADO | Sem upload/armazenamento/autorização de arquivos. |
| 50. Documentos/PDF | NÃO IMPLEMENTADO | Inbox não renderiza documentos recebidos. |
| 51. Localização | NÃO IMPLEMENTADO | Evento não é convertido em mensagem operacional. |
| 52. Notificações | NÃO IMPLEMENTADO | Sem preferências individuais. |
| 53. Data/hora IA | NÃO IMPLEMENTADO | Contexto não injeta relógio e fuso explícitos. |
| 54. Limite de contexto | PARCIAL | 12 turnos/24h e limite de texto; sem resumo/dados do contato. |
| 55. Markdown WhatsApp | PARCIAL | Texto livre sem normalização de links. |
| 56. Dashboard por canal | NÃO IMPLEMENTADO | Métricas são demonstrativas. |
| 57. Auditoria | PARCIAL | Mutações administrativas auditadas; faltam autoria humana/workspace/eventos novos. |
| 58. Performance | PARCIAL | Índices e algumas paginações locais; falta paginação de banco e medições reais. |
| 59. Responsividade | PARCIAL | CSS responsivo existente; validar novas telas e construtor. |
| 60. Tema | NÃO IMPLEMENTADO | Sem preferência Claro/Escuro/Sistema operacional. |
| 61. Padrão visual | PARCIAL | Componentes/formulários compartilhados; manter estilo na evolução. |
| 62. Banco relacional | IMPLEMENTADO | Drizzle/PostgreSQL, FKs e índices; expandir somente entidades ausentes. |
| 63. Migrações seguras | IMPLEMENTADO | Checksum/transação; preservar arquivos aplicados. |
| 64. Testes | PARCIAL | Suíte existente cobre integrações atuais; ampliar para módulos novos. |

## Sequência e dependências

Fase 1: auditoria documentada acima. Fase 2: CRM e escopo de funis; criar guardas
de sessão real compatíveis com tabelas atuais antes de disponibilizar acesso por
usuário. Fases seguintes seguem a ordem solicitada. Integração humana exige
provisionamento seguro, não reutilizar o login de demonstração nem conceder papel
com base em um userId recebido da tela. Fases só serão marcadas concluídas após
testes e implementação efetiva. Ausência de credenciais de teste/infraestrutura
externa será registrada sem simular sucesso.

## Andamento

- Fase 1: auditoria de código concluída; ambiente de produção não auditado.
- Fase 2: implementação inicial de CRM e identidade realizada; homologação e fechamento da régua de login pendentes. Não concluída para produção.
- Fases 3–8: não implementadas nesta etapa. A matriz acima registra o estado encontrado antes das alterações, não uma alegação de entrega dessas fases.

## Alterações reais da fase 2

- `/crm`: Kanban com criação/movimentação/ganho/perda, filtros combinados e por período, paginação, receita, conversão e análise de motivos de perda com seleção para consulta. Persistência PostgreSQL, sem métricas simuladas nessa rota.
- Funis/etapas, motivos de perda (criação, edição, exclusão lógica), acesso por usuário, tags da oportunidade e histórico de fechamento. Alteração de acesso exige motivo e versão; histórico de permissões registra antes/depois.
- `/entrar`, `/perfil`, `/api/auth/passkey`: base de passkeys, sessões opacas e encerramento de sessões próprias, desativada por padrão. Papel inválido deixou de receber privilégio por índice negativo.
- As páginas e integrações anteriores foram preservadas. O Dashboard e a caixa de entrada legados ainda usam demonstração: o critério de eliminar mocks de produção não foi atingido.

Arquivos: `src/lib/crm/`, `src/lib/actions/crm.ts`, `src/lib/actions/sessoes.ts`,
`src/lib/auth/`, `src/app/crm/`, `src/app/entrar/`, `src/app/perfil/`,
`src/app/api/auth/passkey/route.ts`, `src/lib/db/schema/crm.ts`,
`src/lib/db/schema/identidade.ts`, schema ativo, `next.config.ts`,
`src/components/workspace.tsx`, `scripts/provisionar-proprietario.ts`,
`.env.example`, dependências/lockfile e testes de CRM/identidade/guardas.
Mapa completo atualizado em `docs/PROJECT_MAP.md`.

Migrações geradas e SQL revisado:

- `0003_petite_mister_fear`: quatro tabelas de identidade, com auditoria, índices e FK restrict.
- `0004_ancient_silver_sable`: sete tabelas CRM, com auditoria, precisão monetária e integridade.
- `0005_lovely_photon`: coluna aditiva details em atendeia_audit_logs. Registros existentes recebem objeto vazio; não remove ou sobrescreve histórico.

Todas foram aplicadas nos testes descartáveis PGlite e reexecutadas para verificar
idempotência. Não aplicadas ao PostgreSQL do EasyPanel. Não houve push ou deploy
dessas mudanças durante esta implementação.

## Evidência dos comandos

Verificação completa após as alterações de CRM:

```text
pnpm verificar
lint e typecheck: código de saída 0
OK — 97 arquivo(s) escaneado(s), nenhuma violacao.
OK — 28/28 checagens do check-compliance.
tests 50; pass 49; fail 0; skipped 1
Test Files 6 passed (6); Tests 12 passed (12)
Refs quebradas: 0; Sem cobertura: 0
Nenhum gap detectado. Docs alinhados ao codigo.

pnpm build
Compiled successfully in 5.8s
Finished TypeScript in 20.1s
Generating static pages (4/4)
Código de saída 0

pnpm audit --prod --audit-level high
No known vulnerabilities found
```

O teste Redis real depende de serviço local descartável e foi pulado. Provedores
nos testes são mocks; nenhuma mensagem real foi enviada. O script administrativo
de provisionamento foi verificado por tipos, mas não executado com banco real.

## Homologação e pendências

O usuário escolheu PostgreSQL de teste no EasyPanel e configuração manual pelo
Chrome. A sessão do navegador do Codex permanece desautenticada; não foi acessado
o banco nem alterada configuração remota. Aguardar identificação do projeto,
serviço PostgreSQL e URL do app de teste, sem solicitar senhas no chat.

Para preparar o app de teste: DATABASE_URL deve apontar exclusivamente ao banco
de homologação; ATENDEIA_WORKER_ENABLED=false, AI_ENABLED=false e
AUTH_LOGIN_ENABLED=false. Não reutilizar credenciais de Evolution/OpenAI/Redis
da produção. O código novo ainda precisa ser disponibilizado para esse app.

Antes de liberar autenticação em produção, concluir rotação/recuperação de
passkeys, administração completa de pessoas, auditoria de recusas de permissão,
prova de permissões append-only da conta do banco e cerimônia real com navegador.
Também falta validar o provisionamento administrativo no ambiente de destino.
Esses pontos permanecem abertos; a existência de testes passando não equivale
ao fechamento da régua `docs/seguranca-login.md`.
