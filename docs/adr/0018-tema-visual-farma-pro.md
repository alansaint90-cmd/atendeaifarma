# ADR 0018 — Tema visual incremental do painel

Status: aceito em 2026-11-19.

A primeira etapa da referência Atende Farma PRO aplica a paleta, a sidebar escura, o gradiente de seleção, tipografia e acabamento dos componentes existentes. Não implementa métricas, gráficos, insights, planos comerciais, notificações ou ações ilustrativas do mockup. A marca permanece Atende Farma; o nome do tema não concede assinatura Pro.

O PainelShell recebe a classe tema-farma-pro. A folha src/styles/farma-pro.css é importada após as folhas existentes, centraliza os tokens e restringe os ajustes ao shell. As variáveis sob body:has(.tema-farma-pro) alcançam também os portais de confirmação e menus. A tela de entrada não monta esse shell e mantém seus estilos anteriores. Nenhuma action, consulta, migração, permissão ou regra de envio é alterada.

Desktop conserva o recolhimento do menu. No celular, uma única instância do menu funciona como painel lateral: Escape, botão e fundo fecham; a navegação também fecha o painel. O foco permanece no menu aberto, o conteúdo de fundo fica inert e o scroll anterior é restaurado ao fechar ou desmontar. As rotas e as verificações de acesso continuam as existentes.

Conversas conservam as duas colunas, a alternância móvel, altura útil, compositor, anexos e menus. Cards exibem os mesmos indicadores reais e não reintroduzem faturamento removido. Estoque, pedidos, campanhas, fila e equipe mantêm ações e contratos atuais. O rollback é a reversão deste conjunto de alterações de apresentação, sem operação no banco.

Na segunda etapa, autorizada para a página de estoque, a composição incorpora quatro indicadores, gráfico e card ilustrado de insights. O gráfico usa movimentos existentes agregados em Brasília, sem novas tabelas; os indicadores reutilizam painelFarmacia. Categorias vêm dos produtos vivos, e a paginação é validada no contrato existente. Os ícones reutilizam edição, lotes e inativação, sem introduzir exclusão de produtos ou alteração automática de saldo. A ilustração decorativa é um arquivo local; o gráfico em SVG tem tabela textual equivalente. Não há indicadores de crescimento, contagens de mensagens ou alertas de notificação fictícios.

A action carregarMovimentacao em src/lib/actions/farmacia.ts exige sessão e operador autorizado e delega período e agregação a src/lib/farmacia/estoque-painel.ts. Retorna apenas a série diária e as categorias vivas; não envia credenciais ou dados pessoais.

Por solicitação posterior do proprietário, a marca compartilhada incorpora o selo visual PRO da referência, ao lado de Atende Farma, e preserva o slogan em uma linha. O selo compõe a identidade visual e não altera assinatura, permissões ou plano contratado. Login e painel usam o mesmo componente vetorial, com contraste próprio para fundos claros e escuros e textos recolhidos junto ao menu.

A importação Excel abre em janela modal via Dialog do Radix já instalado, com portal, fundo escurecido, foco contido, retorno ao botão de origem, corpo rolável e rodapé fixo. Não expande o conteúdo da página de estoque. Clique externo não descarta a prévia, e leitura/processamento ou confirmação crítica impedem fechar a janela. A confirmação bloqueada de três segundos continua sobre a janela, sem alterar validação, autorização, idempotência ou transação da importação.

Pedidos recebe a composição da referência com quatro indicadores, filtros de busca/status/período e tabela de cinco colunas. A consulta listarPedidos existente valida os parâmetros com buscaPedidosSchema e lê indicadores, total e itens na mesma transação somente leitura com snapshot repetível. Não há tabelas ou migrações novas. Chamadas legadas sem período e consultas do agente por ID permanecem compatíveis. O número do pedido abre os detalhes operacionais existentes; telefone permanece na lista e origem, responsável e instante completo aparecem nos detalhes. Percentuais e notificações ilustrativas não são incorporados.
