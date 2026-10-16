"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="panel"><h1>Não foi possível abrir esta tela</h1><p>Seus dados salvos no navegador não foram apagados.</p><button className="primary" onClick={reset}>Tentar novamente</button></main>;
}
