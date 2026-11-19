/** Guardas estruturais complementares; os testes exercitam os contratos reais. */
export function regrasCampanhas(rel, content) {
  const regras = [
    ["src/lib/farmacia/campanhas/repository.ts", "campanha-elegibilidade", [ /m.direction='inbound'/, /c.remote_jid=\(substring\(p.phone/, /ch.instance_name=\$\{instancia\}/, /p.telefone === item.telefone/, /pg_advisory_xact_lock/, /d.version=\$\{item.version\}/, /now\(\)-c.intervalo_segundos\*interval '1 second'/, /proximo_envio=now\(\)\+intervalo_segundos\*interval '1 second'/ ]],
    ["src/lib/farmacia/campanhas/schema.ts", "campanha-intervalo", [/min\(5,/, /max\(3600,/, /default\(10\)/]],
    ["src/lib/agendamentos/fila-followups.ts", "fila-followup-real", [ /zrange\(followupQueue/, /job.status==="enviando"/, /XADD/, /ZREM/, /agentKeys.lock/ ]],
    ["src/lib/agendamentos/fila-repository.ts", "fila-restauracao-segura", [ /item.status==="enviando"/, /item.status==="pendente"\?"cancelado":item.status/, /version=version\+1/, /exigirGestorCampanha/ ]],
    ["src/lib/evolution/config-envio.ts", "envio-configuracao-estrita", [ /instanciasConfiguradas\(settings\).includes\(instancia\)/, /EVOLUTION_API_URL:settings.EVOLUTION_API_URL/, /EVOLUTION_INSTANCE_NAME:instancia/ ]],
  ];
  return regras.filter(([caminho, , obrigatorios]) => caminho === rel && (obrigatorios.some(re => !re.test(content)) || (rel.endsWith("fila-followups.ts") && /\bzadd\b|\bZADD\b/.test(content))))
    .map(([, id]) => ({ level: "error", id, file: rel, line: 1, msg: "Preserve elegibilidade por número/chip, fila real, versão e restauração sem reenvio." }));
}
