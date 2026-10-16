# ADR-0008 - Sessão individual em todo o painel

Status: implementada; ativação em produção depende de homologação e provisionamento.

## Decisão

Substituir SETTINGS_ADMIN_TOKEN em todas as telas, actions e APIs de configurações
por sessão individual. A página inicial exige autenticação; não existe entrada
demonstrativa que conceda acesso. Credenciais de máquina e criptografia permanecem.

Preservar os papéis existentes no banco: super_admin é Super administrador, admin
é Gerente e operador é SDR. Gerente administra somente SDRs; super administrador
administra gerentes e SDRs. Nenhuma API pública cria, rebaixa ou suspende proprietários.
Configurações de integrações, inclusive consulta, exigem super administrador.
O contexto geral legado do orquestrador não é exibido nem usado nas respostas.
O gerente configura o prompt do chatbot SDR em Chatbot IA.
Operação exige SDR;
tags, follow-ups e agendamentos exigem gerente. CRM preserva escopos de funil.

Senha usa Argon2id nativo do Node >=24.7, salt aleatório, memória de 19 MiB,
duas passagens e paralelismo 1. São aceitos 15 a 256 caracteres, sem trim.
Consulta HIBP transmite apenas prefixo SHA-1; indisponibilidade avisa sem bloquear.
Login por senha cria a sessão individual após conferir o hash Argon2id. A passkey
verificada permanece disponível como fator adicional no perfil e como alternativa
de acesso para contas existentes; no primeiro acesso o convite define a senha e
abre a sessão sem solicitar o cadastro de uma chave no navegador.
Não há senha padrão nem cadastro público. Convite de uso único expira em 15 minutos.

Troca de senha, alteração de usuário e alteração de passkeys revogam sessões.
Reinício administrativo de acesso revoga também fatores e emite novo convite.
Não remover a última passkey, nem permitir autoalteração de papel. Toda alteração
administrativa exige motivo, versão e auditoria na mesma transação.

AUTH_TRUST_PROXY_HOPS fica 0 por padrão: não confiar em IP encaminhado pelo cliente.
Só configurar saltos após confirmar que o proxy controlado sobrescreve o cabeçalho.
O limitador atômico por conta complementa os limites global e, quando confiável, IP.

## Operação e validação

As tabelas de identidade existentes são reutilizadas; não há migração destrutiva.
O provisionamento de proprietário continua manual pelo script
`scripts/provisionar-proprietario.ts`, em checkout administrativo com dependências
instaladas e conexão autorizada ao banco. A imagem Docker também inclui a versão
compilada em /app/scripts/provisionar-proprietario.cjs, executável com Node no
terminal do serviço. Ela não roda automaticamente no entrypoint Docker.
Configurar PROVISIONAR_NOME, PROVISIONAR_EMAIL, PROVISIONAR_ARQUIVO (fora do checkout),
DATABASE_URL e AUTH_ORIGIN. Executar `pnpm exec tsx scripts/provisionar-proprietario.ts`.
O convite fica somente no arquivo privado, nunca nos logs. Abrir /entrar e escolher
Primeiro acesso; usuário define a senha em origem HTTPS e entra imediatamente.
Se a execução falhar, o arquivo de convite parcial é removido. Para identificar a
etapa sem expor dados do banco, adicione PROVISIONAR_DIAGNOSTICO=true à execução.
PROVISIONAR_REINICIAR_PROPRIETARIO=true só reemite convite quando o proprietário
existente tiver o mesmo e-mail, estiver inativo e não possuir passkey. Não recupera
nem substitui uma conta ativa.

O e-mail solicitado para o primeiro proprietário é alansaint90@gmail.com.
A implementação não cria essa conta automaticamente nem altera o banco de produção.
Antes de ativar AUTH_LOGIN_ENABLED, validar convite, login e roles no PostgreSQL 16
de homologação e em dispositivo com passkey. Manter backup antes de deploy.

Actions de usuários: carregarUsuarios, convidarUsuario, atualizarUsuario,
reiniciarAcessoUsuario. Actions de perfil: trocarMinhaSenha, minhasPasskeys,
removerMinhaPasskey. O perfil também permite encerrar sessões próprias.

O perfil passa a compartilhar a navegação lateral do painel. Nome, celular e foto
do próprio usuário são editáveis com versão e auditoria na mesma transação.
As actions `carregarMeuPerfil` e `salvarMeuPerfil` exigem sessão individual e
permissão mínima de visualizador.
O e-mail de login e o papel permanecem fora dessa edição. Foto JPG/PNG até 2 MiB
fica na coluna aditiva `avatar_data` do usuário; a trilha registra apenas o nome
do campo, nunca o conteúdo da imagem. A assinatura tem página própria no painel;
até haver integração de cobrança, exibe o estado indisponível sem simular dados.

Testes usam banco descartável e provedores simulados; não enviam WhatsApp real.
O scanner de actions exige sessão e await na guarda de permissão, incluindo aliases.
