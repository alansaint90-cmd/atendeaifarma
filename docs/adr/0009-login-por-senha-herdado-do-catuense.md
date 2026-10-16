# ADR-0009 - Login por senha e gestão de usuários no Atende AI

Status: implementada.

## Contexto

O sistema Autoproia CFC Catuense possui uma experiência de login por e-mail e
senha, convite de primeiro acesso e administração de usuários. O Atende AI já
possui as tabelas `atendeia_users`, sessões opacas, Argon2id, convites, passkeys
e uma matriz hierárquica de papéis. Copiar a sessão HMAC e o `scrypt` do sistema
antigo criaria dois modelos de identidade e perderia as proteções do banco atual.

## Decisão

Trazer somente o fluxo de produto: login por e-mail e senha, opção de manter a
sessão, primeiro acesso por convite, gestão de usuários e papéis. A senha usa o
Argon2id já adotado pelo Atende AI; a sessão guarda apenas o hash de um token
aleatório em `atendeia_sessions`. O papel e o estado ativo continuam sendo lidos
do banco a cada requisição.

Os papéis mantêm os códigos existentes: `super_admin` (Super administrador),
`admin` (Gerente), `operador` (SDR) e `visualizador`. O gerente administra SDRs;
o super administrador administra gerentes e SDRs. Não há senha padrão nem
cadastro público, e nenhum dado, segredo ou integração do sistema antigo é
copiado.

## Consequências

`POST /api/auth/login` é o caminho de senha e cria a sessão depois da validação
de origem, limite de tentativas e consulta ao PostgreSQL. O convite continua
expirando em 15 minutos e o usuário define a própria senha. O provisionamento e
o ambiente precisam ter `AUTH_LOGIN_ENABLED=true` somente após homologação.
