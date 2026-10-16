# Atende Aí Farmácia

CRM WhatsApp, catálogo por lote, reservas, pedidos e atendimento conectado ao estoque real. Projeto independente, sem importar banco, credenciais ou prompts da clínica.

## Executar

Requer Node.js 24.7+, pnpm 11 e PostgreSQL 16. Redis é necessário para WhatsApp/worker.

1. Instale: `pnpm install --frozen-lockfile`.
2. Copie `.env.example` para `.env`. Defina senhas exclusivas, DATABASE_URL, SETTINGS_ENCRYPTION_KEY e AUTH_ORIGIN=http://127.0.0.1:8002.
3. Com Docker disponível: `pnpm db:up`. PostgreSQL usa porta 5434; Redis, 6381. Ajuste as URLs do app para esses serviços.
4. Aplique o histórico no banco novo: `pnpm db:migrate`. Nunca use a URL do projeto original.
5. Provisione o proprietário pelo processo de convite/passkey: [guia de login](docs/seguranca-login.md). Informe PROVISIONAR_NOME, PROVISIONAR_EMAIL e PROVISIONAR_ARQUIVO (pasta privada fora do checkout). Execute `pnpm exec tsx --env-file-if-exists=.env scripts/provisionar-proprietario.ts`. Não existe senha padrão.
6. Ative AUTH_LOGIN_ENABLED=true e execute `pnpm dev`. Abra [painel local](http://127.0.0.1:8002).

Em **Estoque → Novo produto**, cadastre preço, apresentação, quantidade inicial, lote e validade juntos. Produto e primeiro lote são salvos na mesma transação; uma repetição do envio não duplica o saldo. Preços aceitam `8`, `8,90` ou `8.90`. Desmarque **Cadastrar quantidade e lote agora** para salvar apenas o catálogo. Para reposições de produtos existentes, use **Lotes / entrada**.

## Operação

- Estoque: busca, filtros, validade, físico/reservado/disponível, entrada, ajuste e histórico.
- Pedidos: reserva temporária, conferência farmacêutica, confirmação autorizada, separação, conclusão e cancelamento.
- CRM: pedido cria negociação; venda/cancelamento atualizam o funil Vendas da farmácia.
- Conversas: atendente assume, pausa a IA e envia pelo canal configurado.
- Dashboard: dados persistidos de todo o período, atualização a cada dez segundos.

Gerente confere o pagamento real e registra uma referência. Essa confirmação baixa o estoque atomicamente. “Paguei” não confirma venda. Sem conciliação automática com Pix, gateway ou PDV.

## WhatsApp e IA

Configure credenciais próprias em Configurações (super administrador), instância Evolution exclusiva, Redis exclusivo com AOF/noeviction e chatbot vinculado à instância. Defina modelo OpenAI compatível com Responses/function calling. Ative AI_ENABLED e ATENDEIA_WORKER_ENABLED após configurar o canal.

Webhook: `https://SEU-DOMINIO/api/webhooks/evolution`; header x-webhook-secret igual ao segredo exclusivo do servidor. Eventos: MESSAGES_UPSERT, MESSAGES_UPDATE e CONNECTION_UPDATE. Nunca coloque segredo na URL.

A IA classifica ações validadas. Preço, saldo e pedido são respostas montadas pelo servidor a partir do PostgreSQL. Receita, diagnóstico, tratamento e substituição terapêutica vão para humano. Busca textual normaliza acentos e usa aliases cadastrados; não pressupõe equivalência clínica.

## Validação e implantação

Execute `pnpm verificar` e `pnpm build`. [Relatório de validação](docs/validacao-farmacia.md).

O teste tests/farmacia-postgres.test.ts exige TEST_DATABASE_URL para PostgreSQL 16 local com banco atendefarma_test. Sem essa variável fica marcado como ignorado. PGlite é complemento, não prova de concorrência.

Uma instalação por farmácia: banco, Redis, chaves, domínio e canal separados. Sem multiempresa no mesmo banco. Dockerfile: standalone Node 24, porta interna 3000. No EasyPanel crie serviço NOVO; startup aplica migrações com checksums. Faça backup do banco e da chave de criptografia separadamente. CI verifica; não publica automaticamente.

[Regras](docs/regras-negocio.md) · [Arquitetura](docs/adr/0014-farmacia.md) · [Permissões](docs/rbac.md) · [API](docs/api-farmacia.md).
ADRs antigos são histórico da base; regras vigentes são as da farmácia.
