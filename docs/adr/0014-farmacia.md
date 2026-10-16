# ADR 0014 — Farmácia com estoque transacional

Status: aceito após aprovação do usuário.

Reutilizar Next App Router, React, TypeScript, Drizzle/postgres-js, Evolution, Redis, login, CRM e visual. Não importar .env, banco ou prompt clínico. Sem Prisma, SQLite ou API separada.

## Decisões

- Implantação isolada por farmácia. Schema herdado não tem tenant; multiempresa compartilhada exige projeto futuro.
- Schema ativo: src/lib/db/schema.ts. Novas tabelas em src/lib/db/schema/farmacia.ts. Migração aditiva; modelos de referência não substituem identidade existente.
- Domínio src/lib/farmacia compartilhado por actions, HTTP e worker. Papel e ativo relidos no banco. Ator sistema limitado às operações comerciais permitidas.
- Advisory lock transacional por instalação antes de travas de linha. Serializa escrita de estoque/pedidos: menor paralelismo em troca de ordem consistente nas alocações de vários produtos.
- FEFO, reservas expirantes, movimentos e eventos. Disponibilidade calculada; sem coluna duplicada mutável. Dinheiro string/BigInt.
- Sem gateway: gerente confere pagamento. Mensagem e reserva não são autorização financeira.
- Conferência farmacêutica é capacidade adicional, independente do papel de gerente.
- Modelo usa função estrita; servidor redige fatos comerciais. tool_choice nomeado, strict e parallel_tool_calls=false seguem [documentação oficial](https://developers.openai.com/api/docs/guides/function-calling).
- Devolução entregue vai para quarentena bloqueada. Sem reembolso ou liberação sanitária automática.
- Oportunidade acompanha venda/cancelamento; fechamento manual avulso bloqueado.
- Tema da base, modal de três segundos, erro explícito e atualização de dez segundos. Prévia clínica indisponível.

## Limites

Sem gateway, Pix automático, emissão fiscal, SNGPC, validação externa de CRF, importação de catálogo, busca vetorial externa ou tenant compartilhado. Novo deploy exige infraestrutura própria e homologação dos provedores.

PGlite é teste complementar SQL. Concorrência precisa de PostgreSQL 16 real com duas conexões disputando a última unidade e repetindo confirmação.
