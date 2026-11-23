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
- Preferência de pagamento e etapa comercial do WhatsApp usam eventos auditados existentes, sem nova tabela ou status financeiro. O contexto é reconstruído pelo pedido da conversa; eventos recebem instantes crescentes por pedido sob a trava transacional para desempatar operações no mesmo milissegundo. Acréscimos reaproveitam a validação do cadastro de pedido e uma chave com assinatura dos itens, sem duplicar o pedido ou aceitar a mesma operação com outros dados.
- Recebimento de anexo durante pagamento Pix, endereço de entrega e nome do destinatário usam os mesmos eventos auditados. O estado da entrega é consultado por pedido, independente do evento mais recente de pagamento, para preservar endereço e destinatário nas mudanças de forma de pagamento. A Caixa de entrada lê a última etapa de pagamento válida para sinalizar troco e comprovante aos atendentes sem assumir a conversa pela equipe. O evento do comprovante registra o recebimento do anexo, sujeito a conferência humana.
- A prova recebida é persistida pelo webhook autenticado no mesmo commit da mensagem. A nova apresentação financeira é derivada dos eventos existentes. `pix_conferido` registra a conferência por gerente e mantém o pedido aberto para entrega. A ação `entregar` usa a versão do pedido e revalida os lotes antes de confirmar a venda, baixar o estoque e concluir a entrega atomicamente. `confirmado_em` continua representando a confirmação da venda para o CRM e o dashboard. Pedidos já baixados e pedidos legados sem forma de pagamento preservam as transições anteriores.
- A action `alterarPausaAtendimento` valida operador e versão da conversa e grava a pausa do compositor em campos separados da atribuição humana. A retomada grava o horário no PostgreSQL. Worker e painel comparam esse horário à origem da pausa temporária no Redis, sem alterar as chaves de outros atendimentos ou depender de transação entre PostgreSQL e Redis.
- Tema da base, modal de três segundos, erro explícito e atualização de dez segundos. Prévia clínica indisponível.
- Consulta de estoque é uma sequência retomável no checkpoint Redis existente: aviso, prazo mínimo de 15 segundos, consultando, consulta atual e oferta quando houver disponibilidade. O worker mantém o evento pendente, mas processa outros contatos durante o prazo. Sem disponibilidade, não envia resposta comercial: usa a conversa existente como fila/notificação interna (pending, human_takeover e sem responsável), com auditoria transacional e pausa Redis dos follow-ups. O atendente confere e responde. Avisos negativos ainda pendentes de versões anteriores são descartados, preservando os já enviados. Não cria tabelas nem envia aviso de transferência ao cliente. A devolução explícita à IA mantém o controle humano existente.
- Consulta adicional carrega no mesmo checkpoint a referência validada à última oferta reconhecida ou ao pedido aberto da conversa. Usa um único balão de consulta, sem espera inicial. Falta do adicional permite continuar com os itens anteriores somente após revalidar saldo e reservas próprias elegíveis pelo domínio existente. Não cria tabela, pedido ou reserva por inferência. Continua com dois balões comerciais, sem pausa ou transferência, quando há referência válida; sem ela, mantém o encaminhamento humano. Respostas incertas continuam sem reenvio automático.

## Limites

Sem gateway, Pix automático, emissão fiscal, SNGPC, validação externa de CRF, importação de catálogo, busca vetorial externa ou tenant compartilhado. Novo deploy exige infraestrutura própria e homologação dos provedores.

PGlite é teste complementar SQL. Concorrência precisa de PostgreSQL 16 real com duas conexões disputando a última unidade e repetindo confirmação.
