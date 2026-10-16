export const nomeCookieSessao = () => process.env.NODE_ENV === "production" ? "__Host-atendefarma-sessao" : "atendefarma-sessao";
export const nomeCookieDesafio = () => process.env.NODE_ENV === "production" ? "__Host-atendefarma-desafio" : "atendefarma-desafio";
export const opcoesCookie = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge });
