# Atende Aí Farmácia — instruções para agentes IA

> Codex, Cursor, Copilot, Gemini, Claude: leia este arquivo INTEIRO antes de qualquer
> tarefa. Ele é a fonte única das regras. `CLAUDE.md` só importa este arquivo.

## Contexto

CRM de farmácia com WhatsApp, IA, catálogo, estoque por lote e pedidos transacionais. Uma instalação por farmácia, sem dados ou credenciais da base original.

## Stack (fechada — não reabrir sem ADR)

- **Linguagem**: TypeScript strict
- **Framework**: Next.js (App Router, Server Components, Server Actions). Sem API separada.
  O `proxy.ts`/`middleware.ts` **não é fronteira de segurança**: página, action e handler
  conferem sessão por conta própria.
- **ORM**: Drizzle ORM — NUNCA Prisma
- **Banco**: PostgreSQL 16 via Docker, igual em dev, teste e produção — NUNCA SQLite
- **Validação**: Zod (`strictObject`) + regex nos formatos críticos
- **UI**: Tailwind + shadcn/ui
- **Testes**: Vitest + Testing Library
- **Princípios**: SOLID — alta coesão, baixo acoplamento, regra de negócio em um lugar só

Código, comentário, documentação, UI, mensagem de erro e commit em **PT-BR**.

## Ordem de leitura

1. Este arquivo, inteiro
2. `docs/PROJECT_MAP.md` — o que já existe (gerado por `npm run map`; não edite à mão)
3. `docs/regras-negocio.md` — regras do cliente
4. `docs/adr/` — decisões já tomadas e o porquê
5. O arquivo real que você vai alterar (sempre ler antes de editar)

## Regras absolutas

### Banco de dados
1. NUNCA SQLite, em nenhum ambiente. NUNCA Prisma.
2. NUNCA delete físico: `db.delete(`, `tx.delete(`, `.deleteMany(` e `DELETE FROM` reprovam
   no auditor e no pre-commit. Exclusão é `marcaDeExclusao()` (soft delete).
3. TODA tabela tem as 5 colunas de auditoria, sempre por `...colunasAuditoria`
   (`src/lib/db/schema/_compartilhado.ts`): `created_at`, `updated_at`, `deleted_at`,
   `is_deleted`, `modified_by`. Exceção só com marcador escrito e justificado:
   `compliance:append-only` (trilha de auditoria) ou `compliance:framework` (tabela que a
   lib de auth apaga sozinha).
4. NUNCA `timestamp()` cru: todo instante é `instante()` = `timestamptz(3)`. O
   microssegundo do Postgres nunca bate com o milissegundo do `Date` e a trava de colisão
   recusaria toda edição.
5. NUNCA `$onUpdate` em `updated_at` — quem grava `updated_at` é a action.
6. TODA FK com `{ onDelete: "restrict", onUpdate: "restrict" }` explícitos. Nunca cascade.
7. Dinheiro é `dinheiro()` (numeric em modo string). NUNCA `number` para valor monetário.
8. Enum é `text` + `CHECK` com a lista em `schema/_enums.ts`. NUNCA `pgEnum`.
9. Nome de tabela hierárquico e em snake_case: `contratos` → `contratos_lancamentos` →
   `contratos_lancamentos_categorias`.
10. TODA leitura filtra `vivos(tabela)`. TODA edição e exclusão usa
    `travaDeColisao(tabela, id, updatedAtOriginal)` (optimistic locking).
11. Mudança de schema só por migração: `npm run db:generate` + revisar o SQL +
    `npm run db:migrate`. NUNCA `drizzle-kit push`. NUNCA dropar tabela ou banco.

### Código
12. Regra de negócio mora em UM lugar (`src/lib/actions/<entidade>.ts` ou
    `src/lib/<dominio>/`). A tela chama a action; não duplica lógica.
13. TODA Server Action é um POST alcançável direto: começa com `exigirSessao()` +
    `exigirPermissao()` e valida TUDO com Zod, inclusive ids.
14. NUNCA espalhar o corpo da requisição na linha (`{ ...dados }`). Campo a campo.
    Papel, dono, preço e `modified_by` vêm do servidor.
15. Papel e `ativo` são lidos do BANCO a cada requisição — nunca do token.
16. Mutação + auditoria na MESMA transação (`registrarAuditoria(tx, ...)`).
17. Action que muta devolve `Resultado` via `executar()` — erro esperado vira mensagem.
    Em produção o Next esconde a mensagem de qualquer `throw`.
18. Ação crítica na tela (excluir, salvar lançamento financeiro) passa pelo
    `ModalConfirmacaoBlock`: 3 s travado, não fecha por ESC nem clique fora.
19. NUNCA `alert()`, NUNCA `any`, NUNCA erro cru do banco na tela.
20. NUNCA commitar segredo, `.env` ou senha literal — nem em seed, README ou docs.
    Variável nova vai documentada em `.env.example`.

### Estrutura
21. NUNCA criar arquivo na raiz. Use `src/`, `tests/`, `docs/`, `config/`, `scripts/`,
    `templates/`. (Configs que a ferramenta exige na raiz são a exceção.)
22. NUNCA arquivo com mais de 500 linhas — exceto `src/components/ui/` (shadcn vendorizado,
    não se edita).
23. NUNCA `node -e "..."` ou `psql -c "..."` inline no PowerShell com parêntese ou aspas: o
    shell cria na raiz arquivos com o nome do fragmento. Escreva um `.mjs` em `scripts/`.
    Limpeza: `npm run lixo` (simulação) e `node scripts/limpar-lixo-raiz.mjs --aplicar`.
24. NUNCA criar documentação sem pedido. MAS regra de negócio nova vai para
    `docs/regras-negocio.md` e decisão de arquitetura vira ADR em `docs/adr/`.
25. Quando mudar uma regra, mude no código, neste arquivo e no auditor juntos.

## Onde as coisas moram

| O quê | Onde |
| :--- | :--- |
| Conexão única com o banco | `src/lib/db/index.ts` (`db`, tipo `Transacao`) |
| Helpers de coluna | `src/lib/db/schema/_compartilhado.ts` (`instante`, `dinheiro`, `colunasAuditoria`) |
| Enums | `src/lib/db/schema/_enums.ts` (`PAPEIS`, `listaSql`) |
| Tabelas | `src/lib/db/schema/<tabela>.ts`, reexportadas em `schema/index.ts` |
| Soft delete e trava | `src/lib/db/soft-delete.ts` (`vivos`, `travaDeColisao`, `marcaDeExclusao`) |
| Trilha de auditoria | `src/lib/audit/registrar.ts` + tabela `auditoria` (append-only) |
| Sessão | `src/lib/auth/sessao.ts` (`obterSessao`, `exigirSessao`) — conectar a lib de auth |
| Permissão | `src/lib/auth/permissoes.ts` (`temPermissao`, `exigirPermissao`) — matriz em `docs/rbac.md` |
| Resultado de action | `src/lib/acao.ts` (`executar`, `ErroDeNegocio`, `Resultado`) |
| Validadores | `src/lib/validators/<entidade>.ts` |
| Actions | `src/lib/actions/<entidade>.ts` |
| Telas | `src/app/(app)/<rota>/page.tsx` + `_components/` |
| Modal de confirmação | `src/components/modal-confirmacao-block.tsx` |
| Arquivos-ouro | `templates/` (schema, validator, server-action, component, component.test) |
| Skills | `.agents/skills/` (`criar-tabela`, `criar-crud`, `criar-componente`, `repo-docs-sync`, `remove-ai-marks`) |

## Fluxo — funcionalidade nova

1. `npm run map` e leia `docs/PROJECT_MAP.md`: já existe algo parecido?
2. Construa de baixo para cima, copiando o arquivo-ouro de `templates/`:
   tabela (`criar-tabela`) → validador → action (`criar-crud`) → tela (`criar-componente`).
3. Escreva o teste junto — o caminho crítico (bloqueio, permissão, colisão) tem teste.
4. Regra nova em `docs/regras-negocio.md`; decisão nova em `docs/adr/`.
5. `npm run verificar` e `npm run build`. Reporte a saída REAL dos comandos.

## Fluxo — correção de bug

1. Reproduza e leia o estado antes de editar. Confira a trilha (`auditoria`): quem, o quê, quando.
2. Localize a camada: registro "sumiu" → a consulta usa `vivos()`? Edição sobrescreveu
   outra → o `updated_at` original chegou na action? Acesso indevido → `exigirPermissao`
   com o papel certo? Autoria errada → `modified_by` veio da sessão?
3. Corrija a CAUSA: procure todos os chamadores da função e corrija no ponto compartilhado.
4. Escreva o teste que falharia com o bug vivo; depois corrija.
5. `npm run verificar`. Reporte: sintoma × causa, arquivos alterados, saída dos comandos.

## Comandos

```bash
npm run db:up          # sobe o Postgres local (Docker)
npm run db:generate    # gera migração a partir do schema
npm run db:migrate     # aplica migrações
npm run dev            # app local
npm run verificar      # lint + tipos + auditor + trava + testes + drift de docs
npm run build          # build de produção
npm run compliance     # só o auditor
npm run map            # regenera docs/PROJECT_MAP.md
npm run lixo           # lista arquivos-lixo na raiz (simulação)
```

## Git

- `develop` recebe o trabalho (deploy HML); `master` só por merge validado (deploy PRD).
  NUNCA commitar direto na `master`.
- Por solicitação do proprietário, ao concluir e validar alterações neste projeto,
  faça commit e push automaticamente para `develop`, sem pedir nova confirmação.
  Confira a validação do GitHub. A implantação no servidor permanece manual.
- Conventional Commits em PT-BR (`docs/git-commits.md`), sem rodapé de coautoria.
- O pre-commit (`.githooks/pre-commit`) roda o auditor e bloqueia `.env`. Não use
  `--no-verify`. O CI roda tudo de novo.
- NUNCA deploy em PRD sem backup do banco (o pipeline já exige).

## Antes de dizer "pronto"

Rode `docs/definition-of-done.md`. No mínimo:

- [ ] `npm run verificar` verde e `npm run build` passando — com a saída colada no relatório
- [ ] Tabela nova com `...colunasAuditoria`, `instante()`, FK restrict, migração revisada
- [ ] Leitura com `vivos()`; edição e exclusão com `travaDeColisao()`
- [ ] Action com sessão, permissão, Zod, transação e auditoria
- [ ] Ação crítica com `ModalConfirmacaoBlock`
- [ ] Regra de negócio documentada; nenhum segredo exposto

Tarefa que toca login ou conta: siga também `docs/seguranca-login.md`.


## Escopo da farmácia

Compositor compacto mantém Documento (PDF/DOCX), Fotos e vídeos (JPG/PNG/WebP, MP4/WebM) e Áudio no menu +, até 2 MB por arquivo. Emojis inserem no cursor. Microfone cede lugar ao envio quando há conteúdo. Ações de assumir/devolver ficam recolhidas; confirmações desaparecem após quatro segundos e erros permanecem para conferência. Documentos e vídeos usam o mesmo contrato validado, reserva e auditoria da mídia manual.

Envio humano valida somente credenciais Evolution e a instância vinculada, sem exigir IA. Exige sessão, operador ativo e conversa assumida pelo autor. Texto, imagem e áudio compartilham reserva de envio e proteção contra entrega incerta. Mídia até 2 MB é validada por tipo e assinatura, sem URL remota ou armazenamento binário no CRM; histórico guarda marcador/legenda. Gravação exige permissão do microfone da própria origem, para em 60 segundos e oferece prévia antes do envio; libera a captura ao sair. Diagnóstico de canal não envia mensagem nem expõe credenciais.

Dashboard filtra atividade comercial por Hoje, Ontem, 7, 15, 30 dias ou intervalo de até 366 dias, com início inclusivo e fim exclusivo após o último dia em Brasília. Pedidos e pendentes usam criação; vendas, faturamento e ranking usam confirmação; IA usa envio e consultas usam criação. Estoque sempre representa o saldo atual. Servidor valida as datas e a tela descarta respostas de filtros anteriores.

Conversas usam componente compartilhável em duas colunas, com lista, foto ou iniciais, histórico e resposta por actions autenticadas. No celular, lista e conversa alternam com botão de voltar. Contatos exibem até 150 registros recentes, sem limitar o cadastro ou ocultar o total. Fotos HTTPS recebidas em eventos autenticados da Evolution atualizam apenas contatos vivos vinculados à instância, com versão e auditoria; cadastro inicial sem foto não apaga imagem existente. LID requer telefone alternativo explícito. Se a foto faltar ou expirar, o Farma consulta o perfil pelo chip e pelo telefone da conversa, com operador autenticado e vínculo vivo. A rota usa ID interno e redireciona somente a CDN HTTPS autorizada, sem baixar imagem, revelar chave ou criar contato. Sem foto acessível, mostra iniciais.

Caixa de entrada ocupa a área abaixo do cabeçalho único, com compositor compacto. Menu de três pontos no cabeçalho permite a gestores apagar somente a conversa selecionada, por confirmação bloqueada de três segundos, versão do schema ativo, exclusão lógica e auditoria transacional. Contatos, mensagens e pedidos são preservados; isso não recolhe mensagens do WhatsApp nem interrompe envio já iniciado. Reserva humana em envio bloqueia exclusão. Eventos antigos, ecos de saída e jobs de IA/follow-up anteriores à exclusão não reabrem atendimento; nova mensagem recebida posterior pode iniciar outra conversa. Consultas históricas de tombstones são restritas à deduplicação e a esse bloqueio.

Contatos têm menu de três pontos com Excluir contato para gestores. Exige confirmação bloqueada de três segundos, versão do schema ativo, autor ativo e auditoria na mesma transação da exclusão lógica. Arquiva logicamente os atendimentos vivos, preservando mensagens, pedidos e eventos; envio humano iniciado impede a exclusão inteira. Recebimento e exclusão compartilham trava por telefone, tomada em ordem nos lotes. Replay e eventos anteriores à exclusão são descartados antes de criar contatos. Mensagem posterior pode criar novo contato e novo atendimento, sem transferir elegibilidade de campanha do cadastro antigo. Agendamentos individuais independentes e pedidos não são cancelados.

Pedido no WhatsApp não expõe número interno ou prazo de reserva. Confirma itens, pergunta acréscimos e só depois pergunta pagamento em balão separado. Acréscimos atualizam o mesmo pedido, revalidam preços/saldo, liberam reserva anterior e exigem nova confirmação. Preferência Pix/dinheiro/cartão e troco são eventos auditados do pedido; não confirmam pagamento, venda ou baixa. Pix real usa apenas FARMACIA_PIX_CHAVE. Sem chave, envia 99999999 explicitamente fictícia, com valor e comprovante simulados e instrução para não transferir. Pedidos explícitos pela chave, inclusive “kd a chave Pix”, usam a etapa real do pedido. Dinheiro e cartão são combinados para entrega, com troco e maquininha registrados.

O cabeçalho da conversa mostra o estado da IA consultado no servidor. Considera atendimento humano no PostgreSQL, configuração do chip, sinal do processador e pausa do Redis. Falha na leitura não indica IA ativa. Nenhum JID interno, ID de atendente ou dado de configuração é exposto para exibir o selo.

Os três pontos do compositor permitem a operadores pausar/despausar a IA da conversa com autorização atual, versão e auditoria transacional. Pausa do painel persiste no PostgreSQL e bloqueia respostas e follow-ups. Despausar ignora pausas Redis geradas antes da retomada, inclusive por LID, e preserva o responsável humano. Uma nova saída manual pode pausar novamente. Mensagens arquivadas durante a pausa não são repetidas. Solicitações explícitas de chave Pix recebem resposta de fluxo; sem pedido elegível, só exibem a chave de demonstração quando falta chave real.

Consultas nunca alteram o pedido. A IA só pode gravar item quando a mensagem atual identifica o produto e a quantidade sem ambiguidade. Quantidade informada ajusta o item no pedido aberto, e só solicitação explícita de acréscimo soma. Recusar o resumo registra revisão e bloqueia reserva automática até corrigir o pedido. A correção conserva o pedido, recalcula o total, libera reserva antiga e pede nova confirmação.

Escolha nominal de produto já identificado reaproveita o resumo do pedido da própria conversa. Repetir produto ou quantidade de pedido pago apenas consulta itens, valores e andamento. Nova escolha inequívoca sem quantidade informa o preço atual e pede só quantas embalagens; resposta curta usa a última oferta com pergunta explícita de quantidade e uma única apresentação reconhecível. Balão “Pedido registrado” exige commit prévio. A lista visível de Pedidos atualiza com intervalo de três segundos após cada consulta, sem sobrepor consultas automáticas, e ao voltar à aba, preservando os filtros.

No pagamento de um pedido, Pix envia chave, total do banco e pedido de comprovante em três balões. Cartão avisa sobre maquininha e preparação. Dinheiro pede troco e valor quando necessário; a confirmação gera aviso interno na Caixa de entrada enquanto o pagamento está pendente. Na etapa de entrega, o agente consulta o endereço já gravado no pedido da própria conversa. Pede endereço somente se faltar e, depois dele, pede o nome de quem receberá o remédio. Trocas de forma de pagamento preservam esses dados e apenas a próxima informação pendente é pedida. Endereço, nome do destinatário e recebimento de comprovante são eventos auditados do pedido e não alteram cadastro do contato nem saldo.

Em Pedidos, a coluna Pagamento deriva a forma e a situação dos eventos auditados. O webhook vincula imagem ou documento recebido ao Pix do único pedido elegível da conversa na mesma transação da mensagem, inclusive com IA pausada. O comprovante da etapa atual marca “Pago” automaticamente, mantém o pedido em andamento e bloqueia alterações de forma ou itens. É um registro baseado no comprovante, sem integração bancária nem etapa de confirmação de Pix pelo gerente. Para Pix, cartão e dinheiro, a baixa e a conclusão acontecem juntas na confirmação humana da entrega. Cartão e dinheiro exigem registro do recebimento. A confirmação usa versão do pedido, preserva conferência farmacêutica e recompõe reserva vencida somente se houver saldo elegível pelo preço do pedido. Pedidos legados sem forma registrada mantêm o fluxo anterior.

Pedido explícito de maquininha na etapa de pagamento equivale a cartão na entrega. Se cartão já foi registrado, a resposta só informa a preferência gravada. Com a entrega registrada, “ok” e “só quero esse mesmo” não reabrem itens nem revalidam reserva. Só alterações efetivas de itens invalidam a finalização anterior. Tentativa real de concluir ou mudar pagamento sem reserva válida orienta a equipe a conferir o estoque e mantém os dados do pedido.

O aviso de que a equipe vai dar continuidade ao pedido encaminha a conversa assim que o WhatsApp aceita o último balão. A gravação da resposta, a pausa persistente e a auditoria usam a mesma transação e a conversa da mensagem de origem. A fila humana sinaliza a conversa pendente, preservando o setor e um eventual responsável. O worker cancela o follow-up e não agenda outro para esse envio. Falhas após a aceitação retomam o registro sem reenvio nem nova pausa depois da devolução à IA. A entrega, o pedido e a baixa continuam nos fluxos existentes.

Página Pedidos filtra busca e criação no servidor, em Brasília, antes da paginação. Indicadores são reais para busca/período e independem do filtro de status da tabela; em andamento reúne etapas diferentes de concluído/cancelado. Nenhum crescimento é simulado. Detalhes e ações preservados; contrato legado sem período permanece completo. Identificação histórica de contatos excluídos é conservada nos pedidos, e a tela ignora respostas antigas de filtros.

Instalação isolada por farmácia. Reutilizar o schema ativo e a conexão postgres-js, não os modelos de referência de usuários/auditoria. Regras clínicas e comerciais de outros projetos não se aplicam. Histórico de migrações herdado é imutável; não importar dados, prompts ou credenciais da aplicação original. Novos módulos usam src/lib/farmacia. Valores e disponibilidade vêm do PostgreSQL; somente humano autorizado confirma a venda; somente farmacêutico habilitado confere receitas. Toda mutação de estoque toma a trava transacional antes das linhas. Movimentações e eventos são históricos e não podem ser removidos pela aplicação.

Consulte docs/adr/0014-farmacia.md e docs/regras-negocio.md. PostgreSQL 16 real é obrigatório para teste de concorrência; PGlite é apenas validação complementar.

O interpretador da farmácia deve receber o prompt salvo do chatbot da instância e manter o contrato de operações estritas: uma chamada de atender_farmacia, sem SQL ou resposta comercial livre. O modelo de prompt Atende Aí Pharma só é carregado por ação explícita e não substitui automaticamente configurações existentes. Preço e disponibilidade de cada resposta vêm da consulta atual ao PostgreSQL. Atendimento se identifica como Farmácia WE, preserva a persona e desativa pergunta de nome e aberturas antigas em tempo de execução, sem regravar o chatbot. A extração de nomes espontâneos continua ativa.

Respostas confirmadas da IA são registradas com texto e ID em transação auditada, sem depender do eco da Evolution; a identidade da mensagem recebida fixa a conversa de origem, sem transferir resposta tardia para outro atendimento. Repetição não duplica nem reabre atendimento excluído/encerrado. Áudios recebidos e enviados usam player nativo sem reprodução automática. Rota autenticada revalida operador ativo e registros vivos, recupera por ID na instância configurada, limita a 10 MB e valida MIME, assinatura e base64. Não aceita URL da mídia, não expõe credenciais, não armazena binário e não permite cache; exclusão ou revogação durante a recuperação impede a reprodução. Mídia expirada informa indisponibilidade, sem reenvio.

Cadastro rápido mantém os detalhes opcionais recolhidos e gera SKU se vazio. Importação Excel cadastra somente novos produtos, até 200 linhas por arquivo de 2 MB, com prévia e confirmação bloqueada por três segundos. Exige classificação de receita explícita, lote e validade quando aplicável. Validação, autorização, trava de estoque, gravação e auditoria compartilham uma única transação; erro desfaz todo o arquivo e repetição da mesma confirmação não duplica saldo. Não atualiza cadastro existente nem importa fórmulas.

Estoque sempre em A–Z pelo nome normalizado, sem distinguir caixa ou acentos portugueses. Ordenação no PostgreSQL antes da paginação, com concentração, apresentação, SKU e ID como desempates estáveis. Nenhum parâmetro de quantidade ou sequência de cadastro pode sobrepor a ordem alfabética; a tela informa essa ordem fixa.

Painel do estoque usa contadores globais atuais e variação líquida diária de movimentos auditados em Brasília (7/15/30 dias), sem saldo histórico ou percentuais simulados. Recomendações filtram a lista, sem mutações. Paginação permite 10/20/40, mantendo 40 no contrato legado. Lixeira visual é Inativar: confirmação bloqueada e edição existente, com versão, autorização e auditoria, preservando cadastro e histórico.

Oferta no WhatsApp consulta primeiro as apresentações disponíveis, antes da paginação, e só registra no contexto as opções efetivamente oferecidas. Consulta específica não troca concentração ou apresentação; números de uma consulta composta não podem coincidir com trechos de SKU/EAN para simular a apresentação solicitada. Oferta informa identificação e preço, sem lotes nem saldo interno; CTA é um segundo balão validado pelo processador, com checkpoint, registro de ID e verificação de pausa por parte. Sem disponibilidade, não oferece compra nem revela preço de cadastro inativo ou sem saldo.

Consultas de produto enviam “Um momento, vou consultar o estoque.”, aguardam no mínimo 15 segundos em checkpoint persistente, enviam “Consultando…” e consultam o PostgreSQL atual. Não ocupam a lease com sleep nem bloqueiam outros contatos. Sem cadastro ou saldo, não enviam mais mensagens ao cliente: encaminham silenciosamente à fila humana, com notificação interna na caixa, auditoria e pausa persistente até devolução à IA. O atendente confere e responde sobre a disponibilidade. Avisos de indisponibilidade pendentes de versões anteriores também são descartados antes do envio. Não dependem do aviso de transferência genérico. Cada balão respeita pausa/exclusão, registra ID e nunca repete entrega incerta; falha de banco não vira falta de estoque.

Consultas adicionais após oferta reconhecida no histórico ou com pedido aberto enviam só “Consultando…”, sem repetir aviso nem espera inicial. Se o item faltar, informam a indisponibilidade e perguntam “Gostaria de consultar outro produto?” em balões separados, sem citar medicamentos do histórico ou do pedido. Se o cliente confirmar sem nomear o produto, a IA pergunta qual deseja consultar. Sugestões antigas pendentes são substituídas antes do envio. O fluxo curto não altera o pedido nem pausa a IA. Sem referência de continuidade, permanece o encaminhamento humano silencioso.

Campanhas só selecionam números com mensagem recebida no chip escolhido, correlacionando telefone exato da conversa e contato vivo. Telefone é fixado no destinatário e revalidado antes de cada parte enviada; editar cadastro não transfere autorização. Rascunho não envia; início exige confirmação. Anexos JPG/PNG, MP3/OGG e PDF até 2 MB validam assinatura. Fila PostgreSQL tem versões, auditoria, trava por chip e intervalo configurável de 5 a 3.600 segundos por campanha (padrão 10). Reservas históricas, inclusive na lixeira, mantêm a espera do chip sem expor conteúdo; entrega incerta nunca é reenviada automaticamente. Cancelar não interrompe reservas iniciadas. Acesso administrativo somente.

Central unifica individuais existentes, campanhas iniciadas e jobs reais de follow-up, sem inventar etapas futuras. Horários de campanhas são previsões. Cancelamento/lixeira alteram a fila real, destinatário individual não afeta os demais e cancelar follow-up encerra o ciclo atual. Restauração é só visual, sem reativar envio. Seleção de todos considera todo o filtro e confirma quantidade elegível; operações divididas em até 5.000 registros informam falhas parciais e resultados sem confirmação. Consulta de lixeira inclui removidos explicitamente, sem mudar os processadores. Redis usa a trava do agente, CAS e Lua para remover job/fila, arquivar e auditar atomicamente; intenção SQL é separada conforme ADR 0017. Arquivo/auditoria não expiram. Redis indisponível sinaliza lista parcial e impede operações sobre todo o filtro. Testes não disparam para contatos reais.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
