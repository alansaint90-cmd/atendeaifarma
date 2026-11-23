/** Exclusão visual usa o schema ativo e não pode contornar versão, papel ou auditoria. */
export function regrasConversas(rel, content) {
  const regras = [
    ["src/lib/farmacia/atendimento.ts", [/alterarPausaSchema=z.strictObject/, /c.version=\$\{dados.version\}/, /ai_resumed_at=CASE/, /ia_despausada_no_painel/]],
    ["src/lib/agent/pausa.ts", [/duracaoPausaManual > retomadaEm/, /aliasKey\(conversation\)/]],
    ["src/lib/farmacia/agente.ts", [/normalizarPedido\(texto\)/, /etapa:"revisar"/, /candidatos.length!==1/, /if\(intencao.acao==="criar_pedido"\)/]],
    ["src/lib/farmacia/pedidos.ts", [/ajustarQuantidade\?i.quantidade/, /ultima\?\.tipo==="revisar"/, /itens_corrigidos/, /await travarEstoque\(tx\)/]],
    ["src/lib/farmacia/pagamento.ts", [/comprovante_pix/, /endereco_entrega/, /travarEstoque\(tx\)/, /conversa_id=\$\{v.conversaId\}/, /await evento\(tx/, /FARMACIA_PIX_CHAVE/, /99999999\. Não faça transferência/, /comprovante de teste/]],
    ["src/lib/operacao/estado-ia.ts", [/agentKeys.heartbeat/, /portas.pausada/, /conversa.assumida/, /instancias.includes/, /catch[\s\S]*indisponivel/]],
    ["src/lib/farmacia/configuracao-agente.ts", [/perguntarNome = false/, /openingMessages = undefined/, /Farmácia WE/]],
    ["src/lib/operacao/atribuir-ia.ts", [/z.strictObject/, /banco.transaction/, /FOR UPDATE OF c/, /ON CONFLICT DO NOTHING RETURNING id/, /mensagem_ia_registrada/, /version=\$\{conversa.version\}/, /if \(!origemId\) return/]],
    ["src/lib/farmacia/audio-historico.ts", [/autorizar\(tx, ator, "operador"\)/, /m.is_deleted=false AND c.is_deleted=false/, /configurarCanalManual/, /jsonLimitado/, /redirect: "error"/, /bytes.toString\("base64"\)/]],
    ["src/app/api/farmacia/audio/[id]/route.ts", [/administradorHttp\("operador"\)/, /private, no-store/, /nosniff/]],
    ["src/lib/operacao/excluir-contato.ts", [/z.strictObject/, /autorizar\(tx, sessao, "admin"\)/, /banco.transaction/, /travarTelefoneContato\(tx, identidade.telefone\)/, /FOR UPDATE/, /version=\$\{dados.version\}/, /marcaDeExclusao\(autor\)/, /e.status='enviando'/, /INSERT INTO atendeia_audit_logs/]],
    ["src/components/operacao/acoes-contato.tsx", [/ModalConfirmacaoBlock/, /definirConfirmacao\(\{ id, version \}\)/, /executando.current/, /Excluir contato/]],
    ["src/lib/operacao/apagar-conversa.ts", [/z.strictObject/, /autorizar\(tx, sessao, "admin"\)/, /banco.transaction/, /FOR UPDATE/, /version=\$\{dados.version\}/, /marcaDeExclusao\(autor\)/, /status='enviando'/, /INSERT INTO atendeia_audit_logs/]],
    ["src/components/operacao/acoes-conversa.tsx", [/ModalConfirmacaoBlock/, /definirConfirmacao\(\{ id, version \}\)/, /executando.current/, /Mais opções da conversa/]],
    ["src/lib/agent/worker.ts", [/conversaApagadaAposMensagem/, /dependencies.apagada\(instancia, message.number, message.timestamp, message.identity\)/, /dependencies.apagada\(instancia, job.number, job.started \/ 1000, job.identity\)/]],
  ];
  return regras.filter(([arquivo, obrigatorios]) => arquivo === rel && obrigatorios.some(re => !re.test(content)))
    .map(() => ({ level: "error", id: "conversa-exclusao-segura", file: rel, line: 1, msg: "Preserve confirmação, papel atual, versão, auditoria e bloqueio de eventos anteriores à exclusão." }));
}
