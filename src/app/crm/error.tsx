"use client";
export default function Erro({ reset }: { reset: () => void }) { return <main className="content"><p role="alert">Não foi possível carregar o CRM.</p><button onClick={reset}>Tentar novamente</button></main>; }
