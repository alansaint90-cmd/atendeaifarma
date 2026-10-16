# ADR-0002: Adoção da estrutura base no Atende AI existente

- Status: Aceito para instalação das ferramentas; migração do legado pendente de revisão.
- Data: 2026-09-16

## Contexto

O pacote fornecido foi criado para um projeto novo com npm, node-postgres e deploy
SSH/PM2. O Atende AI já usa pnpm, postgres-js, migrações com checksum e EasyPanel.
Sobrescrever essas partes criaria duas conexões e históricos de banco incompatíveis.

## Decisão

- Preservar pnpm, driver postgres-js e migrações existentes. O módulo de entrada
  da base delega à conexão atual, sem criar um segundo pool.
- Preservar os testes Node em `test:node`; usar Vitest/Testing Library para componentes
  em `test:ui`. O comando `test` executa os dois.
- Instalar CI com as verificações da base e pnpm. O deploy permanece no EasyPanel;
  não configurar SSH/PM2 nem mudar a branch de produção nesta instalação.
- Trabalhar em develop, sem promover mudanças para main enquanto houver pendências.
- Instalar os modelos de usuários/auditoria da base como referência não conectada
  ao schema de produção. Os módulos de sessão nascem fechados. A consolidação com
  as tabelas atendeia_users e atendeia_audit_logs exige migração revisada posterior.
- Preservar `.env`, `.env.example` e as regras de negócio existentes. A inclusão
  das variáveis locais foi autorizada na correção posterior, sem alterar segredos.
- Manter auditor e hook ativos. Os 15 apontamentos sobre o schema legado decorrem
  dos helpers funcionais timestamps()/audit(), que o auditor de regex não reconhece.
  As colunas existem, conforme os testes relacionais já presentes. Não suprimir a
  regra nem mudar o banco apenas para silenciar o relatório. Na revisão posterior,
  a análise sintática de fábricas locais passou a reconhecer as colunas reais,
  com testes negativos para fábricas incompletas, desconhecidas e textos falsos.

## Limitações

Docker não está instalado nesta máquina e DATABASE_URL local está vazia. Não houve
criação nem migração de banco real nesta instalação. Autenticação humana, segundo
fator e proteção de branches do GitHub ainda precisam ser implementados/configurados.
Os documentos da base descrevem o padrão desejado, não certificam conformidade do legado.
