# 0025 — Abas de telas com o `<Activity>` do React, montadas no layout

- **Status:** aceito
- **Data:** 2026-11-23
- **Quem decidiu:** técnico, na implementação (o comportamento das abas é do Bruno, [pedido de 23/11](../../transcricoes/2026-11-23-abas-como-no-vs-code.md))

**Atualização de 27/11/2026 (reunião de 26/11):** a mesma tela pode abrir em mais de uma aba (duplo clique numa tela já aberta abre "Contas a pagar (2)", com `?copia=2` no endereço). A aba é identificada por `tabKey` (tela e cópia), não mais só pela tela. Contas a pagar e a receber lembram o estado de cada aba depois do F5, no `sessionStorage` (`tabMemoryKey`).

## Contexto

O Bruno pediu abas como no VS Code: Contas a pagar e Contas a receber abertas ao mesmo tempo, cada uma guardando o que a pessoa fez (filtros, busca, seleção, o que foi digitado) até a aba fechar. No App Router, trocar de rota desmonta a tela e perde o estado dela. O Next 16 guarda o estado das rotas com `<Activity>`, mas só com `cacheComponents` ligado e só das **3 últimas** rotas: a mais antiga recomeça sozinha, o que não é "até eu fechar". As telas leem o endereço (`?modo=`, `?aba=`, `?busca=`, `?conta=`) e três delas usam esses valores como `key` de reinício.

## Decisão

O layout de `src/app/(app)` monta as abas por conta própria (`components/ScreenTabs.tsx`, regra pura em `lib/tabs.ts`):

- cada tela aberta é renderizada a partir de um mapa `PAGES` (as páginas carregadas com `lazy`), dentro de um `<Activity mode="visible|hidden">` com `key` = caminho da tela. O `children` do Next só aparece para um endereço que não é tela;
- a aba da frente é a do endereço atual; o endereço é a fonte da verdade, e as abas acompanham na mesma renderização (`sync`);
- cada aba recebe o próprio `?…` por contexto, e as telas leem com `useScreenSearchParams()` em vez de `useSearchParams()`: escondida, a tela continua vendo o endereço dela;
- a lista de abas fica no `sessionStorage` (por pessoa), para reabrir depois do F5; o estado das telas não é guardado;
- clique simples no menu = navegação comum (troca a tela da aba atual); duplo clique = `openInNewTab`. O clique simples espera 300 ms pelo segundo clique.

## Alternativas consideradas

- `cacheComponents: true` do Next: só 3 rotas, com despejo automático, e muda o modelo de renderização de todo o app (e da demonstração exportada). Não atende "até fechar".
- Guardar o estado de cada tela no `sessionStorage`: exigiria mexer em todos os `useState` das telas e não guarda o que está digitado nos campos.
- Um `iframe` por aba: cada aba seria um app inteiro, com a própria renovação de sessão (o refresh token gira e a reutilização derruba a sessão) e o cabeçalho que proíbe moldura.
- Várias abas da mesma tela: as telas leem o endereço global; ficou fora por decisão do Bruno (uma aba por tela).

## Consequências

- Trocar de aba não perde nada; a tela escondida para os efeitos dela (buscas, intervalos) e refaz quando volta para a frente, com os dados atualizados.
- Tela nova em `src/app/(app)` precisa entrar em `SCREENS` (`lib/tabs.ts`) e em `PAGES` (`ScreenTabs.tsx`); o TypeScript cobra o par.
- Proibido `useSearchParams` direto numa tela: use `useScreenSearchParams`. Efeito que muda estado a partir do endereço roda de novo a cada volta da aba e precisa de trava (ex.: `linkHandled` em `contas-a-pagar/page.tsx`).
- As telas abertas ficam todas montadas: no máximo uma por tela (11 hoje).
- As janelas (Dialog, AlertDialog e Sheet de `components/ui`) abrem dentro da aba (`lib/tab-portal.ts`): escondem e voltam com ela, com o que foi digitado. Com duas ou mais abas, a fileira fica presa no alto, as janelas abrem abaixo dela (`--abas-fim`, em `globals.css`) e clicar numa aba não fecha a janela (23/11, pedido do Bruno). A fileira leva `aria-live="off"` para o Radix não escondê-la dos leitores de tela com a janela aberta.
- Código: `frontend/src/lib/tabs.ts`, `frontend/src/components/ScreenTabs.tsx`, `frontend/src/app/(app)/layout.tsx`, `frontend/src/components/Sidebar.tsx`; testes em `lib/tabs.test.ts` e `e2e/abas.spec.ts`.
