# Validação — Atende Aí Farmácia

Execução em 14/10/2026, Windows, Node 24.19, Next 16.3.5. Fonte original preservada: git status --short permaneceu vazio. Nenhum .env, banco ou segredo original foi copiado. Nenhuma mensagem real foi enviada.

## Resultados

| Verificação | Resultado observado |
| --- | --- |
| TypeScript sem emissão | Aprovado, sem erros |
| ESLint de todo o projeto | Aprovado, sem erros |
| Auditor de estrutura | 183 arquivos, nenhuma violação |
| Testes do auditor | 45/45 aprovados |
| Marcas invisíveis em documentação | Nenhuma |
| Suíte Node completa | 150 testes: 143 aprovados, 0 falhas, 7 ignorados |
| PostgreSQL 16.14 real, executado separadamente | 1 teste aprovado, duas conexões independentes |
| Suíte de interface | 45 aprovados; expectativa clínica antiga corrigida e os 2 testes desse arquivo passaram na reexecução |
| Build de produção | Compilação, tipos e geração de páginas concluídos |
| Navegador local | Login real, dashboard, estoque, pedidos/detalhes; tela de 390 px conferida |

Os sete ignorados da suíte Node são seis testes que exigem Redis e o teste PostgreSQL condicionado a TEST_DATABASE_URL. O PostgreSQL foi executado separadamente com banco dedicado atendefarma_test; permanecem sem execução apenas os seis Redis. Não declarar a suíte externa integralmente homologada.

## Cenários A–J

| Caso | Evidência |
| --- | --- |
| A e C: disponibilidade e preço | Resposta gerada de consulta persistida; saldo inalterado |
| B e G: esgotado/vencido | Disponibilidade zero; pedido recusado; inativo também excluído |
| D e I: confirmação e repetição | 25 → 23 somente após autorização humana; nenhuma segunda baixa |
| E: última unidade | Duas conexões PostgreSQL disputam reserva; uma aceita, outra recusa |
| F: cancelamento | Libera reserva, estorna uma vez e põe devolução concluída em quarentena |
| H: receita | Venda bloqueada sem farmacêutico ativo habilitado |
| J: regressão | Contatos, conversas, webhook, autenticação e CRM em testes; pausa humana persistente |

Adicionais: FEFO, expiração, conflito de versão, ajuste abaixo de reserva, papel insuficiente, chave repetida com outros itens, falha parcial atômica, isolamento de pedido por conversa, recusa de ferramenta de pagamento pelo modelo, envio humano duplicado/incerto e ausência de indicadores fictícios em erro.

Os testes da IA usam respostas de provedor simuladas e banco de teste real/PGlite. Não houve chamada de produção à OpenAI ou Evolution. PostgreSQL portátil foi usado exclusivamente para teste, com autenticação e escuta loopback; binários, senhas e dados locais não integram a entrega de código.

## Antes de produção

Configurar banco, Redis, modelo/chave OpenAI, instância/segredo Evolution, chave de criptografia, origem HTTPS e primeiro administrador próprios. Carregar catálogo/lotes reais e habilitar os profissionais responsáveis. Homologar conversa de ponta a ponta com novos provedores. Sem gateway/PDV: conferência de pagamento permanece humana.

Prévia local usa dados sintéticos e porta 18002 porque 8002 já estava ocupada. WhatsApp/IA desabilitados. Não é banco operacional da farmácia.
