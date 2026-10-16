# ADR-0010: Dois números com chatbot compartilhado

- Data: 2026-10-01
- Status: Parcialmente substituído pela ADR-0011 quanto ao compartilhamento do prompt.

## Decisão

A instância principal permanece em EVOLUTION_INSTANCE_NAME. O campo opcional
EVOLUTION_SECOND_INSTANCE_NAME habilita outro número na mesma Evolution, com a
mesma URL, chave de API e segredo de webhook. Vazio desativa o segundo número.
Ambos usam o chatbot selecionado pela instância principal; editar o prompt afeta
as próximas respostas dos dois. Não há cópia divergente do prompt.

O webhook autentica e valida a lista de instâncias antes de persistir/enfileirar.
O worker seleciona a instância do evento para transcrição e envio. Preservamos a
lease global e o processamento serial intercalado, sem criar outro worker. Os
identificadores existentes já separam instância/cliente e instância/ID, mantendo
históricos, nomes, deduplicação e pausa humana independentes.

Follow-ups continuam no repositório criptografado e auditado. O principal usa
FOLLOW_UP_CONFIG; o segundo usa FOLLOW_UP_SECOND_CONFIG. Cada revisão afeta apenas
o próprio chip. O job registra a instância e revalida a configuração antes do envio.
Jobs legados sem instância pertencem ao principal e precisam manter a revisão.
Renomear/remover um chip cancela seus jobs antigos; não transfere mensagens.

## Limites e validação

Não cria instâncias nem conecta QR automaticamente. O super administrador precisa
conectar o segundo WhatsApp na Evolution, salvar seu nome exato e sincronizar.
Agendamentos individuais continuam restritos ao chip principal nesta etapa.
Sem migração de tabelas: canais e conversas já têm escopo por instância.

Testes usam provedores simulados, persistência isolada e Redis descartável local
no banco 15. Cobrem mesmo cliente nos dois números, prompt compartilhado, pausa
separada, texto exato de follow-up, revisões, remoção e autenticação do webhook.
