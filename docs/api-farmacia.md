# API da farmácia

Sessão individual do painel, cookie HttpOnly e operador ou superior. POST valida Origin/JSON; domínio confere novamente autorização/Zod. Não há API pública ou token administrativo fixo.

| Método | Caminho | Operação |
| --- | --- | --- |
| GET | /api/farmacia/produtos | Busca, categoria, disponibilidade, ordenar, pagina |
| GET | /api/farmacia/pedidos | Status, página, ID |
| GET | /api/farmacia/historico | Histórico por produtoId |
| GET | /api/farmacia/dashboard | Indicadores acumulados |
| POST | /api/farmacia/produtos | Cadastro/edição: gerente |
| POST | /api/farmacia/entradas | Entrada: operador |
| POST | /api/farmacia/ajustes | Inventário: gerente |
| POST | /api/farmacia/pedidos | Criar pedido idempotente |
| POST | /api/farmacia/pedido-acoes | Reservar, conferir, confirmar, separar, concluir, cancelar |

Corpos em src/lib/farmacia/validacao.ts. Valores monetários: decimal com duas casas. Validade YYYY-MM-DD; versões ISO com fuso. Preço do pedido vem do servidor. Reenvio mantém chave original.

No cadastro de produto (`id: null`), `estoqueInicial` opcional recebe `codigo`, `validade`, `quantidade` e `chave` UUID. Produto, lote, movimento e auditoria são gravados na mesma transação. Reenvio com a mesma chave e os mesmos dados retorna o produto já criado; dados diferentes são recusados. Medicamentos exigem validade. Na edição, use `/entradas` para novas quantidades. A interface normaliza preços com vírgula ou sem centavos antes de enviá-los à API.

Actions: carregarProdutos, gravarProduto, receberEstoque, ajustarInventario, carregarHistorico, carregarPedidos, registrarPedido, alterarPedido, carregarFarmacia, carregarCadastrosFarmacia, salvarHabilitacao, assumirAtendimento e enviarMensagemManual.

Tabelas: atendeia_produtos, atendeia_produtos_lotes, atendeia_produtos_movimentos, atendeia_pedidos, atendeia_pedidos_itens, atendeia_pedidos_reservas, atendeia_pedidos_eventos, atendeia_farmaceuticos, atendeia_produtos_consultas e atendeia_atendimento_envios. FKs para contatos/conversas/usuários/oportunidades usam RESTRICT. Todas têm auditoria.

Resultado contém mensagem segura para falha esperada, nunca SQL ou segredo.

Handler dinâmico: /api/farmacia/[recurso]. Integrações herdadas /api/settings/agent e /api/settings/evolution-webhook continuam exclusivas de super_admin. carregarChatbots e salvarChatbot exigem gerente; sairDoSistema revoga a sessão atual. carregarResumoAgenda é legado indisponível nesta edição.
