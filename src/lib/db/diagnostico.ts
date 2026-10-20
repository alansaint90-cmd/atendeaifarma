export type EtapaPreparacaoBanco = "arquivos_migracoes" | "conexao_transacao" | "configuracao_transacao" | "trava_migracoes" | "estrutura_base" | "historico_migracoes" | "aplicacao_migracao" | "registro_migracao" | "dados_sistema" | "conclusao_transacao";

const descricoes = {
  ENOENT: "Arquivo de migração ausente na imagem.",
  EACCES: "Sem permissão para ler os arquivos de migração.",
  ENOTFOUND: "Endereço do PostgreSQL não encontrado.",
  EAI_AGAIN: "Falha temporária ao resolver o endereço do PostgreSQL.",
  ECONNREFUSED: "Conexão com PostgreSQL recusada.",
  ECONNRESET: "Conexão com PostgreSQL interrompida.",
  ETIMEDOUT: "Tempo de conexão com PostgreSQL excedido.",
  CONNECT_TIMEOUT: "Tempo de conexão com PostgreSQL excedido.",
  CONNECTION_CLOSED: "Conexão com PostgreSQL encerrada.",
  CONNECTION_ENDED: "Conexão com PostgreSQL encerrada.",
  "28P01": "Autenticação recusada pelo PostgreSQL.",
  "28000": "Acesso recusado pelas regras de autenticação do PostgreSQL.",
  "3D000": "Banco configurado não encontrado.",
  "42501": "Permissão insuficiente no PostgreSQL.",
  "42P01": "Tabela necessária não encontrada.",
  "42703": "Coluna necessária não encontrada.",
  "42P07": "Objeto de migração já existe.",
  "23503": "Referência obrigatória dos dados de sistema inválida.",
  "23505": "Conflito de unicidade ao preparar o banco.",
  "55P03": "Tempo de espera por uma trava do banco excedido.",
  "57014": "Execução cancelada ou limite de tempo da consulta excedido.",
  "53300": "Limite de conexões do PostgreSQL atingido.",
  "57P03": "PostgreSQL temporariamente indisponível.",
  MIGRACAO_ALTERADA: "Migração aplicada foi modificada. Crie uma nova migração.",
  NOME_MIGRACAO_INVALIDO: "Nome de migração inválido.",
  DESCONHECIDO: "Confira a conexão, as permissões e os logs do PostgreSQL.",
} as const;
type CodigoPreparacaoBanco = keyof typeof descricoes;

// Somente códigos conhecidos atravessam esta fronteira. Mensagem, consulta,
// parâmetros e cadeia original de erros podem conter credenciais.
export function codigoSeguroBanco(erro: unknown): CodigoPreparacaoBanco {
  let atual = erro;
  const visitados = new Set<object>();
  for (let nivel = 0; nivel < 10 && typeof atual === "object" && atual !== null; nivel++) {
    if (visitados.has(atual)) break;
    visitados.add(atual);
    if ("code" in atual && typeof atual.code === "string" && Object.hasOwn(descricoes, atual.code)) return atual.code as CodigoPreparacaoBanco;
    atual = "cause" in atual ? atual.cause : undefined;
  }
  return "DESCONHECIDO";
}

export class ErroPreparacaoBanco extends Error {
  constructor(readonly etapa: EtapaPreparacaoBanco, readonly codigoSeguro: CodigoPreparacaoBanco) {
    super(`Não foi possível preparar o banco. Etapa: ${etapa}. Código: ${codigoSeguro}. ${descricoes[codigoSeguro]}`);
    this.name = "ErroPreparacaoBanco";
  }
}
