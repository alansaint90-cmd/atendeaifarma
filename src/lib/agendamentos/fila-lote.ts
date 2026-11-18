import { ErroDeNegocio } from "../acao";
import type { AlvoFila } from "./fila-schema";
/** Cada registro tem sua própria trava e transação; nunca anuncia êxito global em falha parcial. */
export async function aplicarLoteFila(alvos:AlvoFila[],alterar:(alvo:AlvoFila)=>Promise<void>){
 let alterados=0;const falhas:string[]=[];
 for(const alvo of alvos){try{await alterar(alvo);alterados++;}catch(e){falhas.push(e instanceof ErroDeNegocio?e.message:"Um registro não pôde ser alterado. Atualize a lista.");}}
 return {alterados,naoAlterados:falhas.length,avisos:[...new Set(falhas)]};
}
