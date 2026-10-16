import { db as obterBanco } from "./client";

/** Adaptador da base: mantém a conexão única e preguiçosa já usada pelo Atende AI. */
type Banco = ReturnType<typeof obterBanco>;
export const db = new Proxy({} as Banco, {
  get(_alvo, propriedade) {
    const banco = obterBanco();
    const valor = Reflect.get(banco, propriedade);
    return typeof valor === "function" ? valor.bind(banco) : valor;
  },
});
export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];
