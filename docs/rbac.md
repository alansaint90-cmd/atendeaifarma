# RBAC — controle de acesso

## Farmácia — matriz vigente (ADR 0014)

| Operação | Papel mínimo |
| --- | --- |
| Dashboard, estoque, histórico e pedidos no painel/API | operador |
| Entrada de lote, criar/reservar/separar/concluir pedido, assumir/enviar conversa | operador |
| Cadastro/edição de produto, ajuste, confirmar pagamento ou cancelar | admin |
| Habilitar/desabilitar farmacêutico | admin |
| Conferir receita | operador E farmacêutico habilitado/ativo |
| Integrações e chaves privadas | super_admin |

Serviço interno de leitura de catálogo aceita visualizador; as actions/API exigem operador.
IA só busca, cria, reserva e consulta pedido da própria conversa. Nunca confirma venda.
Agenda clínica está desabilitada nesta edição; menções abaixo são histórico da base.

## Papeis

Hierarquicos: cada papel pode tudo o que os de baixo podem.

| Papel | Quem | Nivel |
|-------|------|-------|
| `super_admin` | Equipe de desenvolvimento: painel de problemas, auditoria completa | 0 |
| `admin` | Administrador do cliente: usuarios, relatorios, exclusoes | 1 |
| `operador` | Uso diario: lancamentos e operacoes | 2 |
| `visualizador` | Somente leitura | 3 |

A lista mora em `src/lib/db/schema/_enums.ts` (`PAPEIS`), do maior para o menor.
O `default` da coluna `usuarios.papel` e `visualizador` — o menor.

## Uma checagem so

```ts
import { exigirPermissao, temPermissao } from "@/lib/auth/permissoes";

await exigirPermissao(sessao, "operador");    // na action: audita e lança se não alcança
temPermissao(sessao, "admin");                // na pagina: decide o que mostrar
```

Nao existe outra assinatura. Permissao por recurso que nao for hierarquica vira ADR
antes de virar codigo.

## Matriz — papel MINIMO por acao

| Recurso | Ler | Criar | Alterar | Excluir |
|---------|-----|-------|---------|---------|
| Lancamentos | visualizador | operador | operador | admin |
| Contratos | visualizador | admin | admin | admin |
| Categorias | visualizador | admin | admin | admin |
| Relatorios | visualizador | admin | super_admin | super_admin |
| Usuarios | operador | admin | admin | admin |
| Configuracoes | super_admin | super_admin | super_admin | super_admin |
| Auditoria | admin | — (so o sistema grava) | nunca | nunca |
| Painel de problemas | super_admin | — | — | — |
| Tags (ADR-0008) | admin | admin | admin | admin |
| Follow-ups (ADR-0008) | admin | — | admin | — |
| Agendamentos individuais (ADR-0008) | admin | admin | admin | admin (cancelar) |
| Agenda de consultas e cadastro do paciente | admin | admin | admin | admin (cancelar) |

Recurso novo: acrescente a linha aqui ANTES de escrever a action.

## Regras

- O papel e o `ativo` sao lidos do banco a cada requisicao (`obterSessao`), nunca do token.
- Esconder botao e conforto; a action confere de novo.
- Usuario desativado perde acesso na proxima requisicao.
- Nenhum usuario ve dado de outra organizacao/tenant (quando o sistema for multi-tenant,
  o filtro de tenant entra em toda consulta, junto com `vivos()`).
- Recusa por permissao (403) vai para a trilha.
- Nunca zero donos: o ultimo `super_admin` nao pode ser rebaixado nem desativado.

## Painel do super_admin

- Alertas de lancamentos com erro ou inconsistencia
- Volume de erros por usuario e o detalhe (o que foi lancado × o que deveria ser)
- Registros excluidos: quem, quando, o que era
- Historico de alteracoes (tabela `auditoria`)

## CRM individual — ADR-0006

| Recurso | Leitura | Escrita |
| --- | --- | --- |
| Funis, etapas e motivos | visualizador, com escopo de funil | admin |
| Oportunidades e métricas | visualizador, com escopo de funil | operador, com escopo de funil |
| Concessão de acesso ao funil | admin | admin; versão do usuário e motivo obrigatórios |
| Sessões próprias | visualizador | visualizador, somente as próprias |

Proprietário operacional usa o papel existente super_admin, provisionado localmente.
A API comum não concede esse papel. Papel desconhecido é sempre recusado.

## Identidade no painel - ADR-0008

A matriz operacional vigente substitui os exemplos genéricos acima:

| Área | Papel mínimo |
| --- | --- |
| Dashboard, contatos e caixa de entrada | operador (SDR) |
| Tags, follow-ups e agendamentos | admin (Gerente) |
| Configurações, integrações e estado do agente | super_admin |
| Chatbot IA e prompt do SDR | admin (Gerente) |
| Sincronizar webhook na Evolution | super_admin |
| Equipe | admin, somente SDRs; super_admin, gerentes e SDRs |
| Perfil, senha e passkeys próprias | visualizador |

Os nomes novos não alteram os códigos armazenados. Usuários não se promovem nem
alteram a própria conta pela administração. Proprietários exigem processo manual.
Suspensão ou alteração administrativa revoga sessões, desafios e convites antigos.
