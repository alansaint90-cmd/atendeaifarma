import type { CellValue } from "exceljs";
import { limiteImportacao, linhaImportacaoSchema, type LinhaImportacao } from "./importacao-validacao";

export const colunasPlanilha = ["Nome", "Concentração", "Apresentação", "Preço", "Quantidade", "Lote", "Validade",
  "Exige receita", "Controle especial", "SKU", "EAN", "Unidades por embalagem", "Princípio ativo", "Fabricante", "Medicamento"];
const normalizar = (v:string) => v.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function texto(v:CellValue):string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") throw new Error("Use valores simples, sem fórmulas, links ou objetos.");
  return String(v).trim();
}
function booleano(v:string, padrao?:boolean) {
  const valor = normalizar(v);
  if (!valor && padrao !== undefined) return padrao;
  if (["sim","true","1"].includes(valor)) return true;
  if (["nao","false","0"].includes(valor)) return false;
  throw new Error("Preencha Exige receita e Medicamento com Sim ou Não.");
}
function data(v:CellValue):string|null {
  if (v instanceof Date) return v.toISOString().slice(0,10);
  const valor = texto(v);
  if (!valor) return null;
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : valor;
}
export interface PreviaPlanilha { linhas:LinhaImportacao[]; erros:string[] }
export async function lerPlanilha(arquivo:ArrayBuffer):Promise<PreviaPlanilha> {
  if (arquivo.byteLength > 2*1024*1024) throw new Error("O arquivo deve ter até 2 MB.");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(arquivo); }
  catch { throw new Error("Não foi possível ler o Excel. Use um arquivo .xlsx válido e sem senha."); }
  if (wb.worksheets.length !== 1) throw new Error("Use apenas uma aba por arquivo, seguindo o modelo.");
  const aba = wb.worksheets[0];
  if (aba.rowCount > limiteImportacao+1 || aba.columnCount > colunasPlanilha.length) throw new Error(`Use até ${limiteImportacao} produtos e as colunas do modelo.`);
  const indices = colunasPlanilha.map(nome => {
    const encontrados:number[] = [];
    aba.getRow(1).eachCell((celula,coluna) => { if (normalizar(texto(celula.value)) === normalizar(nome)) encontrados.push(coluna); });
    if (encontrados.length !== 1) throw new Error(`Coluna ausente ou repetida: ${nome}. Use o modelo.`);
    return encontrados[0];
  });
  const linhas:LinhaImportacao[] = [], erros:string[] = [];
  for (let numero=2; numero<=aba.rowCount; numero++) {
    const valores = indices.map(i => aba.getRow(numero).getCell(i).value);
    if (valores.every(v => v === null || v === undefined || v === "")) continue;
    try {
      const valor = (i:number) => texto(valores[i]);
      const r = linhaImportacaoSchema.safeParse({linha:numero,nome:valor(0),concentracao:valor(1),apresentacao:valor(2),preco:valor(3),
        quantidade:valor(4) ? Number(valor(4)) : NaN,lote:valor(5),validade:data(valores[6]),receita:booleano(valor(7)),
        controle:valor(8),sku:valor(9),ean:valor(10)||null,embalagem:valor(11) ? Number(valor(11)) : 1,
        principio:valor(12),fabricante:valor(13),medicamento:booleano(valor(14),true)});
      if (!r.success) { erros.push(`Linha ${numero}: ${r.error.issues.map(e => `${e.path.join(" ")}: ${e.message}`).join("; ")}`); continue; }
      linhas.push(r.data);
    } catch (erro) { erros.push(`Linha ${numero}: ${erro instanceof Error ? erro.message : "Conteúdo inválido."}`); }
  }
  if (!linhas.length && !erros.length) erros.push("A planilha está vazia. Preencha os produtos abaixo do cabeçalho.");
  return {linhas,erros};
}
export async function modeloPlanilha():Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Produtos");
  aba.addRow(colunasPlanilha);
  aba.getRow(1).font = {bold:true,color:{argb:"FFFFFFFF"}};
  aba.getRow(1).fill = {type:"pattern",pattern:"solid",fgColor:{argb:"FF7133DB"}};
  aba.getRow(1).height = 32;
  aba.views = [{state:"frozen",ySplit:1}];
  const notas = ["Nome comercial obrigatório.","Ex.: 500 mg.","Obrigatória. Ex.: caixa com 10 comprimidos.",
    "Preço por embalagem. Ex.: 8,90. Sem fórmulas.","Número inteiro de embalagens. Zero cadastra sem saldo.",
    "Obrigatório quando a quantidade for maior que zero.","DD/MM/AAAA ou data do Excel. Obrigatória para medicamento com estoque.",
    "Obrigatório: Sim ou Não. Confira a classificação do produto.","Preencha se houver controle especial.",
    "Opcional. Gerado automaticamente quando vazio.","Opcional. Formate como texto para preservar zeros.",
    "Opcional. Padrão 1.","Opcional.","Opcional.","Sim ou Não. Quando vazio, considera medicamento."];
  colunasPlanilha.forEach((_,i) => {
    aba.getColumn(i+1).width = [0,2].includes(i) ? 35 : 24;
    aba.getCell(1,i+1).note = notas[i];
    aba.getColumn(i+1).numFmt = "@";
  });
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer).buffer;
}
