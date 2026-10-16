import type { Turn } from "./providers";

const perguntaNome = /(?:qual\s+(?:(?:é|e)\s+)?(?:o\s+)?seu\s+nome|como\s+(?:posso|devo)\s+(?:te|lhe)\s+chamar|como\s+(?:você\s+)?prefere\s+ser\s+chamad[oa])/iu;
const marcadorNome = /\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/giu;
const palavrasQueNaoSaoNome = new Set([
  "oi", "olá", "ola", "sim", "não", "nao", "obrigado", "obrigada", "quero", "gostaria",
  "preciso", "tenho", "estou", "pode", "bom", "boa", "tudo", "qual", "como", "vou",
  "talvez", "mentoria", "atendimento", "sou", "meu", "minha", "vocês", "voces",
]);

function nomeValido(valor: string): string | null {
  const candidato = valor.trim().replace(/[.!?]+$/u, "").trim().replace(/\s+/gu, " ");
  if (candidato.length < 2 || candidato.length > 80 ||
    !/^[\p{L}][\p{L}'’\-]*(?:[ -][\p{L}][\p{L}'’\-]*){0,3}$/u.test(candidato)) return null;
  if (palavrasQueNaoSaoNome.has(candidato.split(" ")[0].toLocaleLowerCase("pt-BR"))) return null;
  return candidato;
}

export function extrairNomeInformado(texto: string, historico: Turn[]): string | null {
  const apresentacao = texto.match(/\b(?:meu nome (?:é|e)|me chamo|pode me chamar de)\s+([^\n,.!?]{2,80})/iu);
  if (apresentacao) {
    const trecho = apresentacao[1].split(/\s+(?:e|mas|quero|preciso|gostaria)\b/iu)[0];
    return nomeValido(trecho);
  }
  const ultima = historico.at(-1);
  if (ultima?.role !== "assistant" || !perguntaNome.test(ultima.content)) return null;
  const resposta = texto.replace(/^sou\s+/iu, "").replace(/^pode me chamar de\s+/iu, "");
  return nomeValido(resposta);
}

export function instrucoesComNome(instrucoes: string, nome: string | null, primeiroContato: boolean) {
  if (nome) return `${instrucoes}\n\nNome confirmado pelo próprio cliente: ${nome}. Use o primeiro nome naturalmente nesta resposta. Substitua qualquer marcador de nome pelo nome confirmado.`;
  return `${instrucoes}\n\n${primeiroContato ? "Na primeira resposta, apresente-se e pergunte o nome do cliente antes de avançar na conversa." : "O nome do cliente ainda não foi confirmado; pergunte como ele prefere ser chamado."} Nunca envie marcadores de modelo ao cliente.`;
}

export function respostaComNome(resposta: string, nome: string | null): string {
  if (!nome) {
    const limpa = resposta.split("\n").filter(linha => !/\[(?:NOME|NOME DO CLIENTE)\]|\{NOME\}/iu.test(linha)).join("\n").trim();
    const texto = limpa || "Olá! 😊 Seja bem-vindo(a).";
    return perguntaNome.test(texto) ? texto : `${texto}\n\nAh, antes de começarmos, qual é o seu nome?`;
  }
  const tratamento = nome.split(" ")[0];
  const preenchida = resposta.replace(marcadorNome, tratamento).trim();
  return preenchida;
}

export function personaDoAgente(instrucoes: string): string | null {
  return instrucoes.match(/^Persona:\s*(.+?)\s*\([^\n]*\)$/mu)?.[1]?.trim() ?? null;
}

export function mesmoNome(nome: string | null, outro: string | null): boolean {
  const normalizar = (valor: string) => valor.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR");
  return !!nome && !!outro && normalizar(nome) === normalizar(outro);
}

export function removerRotuloDaPersona(resposta: string, persona: string | null): string {
  if (!persona) return resposta;
  const rotulo = resposta.match(/^\s*([^,:\n]+)[,:]\s*/u);
  return rotulo && mesmoNome(rotulo[1], persona) ? resposta.slice(rotulo[0].length) : resposta;
}
