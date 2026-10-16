# Instalação da estrutura base no Atende AI

Data: 16/09/2026. Branch de trabalho: `develop`.
Fonte: arquivo ESTRUTURA-BASE-CODEX.md fornecido pelo usuário.

## Resultado

A base de ferramentas foi instalada. Após autorização do usuário, os falsos
positivos do auditor e os dois erros de lint foram corrigidos. As evidências da
primeira instalação abaixo são históricas; a revisão atual está ao final.
Nenhum deploy, migração de produção ou alteração de credenciais foi feito.

## Arquivos instalados

- AGENTS.md e CLAUDE.md: regras locais para agentes.
- Cinco skills em `.agents/skills/`: criar-tabela, criar-crud, criar-componente,
  repo-docs-sync e remove-ai-marks.
- Cinco modelos em `templates/`, excluídos do typecheck.
- Auditor, 24 testes do auditor, hook de pre-commit, mapa do projeto, verificador
  de documentação, verificador de caracteres invisíveis e ferramenta de quarentena.
- Configuração Vitest e Testing Library, ESLint e componentes oficiais shadcn Button
  e AlertDialog. Modal de confirmação com teste do bloqueio de três segundos.
- Helpers de actions, sessão fechada, RBAC, auditoria, soft delete e schema de referência.
- Docker Compose PostgreSQL 16 local; configuração Drizzle de compatibilidade.
- CI em `.github/workflows/deploy.yml` e checklist de pull request. Deploy continua
  no EasyPanel, sem instalar o fluxo SSH/PM2 do exemplo.
- Documentação da base em docs, ADR de compatibilidade e PROJECT_MAP gerado.

O inventário por arquivo está em `docs/instalacao-base-manifesto.json`. Os estados
desse inventário são da extração inicial; os adaptadores de conexão, Drizzle e CI
foram concluídos depois e estão descritos no ADR-0002.

## Mesclas feitas

- package.json/pnpm-lock.yaml: dependências faltantes, Node 24 e comandos da base.
- Testes anteriores preservados em `test:node`; componentes em `test:ui`.
- tsconfig.json: templates excluídos. .gitignore: quarentena excluída.
- Dockerfile: copia o script prepare antes de instalar dependências.
- Layout: importa apenas os utilitários de UI, sem reset dos estilos existentes.
- AGENTS.md: contexto Atende AI e registro da adoção gradual.

Os arquivos `.env`, `.env.example` e `docs/regras-negocio.md` existentes foram
preservados na instalação inicial. Na revisão autorizada, `.env.example` recebeu
somente as variáveis do Docker Compose, com senha vazia. Nenhuma credencial local
foi inventada ou substituída.

## Evidências reais dos comandos

### Auditor

```text
Escaneados: 43 | Erros: 15 | Avisos: 0
```

As 15 ocorrências são `tabela-sem-auditoria` em src/lib/db/schema.ts. O auditor
reconhece objetos espalhados, mas não os helpers funcionais timestamps()/audit()
do schema anterior. Os testes PostgreSQL existentes verificam que as colunas estão
presentes. O relatório é mantido sem isenções artificiais.

Tabelas apontadas: atendeia_users, atendeia_sessions, atendeia_departments,
atendeia_department_members, atendeia_contacts, atendeia_tags, atendeia_contact_tags,
atendeia_chatbots, atendeia_flows, atendeia_channels, atendeia_conversations,
atendeia_messages, atendeia_campaigns, atendeia_campaign_recipients, atendeia_audit_logs.

### Trava do auditor

```text
OK — 24/24 checagens do check-compliance.
```

### Lint

```text
src/components/chatbots/page.tsx:17:52  react-hooks/set-state-in-effect
src/components/settings.tsx:22:21      react-hooks/set-state-in-effect
✖ 2 problems (2 errors, 0 warnings)
```

São ocorrências anteriores à instalação. Não foram corrigidas nem suprimidas,
conforme a Parte 5. A correção é uma tarefa separada.

### Typecheck e testes

```text
typecheck: 0
ℹ tests 21
ℹ pass 21
ℹ fail 0
Test Files  1 passed (1)
Tests  1 passed (1)
```

Os testes Node continuam cobrindo configurações, criptografia, webhook e migrações.
O teste novo Vitest cobre o bloqueio de três segundos e ESC no modal.

### Build

```text
✓ Compiled successfully in 23.9s
Finished TypeScript in 14.1s
✓ Generating static pages using 3 workers (3/3) in 524ms
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/settings/integrations
└ ƒ /api/webhooks/evolution
```

### Documentação, marcas e hooks

```text
Mapa escrito em docs/PROJECT_MAP.md
staleRefs: 0
OK — 14 arquivo(s), nenhuma marca invisivel.
git config core.hooksPath: .githooks
[guard] Commit bloqueado pelo auditor. Corrija as violacoes acima.
```

`git hook run pre-commit` retornou 1 pelos 15 apontamentos, comprovando que o hook
está ativo. Nenhum commit foi criado, nenhum hook foi ignorado e não houve push.
As saídas completas de lint, auditor e hook estão em tests/artifacts/estrutura-base
(pasta ignorada pelo Git).

### Banco local

```text
docker: ENOENT
```

Docker não está disponível nesta máquina. DATABASE_URL local continua vazia,
conforme a execução anterior de db:migrate. Não foi possível subir PostgreSQL 16
local nem testar migração nele. O schema de referência usuarios/auditoria da base
não foi misturado ao histórico ativo; exige plano de consolidação.

## Limitações da instalação inicial

1. Decidir a mesclagem de variáveis locais e regras de negócio sem substituir valores reais.
2. Consolidar o schema legado com os helpers da base e revisar qualquer nova migração.
3. Corrigir as duas ocorrências de lint do legado e repetir a verificação completa.
4. Disponibilizar Docker/PostgreSQL 16 local com credenciais próprias.
5. Integrar autenticação real posteriormente; a sessão fornecida pela base retorna null.
6. Commit apenas após auditor e verificações aprovados. Proteções de branch e backup
   de produção precisam ser configurados no ambiente de hospedagem.

## Revisão autorizada: correções e publicação em develop

O usuário solicitou corrigir as pendências e fazer push. O auditor agora analisa
fábricas locais de colunas por AST, sem executar o schema e sem isentar tabelas.
Os testes rejeitam helpers incompletos, desconhecidos e strings que simulam colunas.
Nenhuma tabela ou migração foi alterada para corrigir esses falsos positivos.

Chatbots carregam o estado persistido depois da hidratação, com inicializador de
estado, preservando o prompt editado e os erros de dados corrompidos. Configurações
derivam a URL do webhook da origem do navegador. Não houve supressão de lint.

Docker Compose exige DB_PASSWORD explícita, usa porta somente em 127.0.0.1 e suas
variáveis estão documentadas no exemplo de ambiente. O .env real foi preservado.

Saída real da revisão:

```text
pnpm verificar: exit 0
lint: exit 0
typecheck: exit 0
OK — 44 arquivo(s) escaneado(s), nenhuma violacao.
OK — 28/28 checagens do check-compliance.
Node: tests 21, pass 21, fail 0
Vitest: Test Files 2 passed (2), Tests 4 passed (4)
docs:check: refs quebradas 0, sem cobertura 0
ai-marks: 15 arquivo(s), nenhuma marca invisivel
pnpm build: exit 0
Compiled successfully in 11.3s
Finished TypeScript in 23.3s
Generating static pages using 3 workers (3/3) in 663ms
```

A publicação desta revisão é na branch develop. Produção/main não é promovida
por esse push. Docker/PostgreSQL local continuam indisponíveis para teste real;
as migrações foram verificadas pela suíte PGlite existente. Autenticação humana e
processamento da fila de IA seguem fora do escopo desta correção da estrutura.
