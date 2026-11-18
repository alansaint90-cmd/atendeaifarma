# Regras do Atende Aí Farmácia

## Isolamento

Cada farmácia tem implantação, PostgreSQL, Redis, credenciais, domínio e instância WhatsApp exclusivos. Não há tenant compartilhado. A base clínica é somente origem do código; nenhum dado ou prompt dela é importado. Agenda clínica desabilitada no worker, actions e menu. Migrações herdadas permanecem imutáveis por checksum.

## Catálogo e estoque

Campos: nome, princípio, genérico, fabricante, categoria, concentração, apresentação, unidades por embalagem, EAN opcional único, SKU único, preço/promoção, mínimo, receita, controle, ativo, medicamento, observações e aliases. Dinheiro usa decimal string e centavos BigInt. Promoção não supera preço normal.

Quantidade representa embalagens. Cadastro pode incluir estoque inicial: produto, lote, movimento e auditoria são gravados na mesma transação, com chave idempotente. Sem estoque inicial, o cadastro não cria saldo; reposições usam entrada de mercadoria. Medicamento exige validade. Lotes vencidos, bloqueados, excluídos ou produtos inativos não têm disponibilidade. Validade usa o dia de Brasília; próximo do vencimento = até 30 dias.

Cadastro rápido mostra identificação, apresentação, preço, classificação sanitária e estoque inicial. Detalhes opcionais ficam recolhidos; SKU vazio recebe código automático, categoria começa como Medicamentos, embalagem como 1 e mínimo como 0. Nenhum campo existente é removido.

Gestor pode importar Excel .xlsx de até 2 MB e 200 produtos em uma única aba, usando o modelo baixado no painel. Uma linha por produto novo; quantidade zero cadastra sem saldo. Nome, apresentação, preço, quantidade e indicação explícita de receita são obrigatórios; lote e validade seguem as regras do cadastro. Concentração, SKU, EAN, unidades por embalagem, princípio ativo, fabricante e controle especial são aceitos. Não interpreta fórmulas ou links. Apresenta prévia e erros por linha e exige confirmação de três segundos. A action `importarPlanilha` em `src/lib/actions/farmacia.ts` exige sessão e permissão de gestor; o domínio revalida tudo e grava o arquivo inteiro, com auditoria e trava transacional; qualquer erro desfaz todas as linhas. Repetir a mesma confirmação não duplica cadastro ou estoque. SKU/EAN repetidos e produtos de mesma identificação sem SKU são recusados; reposição de existente continua em Lotes / entrada.

Disponível = físico elegível menos reservas ativas não expiradas. Reservas não alteram físico. Alertas são calculados. Tela atualiza a cada dez segundos e após mutações.

O estoque permanece em ordem alfabética A–Z por nome, independentemente da sequência de cadastro, edição, importação ou quantidade disponível. A comparação normaliza Unicode, ignora maiúsculas/minúsculas e acentos portugueses, preservando a grafia exibida. Empates usam concentração, apresentação, SKU e ID, para manter a paginação estável. A ordem é aplicada no PostgreSQL antes de LIMIT/OFFSET, incluindo filtros e novas atualizações. A opção de ordenar por quantidade foi removida da tela; o parâmetro legado ainda é aceito pela validação, mas não altera a ordem.

Gerente altera cadastro e ajusta inventário; operador registra entrada. Ajuste exige motivo, versão e saldo não inferior às reservas. Edição do produto exige versão original e invalida conferências farmacêuticas pendentes. Não há exclusão física ou edição de movimentos.

## Pedidos

No WhatsApp, o resumo mostra produtos, especificação, quantidade, preços e total, sem código interno nem prazo da reserva. Pergunta a confirmação dos itens em outro balão. Depois da confirmação, pergunta se deseja acrescentar produtos: sim continua no mesmo pedido; não encerra os itens e envia “Pedido registrado, aguardando pagamento.” e a pergunta Pix/dinheiro/cartão em balões separados. Acréscimos revalidam todo o carrinho, liberam reservas antigas e exigem nova confirmação, sem duplicar eventos repetidos. Preferências e troco persistem como eventos auditados e aparecem no histórico do painel. Pix envia somente FARMACIA_PIX_CHAVE e recebedor opcional FARMACIA_PIX_RECEBEDOR; sem configuração, solicita a equipe. Dinheiro: pagamento na entrega, pergunta necessidade de troco e valor. Cartão: maquininha acompanha o entregador. Nenhuma escolha ou comprovante confirma pagamento nem baixa estoque. A expiração da reserva continua existindo no sistema.

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

Na busca composta, números e palavras são procurados na identificação textual do produto, sem usar trechos de SKU/EAN para completar uma apresentação ausente. EAN é pesquisado completo; SKU completo continua aceito e consulta de um único termo não numérico pode localizar parte do código interno. Assim, “dipirona 30 comprimidos” não encontra uma embalagem diferente apenas porque o SKU contém 30.

Consulta comercial busca primeiro apresentações disponíveis no PostgreSQL, antes de paginar; só consulta os demais cadastros se não houver disponibilidade, para distinguir ausência do catálogo de falta de saldo. Exibe até oito opções disponíveis, preservando nome, concentração e apresentação; não mistura opções sem saldo. Consulta específica sem saldo não autoriza oferecer outra apresentação como se fosse a solicitada. Não expõe lotes, validade ou quantidade interna de estoque. Informa o preço atual ou promocional e mantém o aviso de conferência farmacêutica quando necessário. Somente opções efetivamente oferecidas entram no contexto de escolha. A oferta é um balão e “Gostaria de fazer o seu pedido ou acrescentar mais alguma coisa?” é outro, usando os mesmos checkpoints e proteção contra reenvio incerto. Sem estoque, responde indisponibilidade sem CTA de compra; falha de consulta continua distinta de falta de saldo.

O prompt salvo no chatbot da instância compõe a classificação do atendimento junto ao contrato obrigatório do sistema. O modelo Atende Aí Pharma é carregado por ação explícita no painel; criar ou carregar abre um rascunho e só salvar o aplica à instância selecionada. Não substitui prompts existentes automaticamente. A recuperação consulta diretamente o catálogo PostgreSQL, sem depender de uma base vetorial para preço ou saldo. Respostas identificam embalagens e distinguem indisponibilidade de produto ausente; falha de consulta não vira esgotamento. Esclarecimentos perguntam somente o campo necessário. O modelo da farmácia desativa a pergunta automática do nome: identificação não é exigida para consultar preço ou saldo, mas nomes informados espontaneamente continuam sendo lembrados. Chatbots anteriores preservam a opção ligada quando ela não foi definida. A saudação usa a persona configurada; dúvidas clínicas seguem a transferência humana configurada, sem confirmar encaminhamento indisponível.

Interesse fica na conversa existente. Pedido cria oportunidade; fechamento avulso no CRM é bloqueado. Venda ganha e cancelamento perde negociação, preservando histórico original auditável.

Humano assume conversa e pausa IA/follow-ups no PostgreSQL. Saídas pelo WhatsApp preservam pausa Redis herdada. Repetição de eventos não duplica contato, mensagem ou pedido. Entrega manual incerta não tem reenvio automático.

O compositor usa barra compacta com placeholder “Digite uma mensagem”, menu + com apenas Documento, Fotos e vídeos e Áudio, seletor de emojis e microfone à direita (botão Enviar quando existe conteúdo). Documento aceita PDF/DOCX e vídeo aceita MP4/WebM, mantendo o limite de 2 MB, validação de assinatura e reserva de envio. Vídeo/documento são registrados por marcador e legenda, sem binário no CRM. Ações Assumir conversa, Devolver à IA, Validar canal e Pedidos ficam recolhidas no menu Ações do atendimento. Confirmações de sucesso aparecem pequenas ao lado do menu e somem em quatro segundos; erros/entrega incerta continuam visíveis. Enter envia e Shift+Enter permite nova linha; emojis substituem a seleção no cursor sem exceder o limite de texto. Menus fecham por Escape ou clique fora.

Envio manual usa somente URL, chave Evolution e o chip já vinculado à conversa; configurações de OpenAI/Redis e IA desligada não impedem envio humano. Instância não configurada, telefone ausente, operador inativo ou conversa não assumida impedem envio. “Validar canal” consulta a conexão da Evolution sem enviar mensagens e informa configuração ausente, chave recusada ou chip desconectado sem expor segredos.

Atendente pode enviar texto, imagem JPG/PNG/WebP com legenda de até 1024 caracteres ou áudio WebM/Ogg/MP4/MP3/WAV, até 2 MB. O servidor valida tamanho real, base64, tipo e assinatura; não aceita URL remota ou SVG. Microfone pede permissão somente ao clicar, exige navegador compatível em HTTPS/localhost, limita gravação a 60 segundos e libera as faixas ao parar/sair. Permite ouvir o áudio e conferir a imagem antes de clicar em Enviar. Áudio e texto são envios separados. Cancelar/remover anexo não envia nada. Falha incerta preserva rascunho, anexo e chave e não reenvia automaticamente. Arquivos transitam em memória para a Evolution; CRM armazena apenas marcador de imagem/áudio e legenda, sem binário ou link da mídia. Reprodução do arquivo enviado permanece no WhatsApp.

Follow-ups/agendamentos preservados usam texto humano. Configure retomadas institucionais; não fixe preços ou promessas de estoque nesses textos.

## Campanhas e central de mensagens agendadas

Campanhas são exclusivas de gerentes e proprietários. Nome, chip configurado, mensagem e seleção de destinatários são validados no servidor. Só números com mensagem recebida no chip selecionado são elegíveis; cadastro manual, saída anterior ou histórico de outro telefone/chip não bastam. O telefone é fixado no destinatário e conferido novamente antes de cada envio. Trocar o telefone de um contato não libera o novo número.

Nova campanha permite selecionar contatos individualmente ou toda a base elegível, buscar nome/telefone, conferir texto/anexo e salvar como rascunho sem envio. Aceita um JPG/PNG, MP3/OGG ou PDF de até 2 MB, com assinatura e tamanho validados no servidor. Texto com anexo visual/PDF admite legenda de até 1.024 caracteres. Iniciar exige confirmação bloqueada por três segundos. Resultados ficam disponíveis por destinatário; cancelar campanha só cancela destinatários ainda pendentes. Reservas iniciadas podem terminar. Cada chip respeita intervalo mínimo de dez segundos entre reservas de campanhas. Entrega incerta não é reenviada automaticamente, inclusive quando apenas parte de texto/áudio foi aceita.

As actions carregarCampanhas, gravarCampanha, iniciarCampanha, cancelarCampanha e detalharCampanha aplicam sessão e permissão administrativa. Campanhas permanecem no PostgreSQL com auditoria e versões. O processador existente executa a fila mesmo sem IA, quando ativado no servidor. Agendamentos individuais mantêm sua configuração Evolution e seus registros anteriores.

carregarFilaMensagens lista campanhas iniciadas, envios individuais e somente a próxima etapa realmente enfileirada de cada follow-up. Não lista etapas futuras como agendadas. Data de campanha vem identificada como horário previsto. A central oferece busca por telefone/chip/conteúdo/origem, filtros de status/origem, paginação, seleção de registros e de todo o filtro. Acesso à lixeira e menus de três pontos não dependem do recorte visível da tabela.

alterarFilaMensagens atua na fila real. Cancelar um destinatário não cancela os demais. Cancelar ou mover um follow-up para a lixeira encerra o acompanhamento atual daquele contato, com aviso na confirmação. Mensagens em envio são recusadas; enviadas não são recolhidas. Lixeira cancela pendências e preserva histórico; restauração recupera só a visualização, sem reativar nenhum envio. Versão divergente recusa a alteração. Confirmações mostram o total elegível e resultados informam sucessos, falhas e casos sem confirmação, sem presumir sucesso integral. Todos do filtro abrange todas as páginas; lotes grandes são divididos em requisições de até 5.000 registros.

Consultas administrativas de lixeira incluem removidos explicitamente; processadores continuam usando somente vivos. Mutações SQL e auditoria são atômicas. Follow-ups usam a trava do agente e comparação da versão Redis; remoção da fila, arquivo cancelado e auditoria aplicada são atômicos no Redis, com intenção previamente registrada no PostgreSQL. Restaurar nunca reenfileira. Redis indisponível sinaliza lista parcial e bloqueia operações sobre todos do filtro. Não se usam contatos reais em testes. Ver ADR 0017.

## Indicadores e privacidade

A listagem de contatos mostra até 150 registros recentes e informa o total de cadastros vivos, sem impor limite de armazenamento. Conversas apresentam lista de contatos, nome, foto quando disponível (iniciais como alternativa), prévia e canal à esquerda, e histórico com resposta manual à direita. No celular, as duas áreas alternam com retorno à lista. Atualização ocorre a cada dez segundos e por botão; mensagens novas não deslocam a leitura de quem subiu no histórico. Mantêm-se 50 conversas recentes e 50 mensagens por conversa, com indicação desse recorte. O componente visual em src/components/conversas não depende da farmácia e pode ser reutilizado nos outros sistemas com seus próprios adaptadores de dados e envio. Não implanta mudanças automaticamente em outros repositórios.

Fotos são URLs HTTPS recebidas nos eventos contacts.upsert/contacts.update da Evolution pelo webhook autenticado da instância. Atualizam somente contatos vivos já vinculados ao canal; LID sem telefone não é inferido, URL inválida é ignorada e repetição não reaudita a mesma foto. A alteração tem trava por versão e auditoria na mesma transação. O navegador exibe a imagem sem enviar referência; URL expirada ou foto ausente usa iniciais. Não baixa mídia nem cria contatos apenas para foto. Após implantação, sincronizar o webhook pelo painel inclui os dois eventos de contato.

Dashboard usa dados persistidos. Faturamento = vendas confirmadas não canceladas, não liquidação bancária ou escrituração fiscal. Atendimentos IA = conversas distintas com saída bot. Consultas agrupam evento sem multiplicar por apresentações.

O dashboard inicia em Hoje e oferece Ontem, 7, 15, 30 dias (incluindo hoje) e Período selecionado com calendário de início/fim e botão Aplicar, até 366 dias. Dias seguem Brasília, do início inclusive até a meia-noite seguinte ao último dia exclusive. Pedidos criados e pendentes usam created_at; vendas, faturamento e ranking usam confirmado_em; consultas usam created_at e atendimentos IA usam sent_at. Estoque mostra o saldo atual e não reconstrói posições históricas. Datas inválidas são recusadas no servidor; mudança de filtro remove os indicadores anteriores e respostas atrasadas não os restauram. A faixa “Todo o período · atualizado em” foi removida.

Autorização/validação no servidor; chaves privadas criptografadas. Pedidos não armazenam anexos de receita. Auditoria identifica operação/responsável sem copiar mensagens. Retenção, base legal, contratos com operadores e procedimentos sanitários precisam ser definidos pela operação antes da produção; não há certificação automática de conformidade.
