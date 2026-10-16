# Regras do Atende Aí Farmácia

## Isolamento

Cada farmácia tem implantação, PostgreSQL, Redis, credenciais, domínio e instância WhatsApp exclusivos. Não há tenant compartilhado. A base clínica é somente origem do código; nenhum dado ou prompt dela é importado. Agenda clínica desabilitada no worker, actions e menu. Migrações herdadas permanecem imutáveis por checksum.

## Catálogo e estoque

Campos: nome, princípio, genérico, fabricante, categoria, concentração, apresentação, unidades por embalagem, EAN opcional único, SKU único, preço/promoção, mínimo, receita, controle, ativo, medicamento, observações e aliases. Dinheiro usa decimal string e centavos BigInt. Promoção não supera preço normal.

Quantidade representa embalagens. Cadastro não cria saldo; entrada registra lote e movimento. Medicamento exige validade. Lotes vencidos, bloqueados, excluídos ou produtos inativos não têm disponibilidade. Validade usa o dia de Brasília; próximo do vencimento = até 30 dias.

Disponível = físico elegível menos reservas ativas não expiradas. Reservas não alteram físico. Alertas são calculados. Tela atualiza a cada dez segundos e após mutações.

Gerente altera cadastro e ajusta inventário; operador registra entrada. Ajuste exige motivo, versão e saldo não inferior às reservas. Edição do produto exige versão original e invalida conferências farmacêuticas pendentes. Não há exclusão física ou edição de movimentos.

## Pedidos

Pedido nasce aguardando confirmação, com preço do servidor, contato existente e itens únicos. Não reserva nem baixa. Confirmação dos itens cria reserva FEFO (menor validade elegível primeiro), com FARMACIA_RESERVA_MINUTOS de 1 a 120, padrão 15.

Preço alterado antes da reserva exige recriar pedido. Após reserva, preço do pedido é preservado. Expiração libera disponibilidade imediatamente; renovar exige nova validação. Falha em qualquer item desfaz toda a transação.

Gerente/super administrador confere pagamento real, registra referência de cinco caracteres ou mais e confirma no modal de três segundos. Interesse, consulta, pedido e “paguei” não baixam. Não há gateway/PDV.

Confirmação verifica etapa, reserva, lote, saldo e conferência farmacêutica quando exigida. Baixa, movimentos, eventos, auditoria e CRM são uma transação. Chaves únicas, advisory lock por instalação e travas de linha evitam repetição e saldo negativo entre conexões.

Etapas: aguardando confirmação → aguardando pagamento → pagamento confirmado → em separação → concluído. Só confirmação baixa. Repetir confirmação não repete baixa.

Cancelamento antes da venda libera reserva. Depois da venda e antes da entrega estorna lote original. Depois de concluído exige confirmar recebimento físico: devolução entra em novo lote bloqueado/quarentena. Não realiza reembolso nem desbloqueio sanitário automático. Histórico e estorno são idempotentes.

## Conferência e IA

Receita OU controle exige farmacêutico habilitado e ativo antes da confirmação. Gerente registra habilitação profissional, separada do papel de acesso. Conferência guarda protocolo sem dados clínicos. Sistema não autentica registro profissional externo nem interpreta receita.

IA recebe IDs conhecidos na conversa e retorna ação estruturada validada. Pode buscar, criar pedido, reservar após confirmação dos itens e consultar pedido da própria conversa. Não confirma pagamento, confere receita, cancela venda ou ajusta estoque. Falha de sistema não é apresentada como esgotamento.

Busca normaliza nome, princípio, genérico, concentração, apresentação, EAN, SKU e aliases. Ambiguidade pede escolha. Nenhuma equivalência terapêutica é inferida. Servidor monta preço/saldo a partir da consulta atual; sem resposta comercial livre do modelo.

Interesse fica na conversa existente. Pedido cria oportunidade; fechamento avulso no CRM é bloqueado. Venda ganha e cancelamento perde negociação, preservando histórico original auditável.

Humano assume conversa e pausa IA/follow-ups no PostgreSQL. Saídas pelo WhatsApp preservam pausa Redis herdada. Repetição de eventos não duplica contato, mensagem ou pedido. Entrega manual incerta não tem reenvio automático.

Follow-ups/agendamentos preservados usam texto humano. Configure retomadas institucionais; não fixe preços ou promessas de estoque nesses textos.

## Indicadores e privacidade

Dashboard usa dados persistidos. Faturamento = vendas confirmadas não canceladas, não liquidação bancária ou escrituração fiscal. Atendimentos IA = conversas distintas com saída bot. Consultas agrupam evento sem multiplicar por apresentações.

Autorização/validação no servidor; chaves privadas criptografadas. Pedidos não armazenam anexos de receita. Auditoria identifica operação/responsável sem copiar mensagens. Retenção, base legal, contratos com operadores e procedimentos sanitários precisam ser definidos pela operação antes da produção; não há certificação automática de conformidade.
