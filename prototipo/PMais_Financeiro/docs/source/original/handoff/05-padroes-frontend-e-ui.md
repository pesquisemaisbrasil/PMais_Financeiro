# Padrões de frontend e interface (UI)

Este documento é para quem vai construir o **front do sistema Financeiro** da Pesquise+. A regra é uma só: **o Financeiro tem que parecer e se comportar como o P+ Connect.** Mesma stack, mesmos componentes, mesma marca, mesmo jeito de montar tela, mesmo tom de texto e o mesmo cuidado com acessibilidade. Quem usa os dois sistemas não pode sentir que trocou de produto.

Tudo aqui foi conferido no código do P+ Connect (repositório `Entrevistadores-Connect`). Quando o texto diz "copie `frontend/...`", o caminho é desse repositório.

---

## 1. Stack e versões

Versões **instaladas** hoje (lidas de `frontend/node_modules`; o `package.json` usa `^` em parte delas). Fixe as mesmas no Financeiro.

| Peça | Versão | Observação |
|---|---|---|
| Next.js | **16.4.2** (fixa) | App Router, `output: "standalone"` em `next.config.ts` |
| React / React DOM | **19.2.8** (fixa) | |
| TypeScript | 5.9.3 (`^5`) | `strict: true`, alias `@/*` → `./src/*` |
| Tailwind CSS | 4.3.3 (`^4`) | via `@tailwindcss/postcss`; **sem** `tailwind.config.*` (tema em CSS) |
| shadcn/ui | estilo `new-york`, `baseColor: neutral`, `cssVariables: true`, `rsc: true` | `frontend/components.json` |
| radix-ui | 1.6.7 | pacote único `radix-ui` (não os `@radix-ui/*` separados) |
| lucide-react | 1.49.0 | única biblioteca de ícones |
| sonner | 2.0.8 | toasts |
| react-imask | 7.6.1 | máscaras de CPF/CNPJ/CEP/telefone |
| class-variance-authority / clsx / tailwind-merge | 0.7.1 / 2.1.1 / 3.7.0 | `cn()` em `src/lib/utils.ts` |
| tw-animate-css | 1.4.0 | animações do shadcn |
| pdf-lib | 1.17.1 | só se o Financeiro manipular PDF no navegador |
| ESLint | 9 + `eslint-config-next` 16.4.2 | `core-web-vitals` + `typescript` |
| Vitest | 3.2.7 (`^3.2.4`) | ambiente `node`, só `src/**/*.test.ts` |
| Playwright | 1.64.1 | só Chromium |
| Node | 22 | `node:22-slim` no `Dockerfile` e na CI |

### A peculiaridade do Next desta versão

`frontend/AGENTS.md` avisa: **esta versão do Next tem mudanças incompatíveis com o que modelos e tutoriais costumam saber.** Antes de escrever código de rota, layout, metadados ou cache, leia o guia certo em `node_modules/next/dist/docs/` (pastas `01-app`, `03-architecture`…). Copie o `AGENTS.md` para o repositório do Financeiro.

Consequências práticas:

- **Tipos globais de rota** (`LayoutProps`, `PageProps`, rotas tipadas) são gerados em `.next/types` pelo `next typegen`. Sem ele o `tsc` falha. Ordem sempre:
  ```bash
  npx next typegen
  npx tsc --noEmit
  ```
  É assim na CI (`.github/workflows/frontend.yml`, passo "Gerar tipos do Next") e no `scripts/verify-delivery.sh`.
- O layout raiz usa o tipo global, sem import:
  ```tsx
  // frontend/src/app/layout.tsx
  export default function RootLayout({ children }: LayoutProps<"/">) {
  ```
- **Todas as páginas são Client Components** (`"use client"` na primeira linha). O token mora no `localStorage`, então não há busca de dados no servidor. Parâmetro de rota dinâmica é lido com `useParams()`:
  ```tsx
  const params = useParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const projectId = rawId ? Number(rawId) : NaN;
  const invalidId = !rawId || Number.isNaN(projectId);
  ```
- `next dev` reescreve o bloco do `AGENTS.md`; se aparecer no diff, faça commit dele junto.

### Comandos de "pronto" (todos verdes)

```bash
cd frontend
npx next typegen
npx tsc --noEmit
npm run lint
npm run check:ui
npm test            # vitest
npm run e2e         # playwright
```

---

## 2. Estrutura de pastas e nomes

```
frontend/
  AGENTS.md                  aviso do Next
  components.json            config do shadcn
  next.config.ts             output: "standalone"
  playwright.config.ts       sobe backend + front isolados
  vitest.config.mts          testes de src/lib
  scripts/check-ui.mjs       guarda de UI
  e2e/                       specs Playwright + fixtures.ts
  public/                    logo.png, logo-branco.png
  src/
    app/                     rotas (App Router); uma pasta por URL, sempre page.tsx
      layout.tsx  globals.css
      financeiro/page.tsx
      admin/projetos/[id]/financeiro/page.tsx
    components/
      ui/                    shadcn (gerado; só aqui pode haver <button>, <table>…)
      dashboard/             KpiCard, DashboardHeader, PanelCard
      ConfirmModal.tsx  Toast.tsx  Sidebar.tsx  RequireAuth.tsx  …
    lib/
      api.ts                 TODA chamada HTTP + tipos da API
      auth-context.tsx  notifications-context.tsx
      time.ts  download.ts  validators.ts  utils.ts
      *.test.ts              vitest ao lado do arquivo testado
```

| O quê | Convenção | Exemplo |
|---|---|---|
| URL / pasta de rota | pt-BR, minúsculas, hífen | `/financeiro`, `/admin/projetos/[id]/financeiro`, `/esqueci-senha` |
| Componente compartilhado | PascalCase, arquivo = nome | `ConfirmModal.tsx`, `PaymentStatus.tsx` |
| Componente shadcn | kebab-case (padrão shadcn) | `ui/alert-dialog.tsx` |
| Componente da página | função no mesmo arquivo da página | `SummarySection`, `BatchReview`, `MoneyKpi` |
| Função de API | verbo em inglês + domínio | `getFinanceSummary`, `confirmReceiptBatch` |
| Caminho de download | sufixo `Path`, devolve string | `financePaymentsXlsxPath(projectId)` |
| Campos JSON | camelCase como vêm do backend (alguns ids em snake_case: `interviewer_id`) | `toPayValue`, `paidAt` |
| Texto na tela | pt-BR | — |
| Estado | React Context (`auth-context`, `notifications-context`) + `useState` | sem Redux/Zustand/React Query |

Página = componente exportado fino (`RequireAuth` + `Sidebar`) + um `XxxContent` com a lógica. Ver §8.

---

## 3. Marca

Fonte de verdade: `frontend/src/app/globals.css` (copie o arquivo inteiro) e `docs/brand/README.md`. Logo: copie `frontend/public/logo.png` e `logo-branco.png`.

### Tokens de cor (`:root`)

| Token CSS | Classe Tailwind | Hex | Uso |
|---|---|---|---|
| `--brand-azul-deep` | `brand-azul-deep` | `#4063ee` | Primária: botões, links, menu ativo, chip de ícone do título |
| `--brand-azul-claro` | `brand-azul-claro` | `#009cef` | Anel de foco (`--ring`), destaque |
| `--brand-verde` | `brand-verde` | `#00c977` | Sucesso, pago, valores recebidos |
| `--brand-roxo` | `brand-roxo` | `#6b36f7` | Detalhe ("inteligência"), KPI secundário |
| `--brand-azul-neutro` | `brand-azul-neutro` | `#6ec3e4` | Apoio, hover de borda |
| `--brand-cinza-escuro` | `brand-cinza-escuro` | `#3c3c3c` | Texto (`--foreground`), títulos |
| `--brand-cinza-claro` | `brand-cinza-claro` | `#e8e8e8` | Neutro (encerrado, descartado) |

Tokens do shadcn no mesmo `:root`:

```css
--radius: 0.75rem;
--background: #f7f8fa;   --foreground: #3c3c3c;
--card: #ffffff;         --popover: #ffffff;
--primary: #4063ee;      --primary-foreground: #ffffff;
--secondary: #f1f5f9;    --muted: #f8fafc;   --muted-foreground: #64748b;
--accent: #ebf3fe;       --accent-foreground: #4063ee;
--destructive: #ef4444;  --border: #e2e8f0;  --input: #e2e8f0;
--ring: #009cef;
```

Eles viram classes via `@theme inline` (`--color-brand-verde: var(--brand-verde);` etc.). **Nunca use hex solto no JSX**; use a classe (`text-brand-verde`, `bg-brand-azul-deep/10`).

### Cores de estado (sempre com texto junto, nunca só cor)

| Estado | Classes usadas no Connect |
|---|---|
| Positivo (ativo, pago, bate) | `bg-brand-verde/15 text-brand-verde` |
| Atenção (pausado, a pagar, divergente, fora do projeto) | `bg-amber-100 text-amber-700`; `Alert` com `border-amber-300 bg-amber-50 text-amber-900` |
| Erro / bloqueio | `text-red-600`; caixa `border-red-200 bg-red-50 text-red-700`; botão `variant="destructive"` |
| Neutro (encerrado, descartado) | `bg-brand-cinza-claro text-brand-cinza-escuro` |
| Em andamento | `bg-brand-azul-deep/15 text-brand-azul-deep` |

### Tipografia, raio, espaçamento

- **Open Sans** via `next/font/google`, variável `--font-open-sans`, aplicada no `<html>`; `lang="pt-BR"`:
  ```tsx
  const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"] });
  <html lang="pt-BR" className={`${openSans.variable} h-full antialiased`}>
  ```
- Hierarquia: sobretítulo `text-xs font-semibold uppercase tracking-wide text-brand-azul-deep`; título `text-2xl font-bold` (detalhe) ou `text-xl font-semibold` (lista) em `text-brand-cinza-escuro`; subtítulo `text-sm text-muted-foreground`; título de seção `text-sm font-bold`; rótulo de KPI `text-[11px] uppercase tracking-wide text-muted-foreground`.
- Raio: `--radius: 0.75rem` (`rounded-lg`); derivados `sm = radius-4px`, `md = radius-2px`, `xl = radius+4px`. Cards e itens de menu usam `rounded-xl`.
- Espaçamento: área de conteúdo `px-4 py-8 sm:px-6`, largura `max-w-7xl`; seções separadas por `mb-6`; grades com `gap-3`/`gap-4`; cards `p-4`/`p-5`.
- Ponteiro: `globals.css` aplica `cursor-pointer` em botão, `[role=button]` e link habilitados.

### Dark mode

**Não existe.** Há só a declaração `@custom-variant dark (&:is(.dark *));` (vinda do shadcn) e nenhum token `.dark`; o `Toaster` é `theme="light"`. O Financeiro também deve ser só claro.

### Logo e tom

- Logo com `next/image`, `alt="P+ Connect"` (no Financeiro, use o nome do produto definido pela Pesquise+). Não distorcer nem aplicar efeitos.
- Tom: confiável, ágil, acessível. Frases curtas, botão no imperativo ("Confirmar baixa", "Baixar planilha de pagamentos").

---

## 4. Componentes

### 4.1 `src/components/ui` (shadcn) — copie a pasta inteira

Só use estes componentes para controles. Se faltar um, gere com o CLI do shadcn (mesmo `components.json`) e coloque em `ui/`.

| Componente | Quando usar |
|---|---|
| `button` | Toda ação. Variantes `default`, `outline`, `secondary`, `ghost`, `link`, `destructive`; tamanhos `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. `asChild` para virar `<Link>` |
| `card` | Bloco de conteúdo (resumo, tabela, upload). `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` |
| `table` | Toda tabela (`Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`) |
| `tabs` | Separar grupos da mesma lista (ex.: Batem / Divergentes / Fora do projeto) |
| `dialog` | Formulário curto em modal (ex.: Editar orçamento) |
| `alert-dialog` | Confirmação — use pelo `ConfirmModal`, não direto |
| `sheet` | Painel lateral de detalhe (ex.: entrevistas de um projeto em Ganhos) |
| `alert` | Aviso fixo na tela (risco, envio incompleto, falha com "Tentar de novo") |
| `badge` | Situação (Pago, A pagar, Confirmado) |
| `progress` | Uso de orçamento, progresso de envio |
| `skeleton` | Carregando |
| `spinner` | Botão ocupado / carregando a sessão |
| `input`, `textarea`, `label` | Formulário (`Label htmlFor` ↔ `id`) |
| `select` | Escolha em lista (nunca `SelectItem value=""`) |
| `checkbox`, `radio-group`, `switch` | Escolhas; `switch` para ligar/desligar permissão |
| `collapsible` | Linha que expande detalhe |
| `popover`, `dropdown-menu`, `tooltip` | Menus e dicas (dica nunca é o único lugar de uma informação importante) |
| `avatar`, `separator`, `scroll-area` | Apoio |
| `sonner` | `Toaster` (já montado no `layout.tsx`, `position="bottom-center" richColors`) |

Também reutilizáveis: `components/dashboard/` — `DashboardHeader` (sobretítulo/título/subtítulo/ações), `KpiCard`, `PanelCard`.

### 4.2 Componentes de domínio (copie e reaproveite)

**`RequireAuth`** — protege a página por papel. Ver §6.

```tsx
<RequireAuth role={["financeiro", "admin"]}>…</RequireAuth>
```
Props: `role?: AppRole | AppRole[]` (`"admin" | "supervisor" | "financeiro" | "user"`), `allowPendingProfile?: boolean`. Exporta também `homePathFor(user)`.

**`Sidebar`** — menu lateral fixo (`w-64`), logo + `NotificationBell` no topo, links por papel, suporte, avatar com nome/papel e "Sair". Sem props. Ver §6.

**`ConfirmModal`** — toda ação irreversível.

| Prop | Tipo | Padrão |
|---|---|---|
| `open` | boolean | — |
| `title` | string | "Confirmar ação" |
| `message` | string (resumo do efeito: quantos, quanto, quem) | — |
| `confirmLabel` / `cancelLabel` | string | "Confirmar" / "Cancelar" |
| `danger` | boolean (botão vermelho) | false |
| `busy` | boolean (trava os botões e o fechar) | false |
| `onConfirm` / `onCancel` | () => void | — |
| `children` | conteúdo extra (ex.: `WhatsappSendOption`) | — |

O botão de confirmar é um `Button` comum (não `AlertDialogAction`) para o diálogo **não fechar antes** de a ação assíncrona terminar.

```tsx
<ConfirmModal
  open={cancelOpen}
  title="Cancelar envio"
  message="Os comprovantes lidos neste envio serão apagados e nada será marcado como pago. Você pode enviar o PDF de novo depois."
  confirmLabel="Cancelar envio"
  cancelLabel="Voltar"
  danger
  busy={busy}
  onConfirm={() => void handleCancelBatch()}
  onCancel={() => setCancelOpen(false)}
/>
```

**`Toast`** — ponte entre estado da página e o `sonner`. Recebe `message`, `error`, `onDismiss`; dispara `toast.success`/`toast.error` e limpa o estado (para a mesma mensagem poder sair de novo). `onDismiss` precisa ser estável (`useCallback`).

```tsx
const dismissToast = useCallback(() => { setMessage(null); setError(null); }, []);
<Toast message={message} error={error} onDismiss={dismissToast} />
```
Para avisos pontuais fora do fluxo de estado, o Connect chama `toast.warning(...)` direto (ex.: `ExportCsvButton`).

**`PaymentStatus`** — situação de pagamento de uma entrevista.

```tsx
<PaymentStatus paidAt={row.paidAt} expectedPaymentDate={row.expectedPaymentDate} />
```
`paidAt` preenchido → badge verde "Pago em dd/mm/aaaa"; senão badge âmbar "A pagar" + "previsão dd/mm/aaaa". Datas `aaaa-mm-dd`.

**`DataPagination` + `paginate`** — paginação ("Mostrando 1–24 de 400", anterior/próxima, números, por página opcional). `paginate(items, page, pageSize)` fatia listas já carregadas.

| Prop | Tipo |
|---|---|
| `page` (começa em 1), `pageSize`, `total` | number |
| `onPageChange` | (page) => void |
| `pageSizeOptions?`, `onPageSizeChange?` | number[], (size) => void |
| `scrollRef?` | ref da lista (volta ao topo ao trocar de página) |
| `itemLabel?` | string, padrão "itens" |
| `className?` | string |

```tsx
const pageGroups = paginate(groups, page, PROJECT_PAGE_SIZE);
…
<DataPagination className="mt-6" page={page} pageSize={PROJECT_PAGE_SIZE}
  total={groups.length} onPageChange={setPage} scrollRef={listRef} itemLabel="projetos" />
```
Some sozinho quando `total === 0`. Para paginação no servidor, use `requestPage` (§5), que lê `X-Total-Count`.

**`ExportCsvButton`** — baixa arquivo de endpoint autenticado e avisa por toast (sucesso, "Arquivo limitado a 5000 linhas — refine os filtros." quando `X-Truncated: true`, ou o erro).

```tsx
<ExportCsvButton path={projectEarningsCsvPath(projectId)}
  fallbackPrefix={`ganhos-projeto-${projectId}`} disabled={loading || history.length === 0} />
```
Props: `path`, `fallbackPrefix`, `disabled?`, `className?`, `label?` (padrão "Exportar CSV"). Para outros formatos use `downloadFile(path, prefixo, "xlsx")` de `src/lib/download.ts` (é o que o botão "Baixar planilha de pagamentos" faz).

**`MaskedInput`** — `CpfInput` (`000.000.000-00`), `CnpjInput` (`00.000.000/0000-00`), `CepInput` (`00000-000`), `PhoneInput` (`(00) 0000-0000` ou `(00) 00000-0000`). Props: `value`, `onChange(v)`, `required?`. Mesmas classes do `Input`. O valor sai **com máscara** (`unmask={false}`); o backend limpa.

**`WhatsappSendOption`** + `whatsappQueuedSuffix(n)` — checkbox "Enviar também por WhatsApp" (desmarcado por padrão) para usar dentro de um `ConfirmModal`; o sufixo completa o toast (" · 3 avisos por WhatsApp na fila").

**`NotificationBell`** — sino com contador e lista em `Popover`, já dentro da `Sidebar`; depende de `NotificationsProvider` (`src/lib/notifications-context.tsx`).

---

## 5. Regra do `check:ui`

`npm run check:ui` roda `frontend/scripts/check-ui.mjs`. Ele percorre todos os `.tsx` de `src/` **fora de `components/ui/`** e falha se achar:

| Proibido | Use |
|---|---|
| `<button` | `Button` |
| `<select` | `Select` |
| `<textarea` | `Textarea` |
| `<table` | `Table` |
| `<SelectItem … value="">` | um valor não vazio (vazio quebra o Radix) |
| `<input … type="checkbox">` / `type="radio"` (mesmo com o `type` em outra linha) | `Checkbox` / `RadioGroup` |

Como funciona: regex por linha para as tags; regex multilinha no arquivo inteiro para checkbox/radio; imprime `arquivo:linha  motivo`, conta as falhas e sai com código 1. Aceita caminhos como argumento para checar só uma parte (`node scripts/check-ui.mjs app/financeiro`).

Há ainda uma checagem **específica do Connect**: `EXPECTED_DATA_TOUR = 10` (atributos `data-tour=` do tour guiado). No Financeiro, **copie o script e remova esse bloco** (ou ajuste o número se houver tour).

`<input type="file" className="hidden">` é permitido (é o que a tela de comprovantes usa, acionado por um `Button`).

---

## 6. Camada HTTP — `src/lib/api.ts`

**Regra: nenhuma página chama `fetch`.** Toda chamada é uma função tipada em `api.ts`, perto das do mesmo assunto (o arquivo é dividido em blocos `// ---- Assunto ----`).

### O que existe

| Peça | O que faz |
|---|---|
| `API_URL` | `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"` |
| `ApiError` | `Error` com `status`; `message` já é o texto para o usuário |
| `setTokens` / `clearTokens` / `getRefreshToken` | `access_token` e `refresh_token` no `localStorage` |
| `fetchWithAuth` (interno) | põe `Authorization: Bearer`; em **401** tenta `POST /token/refresh` **uma vez** e repete; se falhar, limpa tokens; resposta não-ok → `ApiError` |
| `tryRefreshToken` (interno) | uma única renovação em andamento por vez (`refreshPromise` compartilhada) |
| `extractErrorMessage` (interno) | lê `detail` do FastAPI: string → texto; lista (422) → `msg` unidos por `"; "`; remove o prefixo `"Value error, "` do Pydantic; corpo não-JSON → `statusText` |
| `request<T>(path, options)` | JSON; 204 → `undefined`; `auth: false` para rotas públicas |
| `jsonBody(body)` | `{ method: "POST", headers: JSON, body }` — sobrescreva `method` para PUT/PATCH |
| `requestPage<T>(path, {skip, limit})` | listagem paginada → `{ items, total }` pelo cabeçalho `X-Total-Count`; `MAX_PAGE_SIZE = 100` |
| `requestFile(path)` | download autenticado → `{ blob, filename, truncated }` (`Content-Disposition`, `X-Truncated`) |

Valores em dinheiro chegam como **string decimal** (`"70.00"`) e são convertidos só para exibir (`Number(...)` + formatador). Não some dinheiro no front para gravar nada.

### Como adicionar uma chamada

```ts
// ---- Financeiro do projeto (comprovantes Pix) ----

export interface FinanceSummary {
  budget: string | null;
  launched: string;
  paid: string;
  toPay: string;
  budgetBalance: string | null;
  interviewers: FinanceInterviewerRow[];
}

function financePath(projectId: number): string {
  return `/projects/${projectId}/finance`;
}

export async function getFinanceSummary(projectId: number): Promise<FinanceSummary> {
  return request<FinanceSummary>(`${financePath(projectId)}/summary`);
}

export async function setReceiptDiscarded(projectId: number, batchId: number, receiptId: number, discarded: boolean): Promise<void> {
  await request<void>(`${financePath(projectId)}/receipt-batches/${batchId}/receipts/${receiptId}`, {
    ...jsonBody({ discarded }),
    method: "PATCH",
  });
}

/** Download: só devolve o caminho; quem baixa é downloadFile/ExportCsvButton. */
export function financePaymentsXlsxPath(projectId: number): string {
  return `/projects/${projectId}/finance/payments.xlsx`;
}
```

Na página, o erro é sempre tratado do mesmo jeito:

```ts
try {
  await deleteReceiptBatch(projectId, batch.id);
  setMessage("Envio cancelado. Nada foi marcado como pago.");
} catch (err) {
  setError(err instanceof ApiError ? err.message : "Erro ao cancelar o envio");
}
```

Upload: `FormData` sem `Content-Type` manual (o navegador põe o boundary): `request(path, { method: "PUT", body: form })`.

Para o Financeiro: copie a parte genérica (até `jsonBody`) e crie os blocos do seu domínio. Se o Financeiro chamar o Connect, o token e o formato de erro (`detail`) são os mesmos.

---

## 7. Autenticação e autorização no front

- `AuthProvider` (`src/lib/auth-context.tsx`) envolve o app no `layout.tsx`. Na montagem, se há `access_token`, chama `GET /users/me`; falhou → limpa tokens. Expõe `user`, `loading`, `login(cpf, senha)`, `logout()`, `refreshUser()` via `useAuth()`.
- Login: `POST /token` com `application/x-www-form-urlencoded` (`username` = CPF, `password`).
- `RequireAuth`:
  - enquanto carrega → `Spinner` centralizado;
  - sem usuário → `router.replace("/login")`;
  - papel fora de `role` → `router.replace(homePathFor(user))` e não renderiza nada;
  - entrevistador (`user`) sem ficha aprovada só entra em telas com `allowPendingProfile`.
- Tela inicial por papel (`homePathFor`): admin e supervisor → `/admin/painel`; financeiro → `/financeiro`; entrevistador → `/inicio` (ou `/perfil` se a ficha não foi aprovada).
- **O front só esconde; quem barra é o backend.** Toda regra de permissão existe na API; o front evita mostrar o que daria 403.

Menus por papel (`Sidebar.tsx`):

| Papel | Itens |
|---|---|
| `admin` | Painel, Entrevistadores, Fila de análise, Projetos, Treinamentos, Ganhos, Usuários, Auditoria, Meu perfil |
| `supervisor` | Painel, Entrevistadores, Fila de análise, Projetos, Treinamentos, Ganhos, Meu perfil |
| `financeiro` | **Projetos** (`/financeiro`), Notificações, Meu perfil |
| `user` (entrevistador) | Início, Minha ficha, Projetos, Meus treinamentos, Ganhos, Meu perfil |

Rótulo do papel no rodapé: Administrador, Supervisor, Financeiro, Entrevistador. Item ativo: `bg-brand-azul-deep text-white shadow-sm`; inativo: `text-brand-cinza-escuro/70 hover:bg-muted`. Item bloqueado: `aria-disabled="true"`, cadeado e aviso **visível** com `role="status"` (não só tooltip).

Permissões finas dentro da tela também vêm do `user`:

```ts
// planilha tem a chave Pix completa: só admin e financeiro baixam
const canDownloadPayments = user?.role === "admin" || user?.role === "financeiro";
const canEditBudget = canUserEditBudget(user); // admin, financeiro ou supervisor autorizado
```

---

## 8. Padrão de página

### Esqueleto

```tsx
"use client";

export default function FinanceiroProjetosPage() {
  return (
    <RequireAuth role={["financeiro", "admin"]}>
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <FinanceiroProjetosContent />
        </div>
      </div>
    </RequireAuth>
  );
}

function FinanceiroProjetosContent() {
  …
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Toast message={null} error={error} onDismiss={() => setError(null)} />
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-brand-cinza-escuro">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-azul-deep/10 text-brand-azul-deep">
          <FolderKanban size={16} strokeWidth={2} />
        </span>
        Projetos
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">Escolha um projeto para ver o que já foi pago…</p>
      …
```

Tela de detalhe: botão "voltar" `variant="ghost" size="sm"` com `ArrowLeft`, sobretítulo `PRJ-{id}`, `h1` `text-2xl font-bold`. Projeto é sempre identificado como **`PRJ-{id}`**.

### Estados

| Estado | Como o Connect faz |
|---|---|
| **Carregando** | `Skeleton` no formato do conteúdo (grade de cards `h-40`, KPIs `h-16`, linhas `h-6`). Use `null` como "ainda não carregou" (`useState<X[] \| null>(null)`). `Spinner` dentro do botão ocupado, com o texto mudando ("Gerando…") |
| **Vazio** | Frase curta `text-sm text-muted-foreground`, de preferência dizendo o próximo passo; diferencie "nada ainda" de "nada nesta busca" |
| **Erro de carregar** | Toast com o `detail`; erro que impede a tela → caixa `border-red-200 bg-red-50 p-4 text-sm text-red-700` no topo |
| **Erro por seção** | padrão `Loadable` + `InlineError` (abaixo) |
| **Sucesso** | Toast com o resultado concreto ("Baixa feita: 7 entrevistas marcadas como pagas (R$ 70,00, 2 pessoas).") e recarregar só o que mudou |
| **ID inválido na URL** | Card centralizado "Projeto inválido." + botão "Voltar para projetos" |

```tsx
{projects === null ? (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}
  </div>
) : visible.length === 0 ? (
  <p className="text-sm text-muted-foreground">
    {search.trim() ? "Nenhum projeto encontrado com essa busca." : "Nenhum projeto cadastrado ainda."}
  </p>
) : ( … )}
```

**Loadable** (em `src/app/inicio/page.tsx`): quando a página tem várias fontes independentes, cada seção carrega e falha sozinha.

```ts
type Loadable<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; message: string };

function InlineError({ message }: { message: string }) {
  return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}
```
No `useEffect`, use a flag `cancelled` para não gravar estado depois de desmontar. Hoje `Loadable`/`InlineError` são locais da página; no Financeiro, vale colocá-los em `components/`.

### Formulários

- `Label htmlFor` + `Input id`; dica ou erro logo abaixo em `text-xs` (`text-muted-foreground` ou `text-red-600`).
- `<form onSubmit>` com `e.preventDefault()`; botão `type="submit"` desabilitado enquanto `busy`, inválido ou sem mudança.
- Mostrar **antes e depois** quando altera valor: "De **R$ 500,00** para **R$ 1.500,00**. Deixe vazio para tirar o orçamento."
- Validação no cliente só para feedback rápido (`src/lib/validators.ts` espelha o backend); o backend sempre valida de novo.

### Tabelas

```tsx
<Card className="gap-0 overflow-hidden p-0">
  <h2 className="border-b px-5 py-4 text-sm font-bold text-brand-cinza-escuro">Por entrevistador</h2>
  <Table>
    <TableHeader>
      <TableRow className="bg-muted/50">
        <TableHead>Nome</TableHead>
        <TableHead className="text-right">A pagar</TableHead>
```
Números e dinheiro alinhados à direita; nome em `font-medium text-brand-cinza-escuro`; vazio de célula = `"—"`. Tabela longa: `max-h-[28rem] overflow-auto` + `TableHeader className="sticky top-0 z-10 bg-card"` + `[&_[data-slot=table-container]]:overflow-visible` no contêiner.

### Filtros e busca

Campo com ícone `Search` à esquerda e `aria-label`; filtragem com `useMemo`; ao mudar o filtro, volte para a página 1.

```tsx
<div className="relative mb-4 w-full max-w-sm">
  <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-brand-cinza-escuro/40" />
  <Input value={search} onChange={(e) => setSearch(e.target.value)}
    placeholder="Buscar projeto pelo nome ou código…" aria-label="Buscar projeto pelo nome ou código" className="pl-8" />
</div>
```

### Diálogos, Sheet e ações irreversíveis

- `Dialog` para formulário curto; `Sheet side="right"` (`w-full sm:max-w-lg`) para ver detalhe sem sair da lista.
- **Toda ação irreversível passa por `ConfirmModal`**, com o efeito resumido em números e a frase "Isso não pode ser desfeito." quando for o caso. Ação destrutiva → `danger`.
- Risco que não pode passar despercebido (ex.: Pix para quem não está no projeto) → `Alert` âmbar **listando os itens**, acima da lista.
- Operação longa (upload): progresso visível, "Não feche esta página até terminar.", aviso `beforeunload`, retentativa automática e botão **"Tentar de novo"** que retoma de onde parou.

### Toasts

Um `<Toast>` por página, com estados `message`/`error`. Sucesso diz o que aconteceu e quanto; erro mostra o `detail` do backend ou um texto de reserva em pt-BR.

---

## 9. Formatação

| Dado | Como | Onde |
|---|---|---|
| Dinheiro | `new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` → "R$ 1.500,00". Helper local `brl(v)` = `BRL.format(Number(v ?? 0))` | páginas de financeiro e ganhos (cada uma declara o seu; no Financeiro, centralize em `lib/`) |
| Números | `new Intl.NumberFormat("pt-BR")` | `DataPagination` |
| Dia (`aaaa-mm-dd`) | `formatIsoDay(v)` → "18/02/2026", **sem `new Date`** (evita voltar um dia pelo fuso); vazio → "—" | `src/lib/time.ts` |
| Data e hora | `formatDateTimeBr(iso)` → "dd/mm/aaaa HH:MM" em `America/Sao_Paulo` | `time.ts` |
| Hoje | `todayInSaoPaulo()` → "aaaa-mm-dd" no fuso de São Paulo (mesmo relógio do backend) | `time.ts` |
| Relativo | `formatRelativeTime(iso)` → "agora", "há 5 min", "ontem" | notificações |
| CPF / CNPJ / CEP / telefone | `CpfInput`, `CnpjInput`, `CepInput`, `PhoneInput` | `MaskedInput.tsx` |
| Chave Pix | **mascarada pelo backend** (`keyMasked`); o front só exibe, em `font-mono text-xs text-muted-foreground` | tela de comprovantes |

Atenção: algumas telas antigas ainda usam `toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })` sem fixar o fuso. No Financeiro, use sempre os helpers de `time.ts`.

### Chave Pix — regra

- Máscara feita no backend (`mask_pix_key` em `backend/services/finance.py`): e-mail mantém 3 letras + domínio (`abc***@dominio.com`); demais mantêm 3 no começo e 2 no fim (`123***45`); até 5 caracteres vira `***`.
- A chave completa **nunca chega ao navegador** na tela de comprovantes. A única saída com chave completa é a **planilha de pagamentos** (`.xlsx`), só para admin e financeiro, e cada download fica na auditoria — a tela avisa: "O download fica registrado."
- Exceção: o próprio entrevistador vê e edita a sua chave em "Meu perfil" (`/conta/editar`); trocar exige a senha atual.
- Nenhum botão de baixar comprovante; o PDF não fica guardado ("O PDF não fica guardado no sistema: lemos só valor, data, chave (mascarada) e nome.").
- CPF nunca aparece em tela de listagem.

---

## 10. Textos

Público: supervisores, pessoal do Financeiro e entrevistadores, **não técnicos**. Português do Brasil, frases curtas, números com contexto, sem jargão.

| Diga | Não diga |
|---|---|
| comprovante, baixa, a pagar, pago, envio | batch, reconcile, payload, status 409 |
| "R$ 480,00 de R$ 500,00 usados" | "96%" sozinho |
| "Confirmar baixa" | "OK", "Submit" |
| "Não conseguimos abrir esse arquivo…" | "Error parsing PDF" |

Exemplos reais do Connect para copiar o tom:

- Subtítulo: "Escolha um projeto para ver o que já foi pago, o que falta pagar e baixar a planilha de pagamentos."
- Confirmação: "Vamos marcar como pagas as entrevistas de 2 pessoas: 2 comprovantes, total de R$ 70,00. Os comprovantes divergentes, fora do projeto e com erro não entram. Isso não pode ser desfeito."
- Sucesso: "Baixa feita: 7 entrevistas marcadas como pagas (R$ 70,00, 2 pessoas)."
- Sucesso: "Orçamento atualizado. Quem acompanha o projeto foi avisado."
- Cancelamento: "Envio cancelado. Nada foi marcado como pago."
- Erro com saída: "Esse PDF está protegido por senha. Gere o arquivo de comprovantes sem senha no banco e envie de novo."
- Falha parcial: "As partes anteriores já foram recebidas. Tente de novo para continuar de onde parou."
- Risco: "2 comprovantes são de pessoas que não estão neste projeto" + "Esses pagamentos não entram na baixa. Confira se o Pix foi para a pessoa certa."
- Vazio: "Nenhum comprovante enviado neste projeto ainda." / "Todas as chaves Pix estão cadastradas."
- Entrevistador: "Os pagamentos são feitos em até 30 dias após o lançamento de cada entrevista." / "Próximo pagamento previsto: 18/02/2026 — R$ 40,00"

Plural sempre certo ("1 comprovante lido" / "5 comprovantes lidos") — o Connect monta à mão com `=== 1 ? "" : "s"`.

---

## 11. Acessibilidade

- `lang="pt-BR"` no `<html>`.
- Todo campo com `Label htmlFor` ↔ `id`; busca sem rótulo visível tem `aria-label`.
- Botão só de ícone tem `aria-label` (ex.: paginação: "Página anterior", "Página 3", "Próxima página"; `aria-current="page"` na atual). `title` sozinho **não** basta.
- Foco visível: os componentes shadcn já trazem `focus-visible:ring-[3px] focus-visible:ring-ring/50` (azul claro). Não remova `outline`.
- Diálogos do Radix prendem o foco e fecham com Esc; `ConfirmModal` não fecha enquanto `busy`. Use `autoFocus` no primeiro campo do diálogo.
- Paginação dentro de `<nav aria-label="Paginação">`; avisos de bloqueio com `role="status"`.
- Cor nunca é o único sinal: badge sempre tem texto e, quando cabe, ícone (`CheckCircle2` "Pago em…", `Clock` "A pagar").
- Item desabilitado: `aria-disabled="true"` + explicação visível.
- Contraste: texto principal `#3c3c3c` sobre branco/`#f7f8fa`; texto secundário `muted-foreground` `#64748b`. Evite texto `brand-verde` ou `brand-azul-claro` pequeno sobre branco para informação essencial sem reforço (peso, ícone ou fundo).
- Os testes E2E acham elementos por papel e nome acessível (`getByRole("button", { name: … })`), o que obriga os nomes a existirem.

Lacunas conhecidas do Connect (não repita): `Spinner` tem `aria-label="Loading"` em inglês (no Financeiro, use "Carregando"); os inputs de `MaskedInput` não recebem `id`, então não dá para ligar `Label htmlFor` (no Financeiro, aceite e repasse `id`); em `/admin/ganhos` há botões de ícone só com `title` e carregamento em texto ("Carregando...") em vez de `Skeleton`.

---

## 12. Telas do Financeiro que já existem no Connect

Use como referência visual. São as telas que o time do Financeiro já conhece.

### 12.1 `/financeiro` — lista de projetos do Financeiro

- **Arquivo:** `frontend/src/app/financeiro/page.tsx`
- **Quem:** `financeiro` (é a tela inicial dele) e `admin`.
- **Seções:** título "Projetos" com chip de ícone + subtítulo; busca por nome ou `PRJ-id`; grade de cards (1/2/3 colunas) ordenada por situação (Ativo, Pausado, Encerrado) e depois id decrescente.
- **Card:** `PRJ-{id}`, título (truncado com `title`), badge de situação, uso do orçamento ("R$ X de R$ Y usados" + % e `Progress` `h-1.5`, âmbar a partir de 80%, vermelho e "Orçamento estourado" acima de 100%) ou "Sem orçamento definido · R$ X em entrevistas lançadas"; botão "Abrir Financeiro" (`Wallet`).
- **Estados:** 6 `Skeleton h-40`; vazio com e sem busca; erro por toast.
- **Componentes:** `RequireAuth`, `Sidebar`, `Toast`, `Input`, `Card`, `Badge`, `Progress`, `Button asChild` + `Link`, `Skeleton`.

### 12.2 `/admin/projetos/[id]/financeiro` — Financeiro de um projeto

- **Arquivo:** `frontend/src/app/admin/projetos/[id]/financeiro/page.tsx`
- **Quem:** `admin`, `supervisor`, `financeiro`. Planilha só admin e financeiro; editar orçamento só admin, financeiro ou supervisor autorizado. "Voltar" leva o financeiro para `/financeiro` e os demais para `/admin/projetos`.
- **Cabeçalho:** voltar "Projetos", `PRJ-{id}`, "Financeiro — {título}", subtítulo explicando o envio de comprovantes.
- **Planilha de pagamentos** (card): texto explicando que contém a chave Pix e que o download é registrado; botão "Baixar planilha de pagamentos" (`FileSpreadsheet`, vira `Spinner` + "Gerando…").
- **Resumo:** 5 KPIs (`MoneyKpi`): Orçamento (com link "Editar orçamento"), Lançado, Pago (verde), A pagar (âmbar), Saldo do orçamento; barra "Uso do orçamento"; tabela "Por entrevistador" (Nome, Entrevistas lançadas, Valor lançado, Pagas, Valor pago, A pagar).
- **Editar orçamento:** `Dialog` com campo "Orçamento (R$)", antes → depois, vazio = sem orçamento, salvar desabilitado se inválido ou igual.
- **Enviar comprovantes:** card tracejado com arrastar-e-soltar ou "Escolher PDF". Fases: preparando (divide o PDF no navegador em partes de 25 páginas, com `Progress`), enviando ("Enviando parte 2 de 4 (tentativa 2 de 3)"), falhou (`Alert` vermelho com "Tentar de novo" / "Cancelar envio"). Rodapé com cadeado: o PDF não fica guardado.
- **Conferência de um envio:** cabeçalho com data e badge (Enviando / Pronto para conferir / Confirmado), "Cancelar envio" e "Confirmar baixa" (só com algo que bate e status pronto), "Fechar". `Alert` azul se o envio está incompleto; `Alert` âmbar listando quem está fora do projeto ou com chave não cadastrada. `Tabs` com contador: Batem, Divergentes, Fora do projeto, Chave não cadastrada, Erros, Descartados. Tabela: Página, Nome, Chave Pix (mascarada), Valor, Data, Observação, ação Descartar/Restaurar. Confirmado vira só leitura.
- **Histórico de envios:** tabela clicável (Data, Situação, Comprovantes, Fora do projeto em âmbar, Total pago).
- **Confirmações:** `ConfirmModal` "Confirmar baixa" (quantas pessoas, comprovantes, total; com `WhatsappSendOption`) e "Cancelar envio" (`danger`).
- **Estados:** skeleton no título, nos KPIs e no histórico; caixa vermelha para erro de carga; vazios por aba ("Nenhuma divergência."); toasts de sucesso com números.

### 12.3 `/ganhos` — Meus ganhos (entrevistador)

- **Arquivo:** `frontend/src/app/ganhos/page.tsx` · **Quem:** entrevistador com ficha aprovada.
- **Seções:** sobretítulo "Financeiro" + "Meus ganhos"; faixa informativa com o prazo de pagamento e "Próximo pagamento previsto: data — valor"; 4 KPIs (Total acumulado, Este mês, Entrevistas validadas, Média por entrevista) com chip colorido; "Ganhos por projeto" em cards (valor, % do total, Por entrevista / Feitas / Recebido, meta com `Progress` ou badge "Meta atingida") paginados de 8 em 8; botão "Ver entrevistas (n)" abre `Sheet` com tabela Data, Horário, Pagamento (`PaymentStatus`), Valor.
- **Estados:** 4 `Skeleton h-28`; vazio "Nenhuma entrevista validada ainda. Candidate-se a um projeto para começar a ganhar."

### 12.4 `/admin/ganhos` — Ganhos (admin e supervisor)

- **Arquivo:** `frontend/src/app/admin/ganhos/page.tsx` · **Quem:** `admin`, `supervisor`.
- **Seções:** 3 KPIs gerais (Total pago, Entrevistas validadas, Média por entrevista); busca e grade de projetos selecionáveis (card-botão com anel azul no selecionado), paginada de 12 em 12; card "Total pago no projeto" com prazo e `ExportCsvButton`; lista "Por entrevistador" em `Collapsible` (total, quantidade editável inline, tabela com `PaymentStatus` e excluir entrevista via `ConfirmModal` `danger`), paginada de 20 em 20.
- Serve de referência de layout, mas tem as lacunas citadas no §11.

---

## 13. Testes

### 13.1 Vitest — lógica pura de `src/lib`

`vitest.config.mts`: ambiente `node`, alias `@`, inclui só `src/**/*.test.ts`, exclui `e2e/**`. O que precisa de `window`/`fetch` é simulado no próprio teste:

```ts
beforeEach(() => {
  store = {};
  vi.stubGlobal("window", { localStorage: { getItem: (k) => store[k] ?? null, setItem: …, removeItem: … } });
});
afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("fetch inesperado");
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

it("remove o prefixo 'Value error, ' do Pydantic", async () => {
  mockFetch(Response.json({ detail: "Value error, Senha muito fraca" }, { status: 422 }));
  const err = await getUserById(1).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.message).toBe("Senha muito fraca");
});
```

Existentes para copiar: `api.test.ts` (erros, Bearer, refresh no 401, paginação, download), `time.test.ts` (fuso, `formatIsoDay`, links internos), `download.test.ts`, `validators.test.ts`. Toda função nova de formatação, permissão ou cálculo em `lib/` ganha teste.

### 13.2 Playwright — telas de ponta a ponta

`playwright.config.ts`:
- sobe **backend na 8001** rodando antes `backend/scripts/seed_e2e.py` (apaga e recria `backend/e2e.db`, SQLite) e o uvicorn; e **front na 3001** (`next dev`) com `NEXT_PUBLIC_API_URL` apontando para ele; `reuseExistingServer: false` (sempre do zero);
- segredos e serviços só de teste no `env` (chaves fictícias, MinIO inexistente, `RATE_LIMIT_ENABLED=false`, rotinas em segundo plano desligadas);
- `workers: 1`, `fullyParallel: false` (um banco só), `retries` 1 na CI, `timeout` 90 s, `expect` 15 s;
- `locale: "pt-BR"`, `timezoneId: "America/Sao_Paulo"`, `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`; só Chromium;
- portas trocáveis por `E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT`; Python por `E2E_PYTHON`.

**Seed:** `seed_e2e.py` só roda com `DATABASE_URL` terminando em `e2e.db` (nunca apaga banco real), cria dados fictícios e determinísticos e não imprime nada sensível. Cada teste usa **um projeto próprio do seed** (os testes compartilham o banco). No Financeiro, faça igual: script de seed com trava de segurança + `fixtures.ts` com os mesmos usuários.

**Fixtures** (`e2e/fixtures.ts`): `E2E_PASSWORD`, `USERS` (CPF fictício + nome por papel), `PROJECTS`, `submitLogin`, `loginAs(page, "financeiro")` (espera sair do `/login` e o botão "Sair" aparecer), `projectCard(page, título)`.

**Dados sensíveis em teste:** comprovante é gerado na hora com `pdf-lib` (`e2e/receipts.ts`), com nomes, chaves e IDs fictícios. Nunca use comprovante ou PDF real.

**Padrão de spec:** localizar por papel/nome/texto visível, como o usuário vê; cobrir o caminho feliz **e o caso negado**; quando há dois papéis, usar dois `browser.newContext()`.

```ts
test("financeiro baixa a planilha de pagamentos do projeto", async ({ page }) => {
  await loginAs(page, "financeiro");
  await expect(page).toHaveURL(/\/financeiro$/);
  const card = page.locator('[data-slot="card"]').filter({ hasText: PROJECTS.financeiro });
  await card.getByRole("link", { name: "Abrir Financeiro" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar planilha de pagamentos" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.xlsx$/);
});
```

Caso negado (de `e2e/orcamento.spec.ts`):

```ts
test("lançar entrevistas acima do orçamento é bloqueado; dentro do orçamento funciona", async ({ page }) => {
  // Seed: orçamento R$ 500, 24 × R$ 20 já lançados → restam R$ 20
  await loginAs(page, "supervisor");
  …
  await quantity.fill("2");
  await sheet.getByRole("button", { name: "Lançar", exact: true }).click();
  await confirm.getByRole("button", { name: "Lançar", exact: true }).click();
  await expect(page.getByText(/restam R\$\s20,00/)).toBeVisible();   // bloqueado, mensagem clara
  …
});
```

Outros casos negados existentes: senha errada fica no login com "CPF ou senha incorretos"; entrevistador com ficha em rascunho vê o menu travado (`aria-disabled`) e o aviso; supervisora sem permissão vê o campo de orçamento desabilitado com "Só pessoas autorizadas podem alterar o orçamento." Dinheiro em asserção: use `R\$\s` (o `Intl` põe espaço não separável).

Comandos:

```bash
npm run e2e                              # tudo, headless
npm run e2e:ui                           # interativo
npx playwright test e2e/financeiro.spec.ts
```

---

## Checklist

Copie para o PR do Financeiro e marque cada item.

- [ ] `package.json` com Next **16.4.2**, React **19.2.8**, Tailwind 4, `radix-ui`, `lucide-react`, `sonner`, `react-imask`, Vitest 3 e Playwright 1.64; Node 22.
- [ ] `frontend/AGENTS.md` copiado; código de rota conferido em `node_modules/next/dist/docs/`.
- [ ] `npx next typegen` roda antes do `npx tsc --noEmit` (local e CI).
- [ ] `components.json` igual (new-york, neutral, cssVariables, alias `@/components/ui`).
- [ ] `globals.css` copiado com os 7 tokens `brand-*`, `--radius: 0.75rem` e o bloco `@theme inline`; nenhum hex solto no JSX.
- [ ] Open Sans via `next/font/google`, `<html lang="pt-BR">`, `Toaster position="bottom-center" richColors`; sem dark mode.
- [ ] `src/components/ui/` copiada; `npm run check:ui` passando (sem `<button>`, `<select>`, `<textarea>`, `<table>`, checkbox/radio nativos, `SelectItem value=""`), com o bloco de `data-tour` removido ou ajustado.
- [ ] `ConfirmModal`, `Toast`, `PaymentStatus`, `DataPagination`, `ExportCsvButton`, `MaskedInput`, `RequireAuth`, `Sidebar` reaproveitados, não reescritos com outro visual.
- [ ] Nenhum `fetch` fora de `src/lib/api.ts`; erros mostrados com `ApiError.message` (o `detail` do backend).
- [ ] Toda página: `RequireAuth role=[…]` + `Sidebar` + `<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">`; menu por papel na `Sidebar`.
- [ ] Toda lista tem os quatro estados: `Skeleton`, vazio com próximo passo, erro (toast ou `InlineError`), sucesso com toast numérico.
- [ ] Toda ação irreversível passa por `ConfirmModal` com resumo (quantos, quanto, quem).
- [ ] Dinheiro com `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`; datas com `formatIsoDay` / `formatDateTimeBr` / `todayInSaoPaulo` (fuso de São Paulo).
- [ ] Chave Pix só mascarada na tela; chave completa só na planilha do Financeiro, com download registrado; CPF nunca listado.
- [ ] Textos em pt-BR simples, sem jargão, plural correto.
- [ ] Botões só de ícone com `aria-label`; todo campo com `Label`; status com texto além da cor; `Spinner` com rótulo em pt-BR.
- [ ] Vitest cobre cada função nova de `src/lib`; `npm test` verde.
- [ ] Playwright com seed fictício travado em `e2e.db`, `fixtures.ts` com `loginAs`, um spec por fluxo com caminho feliz **e** caso negado; `npm run e2e` verde.
- [ ] `npm run lint` verde.
