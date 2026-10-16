# Frontend

Padrao de componentes em `docs/components.md`. Aqui: rotas e protecao.

## Rotas

```
src/app/
  layout.tsx
  (publico)/
    entrar/page.tsx          # login
  (app)/                     # area autenticada
    layout.tsx               # confere a sessao e redireciona
    painel/page.tsx
    lancamentos/
      page.tsx
      loading.tsx
      error.tsx
      _components/
  api/                       # so webhook/integracao/cron — nunca CRUD da tela
```

O nome entre parenteses e **grupo de rotas**: some da URL. `/(app)/painel` responde em
`/painel`. Por isso nenhum codigo pode testar `pathname.startsWith("/(app)")` — isso
nunca e verdade.

## Protecao — tres camadas, nenhuma sozinha

1. **Layout da area** (`(app)/layout.tsx`): chama `obterSessao()` e redireciona para
   `/entrar` quando nao ha sessao. Da conforto de navegacao.
2. **Pagina e action**: cada `page.tsx` e cada Server Action conferem sessao e
   permissao por conta propria. Esta e a defesa real — Server Action nao passa por
   layout nem por proxy.
3. **Proxy** (arquivo `proxy.ts` dentro de `src`; em versoes antigas do Next, `middleware.ts`): opcional,
   so para redirecionar cedo. Conferir se o cookie *existe* nao e checagem de sessao.

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";

export default async function AreaAutenticada({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  return <>{children}</>;
}
```

## Regras

- Server Component por padrao; `"use client"` so com estado ou evento.
- Mutacao por Server Action, nunca por `fetch` para rota propria.
- Toda acao assincrona: botao desabilitado enquanto processa, erro visivel na tela.
- Acao critica: `ModalConfirmacaoBlock` (3 s).
- Mobile-first; tabela com rolagem horizontal no celular.
- Mensagens em PT-BR, claras, sem detalhe tecnico.
