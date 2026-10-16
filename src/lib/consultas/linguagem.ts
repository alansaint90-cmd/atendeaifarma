/** Normalização determinística; não inventa números ausentes na fala. */
export const textoSimples = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const unidades: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };
export function numerosDaFala(texto: string): string {
  const palavras = Object.keys(unidades).join("|");
  const parte = `(?:${palavras}|mil)`;
  return textoSimples(texto).replace(new RegExp(`\\b${parte}(?:(?:\\s+e\\s+|\\s+)${parte})*\\b`, "g"), trecho => {
    const tokens = trecho.split(/\s+(?:e\s+)?/u);
    let total = 0, grupo = 0, anterior = Infinity;
    for (const token of tokens) {
      if (token === "mil") { total += (grupo || 1) * 1000; grupo = 0; anterior = Infinity; continue; }
      const valor = unidades[token];
      // Sequências ditadas dígito a dígito não são somas: “um sete” = “1 7”.
      if (valor >= anterior || anterior < 20) return tokens.map(p => unidades[p] ?? p).join(" ");
      grupo += valor; anterior = valor;
    }
    return String(total + grupo);
  });
}
export const meses = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function dataNumerica(texto: string): string {
  const entrada = numerosDaFala(texto).replace(/[.!]$/u, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(entrada)) return entrada;
  const numerica = entrada.match(/^(\d{1,2})(?:\s*[/.-]\s*|\s+(?:(?:de|do)\s+)?)(\d{1,2})(?:\s*[/.-]\s*|\s+(?:de\s+)?)(\d{4})$/u);
  const extensa = entrada.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})$/u);
  const partes = numerica ?? (extensa && meses.includes(extensa[2]) ? ["", extensa[1], String(meses.indexOf(extensa[2]) + 1), extensa[3]] : null);
  return partes ? `${partes[3]}-${partes[2].padStart(2, "0")}-${partes[1].padStart(2, "0")}` : entrada;
}
