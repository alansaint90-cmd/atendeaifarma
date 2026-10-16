# ADR-0006: CRM e identidade individual

- Data: 17/09/2026
- Status: em implementação; não ativado em produção.

A auditoria mostrou que o login demonstrativo não pode sustentar permissões por
funil. A fase de CRM inclui o pré-requisito de sessão humana real. As tabelas
atendeia_users e atendeia_sessions serão reutilizadas; não ativaremos o modelo
usuarios de referência. Novos cadastros comerciais não aceitam userId como prova
de identidade. Papel/atividade são consultados no banco em cada chamada.

Autenticação nova será por passkey com verificação do usuário obrigatória, usando
SimpleWebAuthn. Não criar senha padrão ou uma autenticação caseira por senha.
Provisionamento do primeiro proprietário é administrativo local, nunca por API
pública. Registro exige convite de uso único. Acesso administrativo legado será
preservado para integrações atuais; não concede sessão de pessoa automaticamente.
Credenciais não serão cadastradas em nome do usuário durante desenvolvimento.

Sessões têm token opaco em cookie HttpOnly, hash no banco, limite absoluto de
24h e inatividade de 1h. Desafios e convites têm validade e consumo transacional.
Origens e RP ID são explícitos na configuração; não confiar no Host recebido.

CRM usa entidades relacionais para funis, etapas, acesso, oportunidades, motivos
e histórico de fechamento. Valores são numeric/string; filtros de escopo são
aplicados no servidor, inclusive agregações. Fechar oportunidade registra estado
anterior, usuário, data/hora e valores da oportunidade no evento de fechamento.
Não modificar históricos de migração existentes nem apagar dados.

Referências: https://simplewebauthn.dev/docs/packages/server e
https://simplewebauthn.dev/docs/advanced/passkeys — userVerification required e
requireUserVerification true, com validação de origem/RP/challenge no servidor.

## Recursos novos em validação — ADR-0006

O CRM usa `atendeia_funis`, `atendeia_funis_etapas`, `atendeia_funis_acessos`,
`atendeia_motivos_perda`, `atendeia_funis_oportunidades`,
`atendeia_funis_oportunidades_tags` e `atendeia_funis_oportunidades_fechamentos`.
Identidade usa `atendeia_users_passkeys`, `atendeia_users_convites`,
`atendeia_auth_desafios` e `atendeia_auth_limites`, reutilizando usuários e sessões.
A coluna aditiva `atendeia_audit_logs.details` registra motivo e concessões antes/depois.

`/api/auth/passkey` é o único endpoint de cerimônia WebAuthn, limitado por origem,
corpo, configuração explícita e desafios. Não substitui a autenticação do webhook.
Actions `carregarCrm`, `adicionarFunil`, `adicionarMotivo`, `modificarMotivo`,
`salvarAcessosFunis`, `adicionarOportunidade`, `fecharNegocio`, `moverNegocio`
exigem sessão e permissão. `minhasSessoes` e `encerrarMinhaSessao` usam exclusivamente
o usuário da sessão; não aceitam userId do navegador.
