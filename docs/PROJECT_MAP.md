# Mapa do Projeto

> Gerado por `scripts/project-map.mjs`. Leia este resumo antes de explorar arquivos.

## Resumo

| Metrica | Total |
|---------|-------|
| Arquivos TS/TSX | 190 |
| Tabelas (Drizzle) | 43 |
| Server Actions (arquivos) | 14 |
| Rotas de API | 7 |
| Paginas | 5 |
| Componentes | 30 |

## Arvore (profundidade 3)

```
app/
  (app)/
  api/
    auth/
    farmacia/
    settings/
    webhooks/
  crm/
    _components/
    error.tsx
    loading.tsx
    page.tsx
  entrar/
    _components/
    page.tsx
  perfil/
    _components/
    page.tsx
  previa-design/
    _components/
    page.test.tsx
    page.tsx
  error.tsx
  icon.svg
  layout.tsx
  page.tsx
components/
  agendamentos/
    page.tsx
  assinatura/
    page.tsx
  chatbots/
    editor.tsx
    page.tsx
  consultas/
    paciente-form.tsx
    page.tsx
  farmacia/
    atendimento.tsx
    comum.tsx
    dashboard.tsx
    estoque.tsx
    importar-produtos.tsx
    pedido-form.tsx
    pedidos.tsx
    produto-form.tsx
  followups/
    page.tsx
  operacao/
    page.tsx
    painel.tsx
    proximas-consultas.tsx
    resumo-clinica.tsx
  tags/
    page.tsx
  ui/
    alert-dialog.tsx
    button.tsx
  usuarios/
    page.tsx
  agent-settings.tsx
  conta-menu.tsx
  marca.tsx
  modal-confirmacao-block.tsx
  painel-shell.tsx
  settings.tsx
  workspace.tsx
lib/
  actions/
    agendamentos.ts
    atendimento-farmacia.ts
    chatbots.ts
    consultas.ts
    crm.ts
    farmacia.ts
    followups.ts
    operacao.ts
    painel.ts
    perfil.ts
    seguranca.ts
    sessoes.ts
    tags.ts
    usuarios.ts
  agendamentos/
    repository.ts
    schema.ts
    worker.ts
  agent/
    audio.ts
    config.ts
    espera.ts
    message.ts
    nome.ts
    pausa.ts
    processor.ts
    providers.ts
    redis.ts
    store.ts
    worker.ts
  audit/
    registrar.ts
  auth/
    acesso-http.ts
    contexto.ts
    cookies.ts
    desafios.ts
    login-senha.ts
    origem-http.ts
    papeis.ts
    passkeys-perfil.ts
    passkeys.ts
    permissoes.ts
    provisionamento-proprietario.ts
    repositorio.ts
    rotas-painel.ts
    senhas.ts
    sessao.ts
    trocar-senha.ts
    usuarios.ts
    validacao.ts
  chatbots/
    defaults.ts
    instancias.ts
    prompt-servidor.ts
    repository.ts
    schema.ts
    server-repository.ts
  consultas/
    calendario.ts
    coleta.ts
    escolha.ts
    extracao.ts
    fluxo-servidor.ts
    fluxo.ts
    intencao.ts
    linguagem.ts
    repository.ts
    resumo.ts
    schema.ts
  crm/
    acesso.ts
    cadastros.ts
    consultas.ts
    oportunidades.ts
    validacao.ts
  db/
    migrations/
    schema/
    bootstrap.ts
    client.ts
    diagnostico.ts
    index.ts
    migrate.ts
    porta.ts
    schema.ts
    soft-delete.ts
  demo/
    data.ts
    icons.ts
    views.ts
  evolution/
    configurar-webhook.ts
    instancias.ts
    queue.ts
    schema.ts
    webhook.ts
  farmacia/
    agente.ts
    atendimento.ts
    cadastro.ts
    catalogo.ts
    comum.ts
    consultas.ts
    crm.ts
    importacao-validacao.ts
    importacao.ts
    interpretar.ts
    pedidos.ts
    planilha.ts
    prompt.ts
    transacoes.ts
    validacao.ts
  followups/
    processor.ts
    queue.ts
    schedule.ts
    schema.ts
  operacao/
    atribuir-ia.ts
    consultas.ts
    evento.ts
    painel.ts
    receber.ts
    transferir.ts
  perfil/
    servico.ts
  settings/
    access.ts
    repository.ts
    schema.ts
    security.ts
  tags/
    repository.ts
    schema.ts
  validators/
    perfil.ts
  acao.ts
  use-hydrated.ts
  utils.ts
styles/
  automation.css
  base.css
  conta-menu.css
  design-juliana.css
  farmacia.css
  features.css
  improvements.css
  layout.css
  marca.css
  painel-operacional.css
  perfil.css
  ui.css
instrumentation.ts
```

## Tabelas (Drizzle)

### `atendeia_agenda_horarios` — src/lib/db/schema/agenda-consultas.ts
`id`, `inicio`, `modified_by`

### `atendeia_agenda_horarios_reservas` — src/lib/db/schema/agenda-consultas.ts
`id`, `horarioId`, `identidade`, `nomeCompleto`, `cep`, `bairro`, `status`, `modified_by`

### `auditoria` — src/lib/db/schema/auditoria.ts
`id`, `user_id`, `acao`, `tabela`, `registro_id`, `detalhes`, `dados_anteriores`, `dados_novos`, `created_at`

### `atendeia_funis` — src/lib/db/schema/crm.ts
`id`, `modified_by`

### `atendeia_funis_etapas` — src/lib/db/schema/crm.ts
`id`, `nome`, `modified_by`

### `atendeia_funis_acessos` — src/lib/db/schema/crm.ts
`id`, `usuarioId`, `modified_by`

### `atendeia_motivos_perda` — src/lib/db/schema/crm.ts
`id`, `modified_by`

### `atendeia_funis_oportunidades` — src/lib/db/schema/crm.ts
`id`, `funilId`, `etapaId`, `contatoId`, `canalId`, `responsavelId`, `status`, `motivoId`, `observacao`, `modified_by`

### `atendeia_funis_oportunidades_tags` — src/lib/db/schema/crm.ts
`id`, `tagId`, `modified_by`

### `atendeia_funis_oportunidades_fechamentos` — src/lib/db/schema/crm.ts
`id`, `funilId`, `etapaAnteriorId`, `responsavelId`, `valor`, `modified_by`

### `atendeia_produtos` — src/lib/db/schema/farmacia.ts
`id`, `generico`, `concentracao`, `ean`, `minimo`, `ativo`, `observacoes`

### `atendeia_produtos_lotes` — src/lib/db/schema/farmacia.ts
`id`, `codigo`, `bloqueado`

### `atendeia_pedidos` — src/lib/db/schema/farmacia.ts
`id`, `contatoId`, `conversaId`, `responsavelId`, `status`, `chave`, `conferidoPor`, `conferencia`, `oportunidadeId`

### `atendeia_pedidos_itens` — src/lib/db/schema/farmacia.ts
`id`, `produtoId`, `quantidade`

### `atendeia_pedidos_reservas` — src/lib/db/schema/farmacia.ts
`id`, `loteId`, `quantidade`

### `atendeia_produtos_movimentos` — src/lib/db/schema/farmacia.ts
`id`, `pedidoId`, `quantidade`, `tipo`

### `atendeia_pedidos_eventos` — src/lib/db/schema/farmacia.ts
`id`, `tipo`

### `atendeia_farmaceuticos` — src/lib/db/schema/farmacia.ts
`id`, `registro`

### `atendeia_produtos_consultas` — src/lib/db/schema/farmacia.ts
`id`, `produtoId`, `termo`

### `atendeia_atendimento_envios` — src/lib/db/schema/farmacia.ts
`id`, `chave`

### `atendeia_users_passkeys` — src/lib/db/schema/identidade.ts
`id`, `credencialId`, `nome`

### `atendeia_users_convites` — src/lib/db/schema/identidade.ts
`id`, `tokenHash`

### `atendeia_auth_desafios` — src/lib/db/schema/identidade.ts
`id`, `finalidade`, `conviteId`, `expiraEm`

### `atendeia_auth_limites` — src/lib/db/schema/identidade.ts
`id`, `tentativas`

### `usuarios` — src/lib/db/schema/usuarios.ts
`id`, `nome`, `email`, `papel`, `ativo`

### `atendeia_users` — src/lib/db/schema.ts
`id`, `phone`, `passwordHash`, `enabled`

### `atendeia_webhook_recebimentos` — src/lib/db/schema.ts
`id`, `modified_by`

### `atendeia_agendamentos` — src/lib/db/schema.ts
`id`, `agendadoPara`, `iniciadoEm`, `codigoErro`, `modified_by`

### `atendeia_sessions` — src/lib/db/schema.ts
`id`, `tokenHash`

### `atendeia_departments` — src/lib/db/schema.ts
_(colunas nao detectadas)_

### `atendeia_department_members` — src/lib/db/schema.ts
`id`, `userId`

### `atendeia_contacts` — src/lib/db/schema.ts
`id`, `source`, `score`

### `atendeia_tags` — src/lib/db/schema.ts
_(colunas nao detectadas)_

### `atendeia_contact_tags` — src/lib/db/schema.ts
`id`, `tagId`

### `atendeia_chatbots` — src/lib/db/schema.ts
`id`, `configuration`

### `atendeia_flows` — src/lib/db/schema.ts
`id`, `name`, `definition`

### `atendeia_channels` — src/lib/db/schema.ts
`id`, `instanceName`, `status`

### `atendeia_conversations` — src/lib/db/schema.ts
`id`, `contactId`, `remoteJid`, `departmentId`, `assignedTo`, `chatbotId`, `humanTakeover`, `lastMessageAt`

### `atendeia_messages` — src/lib/db/schema.ts
`id`, `providerMessageId`, `senderType`, `messageType`, `sentAt`

### `atendeia_envios_ia` — src/lib/db/schema.ts
`id`, `modified_by`

### `atendeia_campaigns` — src/lib/db/schema.ts
`id`, `content`, `scheduledAt`

### `atendeia_campaign_recipients` — src/lib/db/schema.ts
`id`, `contactId`, `messageId`, `status`

### `atendeia_audit_logs` — src/lib/db/schema.ts
`id`, `details`, `entityId`

## Rotas de API

| Rota | Metodos |
|------|---------|
| `/api/auth/login` | POST |
| `/api/auth/passkey` | POST |
| `/api/farmacia/[recurso]` | GET, POST |
| `/api/settings/agent` | GET |
| `/api/settings/evolution-webhook` | POST |
| `/api/settings/integrations` | GET, PUT |
| `/api/webhooks/evolution` | POST |

## Server Actions

- `src/lib/actions/agendamentos.ts`: `carregarAgendamentos()`, `gravarAgendamento()`, `cancelarEnvioAgendado()`
- `src/lib/actions/atendimento-farmacia.ts`: `assumirAtendimento()`, `enviarMensagemManual()`
- `src/lib/actions/chatbots.ts`: `carregarChatbots()`, `salvarChatbot()`
- `src/lib/actions/consultas.ts`: `carregarResumoAgenda()`, `carregarAgendaConsultas()`, `confirmarConsulta()`, `cancelarConsultaAgendada()`
- `src/lib/actions/crm.ts`: `carregarCrm()`, `adicionarFunil()`, `adicionarMotivo()`, `modificarMotivo()`, `salvarAcessosFunis()`, `adicionarOportunidade()`, `fecharNegocio()`, `moverNegocio()`
- `src/lib/actions/farmacia.ts`: `importarPlanilha()`, `carregarProdutos()`, `gravarProduto()`, `receberEstoque()`, `ajustarInventario()`, `carregarHistorico()`, `carregarPedidos()`, `registrarPedido()`, `alterarPedido()`, `carregarFarmacia()`, `carregarCadastrosFarmacia()`, `salvarHabilitacao()`
- `src/lib/actions/followups.ts`: `carregarFollowups()`, `salvarFollowups()`
- `src/lib/actions/operacao.ts`: `carregarOperacao()`
- `src/lib/actions/painel.ts`: `carregarPainel()`
- `src/lib/actions/perfil.ts`: `carregarMeuPerfil()`, `salvarMeuPerfil()`
- `src/lib/actions/seguranca.ts`: `trocarMinhaSenha()`, `minhasPasskeys()`, `removerMinhaPasskey()`
- `src/lib/actions/sessoes.ts`: `minhasSessoes()`, `encerrarMinhaSessao()`, `sairDoSistema()`
- `src/lib/actions/tags.ts`: `carregarTags()`, `salvarTag()`, `excluirTag()`
- `src/lib/actions/usuarios.ts`: `carregarUsuarios()`, `convidarUsuario()`, `atualizarUsuario()`, `reiniciarAcessoUsuario()`

## Paginas

- `src/app/crm/page.tsx`
- `src/app/entrar/page.tsx`
- `src/app/page.tsx`
- `src/app/perfil/page.tsx`
- `src/app/previa-design/page.tsx`
