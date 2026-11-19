/** Exclusão visual usa o schema ativo e não pode contornar versão, papel ou auditoria. */
export function regrasConversas(rel, content) {
  const regras = [
    ["src/lib/operacao/apagar-conversa.ts", [/z.strictObject/, /autorizar\(tx, sessao, "admin"\)/, /banco.transaction/, /FOR UPDATE/, /version=\$\{dados.version\}/, /marcaDeExclusao\(autor\)/, /status='enviando'/, /INSERT INTO atendeia_audit_logs/]],
    ["src/components/operacao/acoes-conversa.tsx", [/ModalConfirmacaoBlock/, /definirConfirmacao\(\{ id, version \}\)/, /executando.current/, /Mais opções da conversa/]],
    ["src/lib/agent/worker.ts", [/conversaApagadaAposMensagem/, /dependencies.apagada\(instancia, message.number, message.timestamp, message.identity\)/, /dependencies.apagada\(instancia, job.number, job.started \/ 1000, job.identity\)/]],
  ];
  return regras.filter(([arquivo, obrigatorios]) => arquivo === rel && obrigatorios.some(re => !re.test(content)))
    .map(() => ({ level: "error", id: "conversa-exclusao-segura", file: rel, line: 1, msg: "Preserve confirmação, papel atual, versão, auditoria e bloqueio de eventos anteriores à exclusão." }));
}
