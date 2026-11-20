# ADR 0018 — Tema visual incremental do painel

Status: aceito em 2026-11-19.

A primeira etapa da referência Atende Farma PRO aplica a paleta, a sidebar escura, o gradiente de seleção, tipografia e acabamento dos componentes existentes. Não implementa métricas, gráficos, insights, planos comerciais, notificações ou ações ilustrativas do mockup. A marca permanece Atende Farma; o nome do tema não concede assinatura Pro.

O PainelShell recebe a classe tema-farma-pro. A folha src/styles/farma-pro.css é importada após as folhas existentes, centraliza os tokens e restringe os ajustes ao shell. As variáveis sob body:has(.tema-farma-pro) alcançam também os portais de confirmação e menus. A tela de entrada não monta esse shell e mantém seus estilos anteriores. Nenhuma action, consulta, migração, permissão ou regra de envio é alterada.

Desktop conserva o recolhimento do menu. No celular, uma única instância do menu funciona como painel lateral: Escape, botão e fundo fecham; a navegação também fecha o painel. O foco permanece no menu aberto, o conteúdo de fundo fica inert e o scroll anterior é restaurado ao fechar ou desmontar. As rotas e as verificações de acesso continuam as existentes.

Conversas conservam as duas colunas, a alternância móvel, altura útil, compositor, anexos e menus. Cards exibem os mesmos indicadores reais e não reintroduzem faturamento removido. Estoque, pedidos, campanhas, fila e equipe mantêm ações e contratos atuais. O rollback é a reversão deste conjunto de alterações de apresentação, sem operação no banco.
