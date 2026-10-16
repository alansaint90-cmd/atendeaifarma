# ADR-0012: Configuração vigente e transferência humana

Status: aceito. Complementa ADR-0003 e ADR-0011.

O painel já persistia a configuração por instância, mas o histórico curto reenviava
apresentações da persona antiga e não havia prioridade explícita para os campos
atuais. A opção de transferência era apenas uma instrução textual.

As instruções atuais têm prioridade explícita. Cada fala concluída recebe o hash
das instruções; somente falas da IA com a mesma revisão são reenviadas ao modelo.
Falas do cliente e histórico persistido são preservados. A revisão é metadado local,
removido no adaptador OpenAI. Falas legadas da IA sem revisão ficam fora do contexto.

A transferência habilitada expõe uma função sem argumentos, com schema estrito,
na Responses API. O modelo não escolhe destinatário nem texto: o servidor usa os
valores salvos do chatbot. Imagens e documentos habilitados dispensam geração.
A conversa é encaminhada ao departamento em transação com versão e auditoria;
o Redis grava a pausa de 30 minutos e cancela follow-up sob a lease existente.
O aviso cadastrado só é enviado depois dessas operações. Falha interrompe a saída;
o checkpoint de envio evita repetição automática em quedas ou entrega incerta.

Banco e Redis não constituem transação distribuída: falha intermediária pode
exigir intervenção, sem confirmação falsa ao contato. Nenhuma chamada real a
WhatsApp é feita nos testes. O CI cobre a pausa e o isolamento com Redis local.

Referência: [Function calling na Responses API](https://developers.openai.com/api/docs/guides/function-calling).
