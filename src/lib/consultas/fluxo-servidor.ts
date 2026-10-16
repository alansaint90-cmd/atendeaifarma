import type Redis from "ioredis";
import type { IncomingMessage } from "../agent/message";
import { agentKeys, owned, assertResult } from "../agent/redis";
import { db } from "../db/client";
import { systemUserId } from "../db/bootstrap";
import { conduzirCadastro, type CadastroConsulta } from "./fluxo";
import { consultarHorarios, reservarConsulta } from "./repository";
import { proximasQuintas } from "./calendario";
import type { HorarioConsulta } from "./schema";
import type { AgentConfig } from "../agent/config";
import { extrairCamposCadastro } from "./extracao";

export function cadastroDaConversa(client: Redis, token: string, mensagem: IncomingMessage, instancia: string, ativo: () => Promise<boolean>, config: AgentConfig) {
  const chave = `atendeia:{evolution}:cadastro-consulta:${mensagem.conversation}`;
  return (texto: string, iniciar: boolean) => conduzirCadastro({
    ativo,
    extrair: (texto, campos) => extrairCamposCadastro(config, texto, campos),
    ler: async () => { const valor = await client.get(chave); return valor ? JSON.parse(valor) as CadastroConsulta : null; },
    salvar: async dados => {
      await assertResult(await client.eval(owned + "redis.call('SET', KEYS[2], ARGV[2], 'EX', 86400); return 1",
        2, agentKeys.lock, chave, token, JSON.stringify(dados)));
    },
    vagas: async (diaSolicitado, depoisDe) => {
      const dias = diaSolicitado ? [diaSolicitado, ...proximasQuintas(Date.parse(`${diaSolicitado}T12:00:00-03:00`) + 86400000)] : proximasQuintas();
      const vagas: HorarioConsulta[] = [];
      for (const dia of dias) {
        vagas.push(...(await consultarHorarios(db(), dia)).filter(v => v.disponivel && (!depoisDe || v.inicio > depoisDe)));
        if (vagas.length >= 6) break;
      }
      return vagas.slice(0, 6);
    },
    reservar: (dados, identidade) => reservarConsulta(db(), dados, { instancia, origem: mensagem.conversation,
      identidade: `whatsapp:${mensagem.conversation}:${identidade}`, autor: systemUserId }),
  }, mensagem.identity, texto, iniciar);
}
