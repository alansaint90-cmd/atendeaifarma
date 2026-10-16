# Padrao de Componentes

Como construir e organizar componentes nesta base. A IA DEVE seguir este padrao.
Arquivo-ouro de referencia: [`templates/component.tsx`](../templates/component.tsx).

## Identidade Atende AI

O componente compartilhado `Marca` em `src/components/marca.tsx` representa o robô
em vetor e o nome Atende AI, com variantes clara, grande e com slogan. O ícone da aba
fica em `src/app/icon.svg`. A fonte Inter é servida pelo próprio Next.js via
`next/font`. A paleta do kit (#6366F1, #8B5CF6, #06B6D4, #0F172A, #F3F4F6) e as
variantes de contraste ficam em `src/styles/marca.css`; os componentes shadcn usam
os tokens correspondentes de `src/styles/ui.css`. Verde e vermelho continuam
indicando sucesso e alerta, sem substituir estados por cores decorativas.

## Principio: Colocation (colocate first, extract later)

A camada visual compartilhada, importada no layout raiz, fica em
`src/styles/design-juliana.css`: roxo nas ações, botões em pílula, cartões de 16px
e campos de 48px. Abrange painel, agenda, conversas, chatbot, automações, tags,
CRM, equipe, configurações, perfil e entrada. Os tokens Tailwind/shadcn usam as
mesmas variáveis sem modificar os componentes vendorizados. As cores de status
e as cores de tags escolhidas pelo usuário mantêm seu significado. A rota
`/previa-design` compara essa camada com a aparência anterior usando dados fictícios
e o formulário real de paciente, sem gravar consultas. Só abre em desenvolvimento
com `ATENDEIA_PREVIA_LOCAL=true`. Execute `node scripts/previa-design-local.mjs`:
o iniciador neutraliza os valores dos arquivos de ambiente e desativa banco,
Redis, IA e worker. A prévia não altera a autenticação do painel e permanece
indisponível em produção. Não há alteração de regras, actions ou schema de dados.

Comece colocando o componente do lado de quem usa. So mova para uma pasta
compartilhada quando **2+ telas** realmente reusarem.

```
src/
  app/
    (app)/
      lancamentos/
        page.tsx                 # server component — busca dados, resolve RBAC
        _components/             # _ = pasta privada (fora do routing do Next)
          lancamentos-lista.tsx  # client — interativo
          lancamento-form.tsx
  components/
    ui/                          # genericos shadcn (Button, Card, Dialog...)
    modal-confirmacao-block.tsx  # compartilhado entre features
```

| Onde | O que vai |
|------|-----------|
| `app/<rota>/_components/` | Componentes usados SO por aquela rota |
| `components/ui/` | Primitivos genericos (shadcn/ui): Button, Input, Card |
| `components/` | Compartilhados entre features (ex.: ModalConfirmacaoBlock) |

## Server vs Client Components

- **Server Component (padrao)**: nao leva `"use client"`. Faz fetch de dados,
  resolve RBAC, repassa dados prontos via props. Nao tem estado nem efeito.
- **Client Component**: leva `"use client"` SO quando precisa de `useState`,
  `useEffect`, eventos (onClick), ou APIs de browser.

Regra: busque dados no server (page.tsx), passe via props para um client
component pequeno. Nao transforme a pagina inteira em client.

```tsx
// page.tsx (SERVER) — busca + RBAC
import { listar } from "@/lib/actions/contratos-lancamentos";
import { temPermissao } from "@/lib/auth/permissoes";
import { obterSessao } from "@/lib/auth/sessao";
import { LancamentosLista } from "./_components/lancamentos-lista";

export default async function Page() {
  const sessao = await obterSessao();
  const itens = await listar();
  return <LancamentosLista itens={itens} podeExcluir={temPermissao(sessao, "admin")} />;
}
```

## Convencoes de Nomenclatura

| Item | Convencao | Exemplo |
|------|-----------|---------|
| Arquivo de componente | kebab-case | `lancamento-form.tsx` |
| Nome do componente | PascalCase | `LancamentoForm` |
| Export | nomeado (nunca default em feature) | `export function LancamentoForm()` |
| Props | interface `<Componente>Props` | `interface LancamentoFormProps` |
| Hook | camelCase com `use` | `useLancamentos` |
| 1 arquivo | 1 componente | — |

> Excecao: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` usam `export default` (exigencia do Next).

## Tipagem de Props

- SEMPRE interface explicita. NUNCA `any`.
- Reusar tipos do schema Drizzle (`$inferSelect`) em vez de redefinir.

```tsx
import type { ContratoLancamento } from "@/lib/db/schema/contratos-lancamentos";

interface Props {
  itens: ContratoLancamento[];
  podeExcluir: boolean;
}
```

## Estados Obrigatorios

Todo componente que carrega ou envia dados trata os 4 estados:

| Estado | Como |
|--------|------|
| Carregando | skeleton ou spinner (`loading.tsx` no server, `useState` no client) |
| Vazio | mensagem clara ("Nenhum lancamento") |
| Erro | `error.tsx` (server) ou `r.erro` da action exibido na tela (client) — nunca `alert()` |
| Sucesso | render normal |

## Acoes Criticas: Modal com Block 3s

Excluir, salvar lancamento, qualquer acao irreversivel/sensivel passa por
`<ModalConfirmacaoBlock>`: bloqueia 3s, nao fecha por ESC/click-fora, mostra
resumo do que vai acontecer. Ver `templates/component.tsx`.

## shadcn/ui

- Primitivos vem de `components/ui/` (instalados via `npx shadcn@latest add`).
- NUNCA editar a logica interna de um primitivo shadcn para uma feature —
  componha por cima ou estenda via props/className.
- Estilizar com Tailwind + `cn()` helper. Tema dark por padrao.

## Acessibilidade (minimo)

- Todo `<button>` tem texto ou `aria-label`.
- Todo input tem `<label>` associado.
- Foco visivel; modais prendem o foco (focus trap).
- Contraste AA.

## Checklist do Componente

- [ ] Server por padrao? `"use client"` so se precisa de estado/evento?
- [ ] Export nomeado + PascalCase + 1 por arquivo?
- [ ] Props com interface explicita (sem `any`)?
- [ ] Tipos reaproveitados do schema Drizzle?
- [ ] Estados carregando/vazio/erro/sucesso tratados?
- [ ] Acao critica com ModalConfirmacaoBlock (3s)?
- [ ] Genericos em `ui/`, feature-only em `_components/`?
- [ ] Acessibilidade minima (labels, foco, contraste)?
- [ ] Teste do caminho critico (ver `templates/component.test.tsx`)?
