# Busca em todo o sistema

Pedido do Bruno em 18/11/2026: uma busca no alto de todas as telas. Ao procurar "Itaú", aparece o que existe com essa palavra, separado em contas a pagar, contas a receber, notas, projetos, clientes e os outros cadastros, com a palavra destacada.

## 1. Comportamento

- A busca **"Buscar em todo o sistema"** fica na faixa do alto de todas as telas, à direita das abas, para quem entra no Financeiro (papéis `financeiro` e `admin`). Ela fica **recolhida**, só a lupa com "Ctrl K": **Ctrl+K** (ou ⌘K no Mac) ou o clique na lupa abrem o campo já com o cursor, em qualquer tela. Esc, o clique fora ou abrir um resultado a recolhem de novo.
- A partir de 2 letras, a busca começa sozinha, um instante depois da última tecla. O resultado aparece embaixo da barra, **separado por grupo**, nesta ordem, e só aparecem os grupos com resultado:
  1. **Contas a pagar**: descrição, fornecedor ou favorecido, número do documento, plano de contas, projeto e valor;
  2. **Contas a receber**: descrição, contrato, número do documento, cliente, projeto e valor;
  3. **Notas fiscais**: as contas a pagar e a receber com documento **NF** que a busca achou ("NF 4521 · Gráfica Ponto Certo");
  4. **Projetos**: código ("1804" ou "PRJ-1804"), nome e cliente;
  5. **Clientes** e **Fornecedores**: código, apelido, nome e CNPJ;
  6. **Plano de contas**, **Centros de custo**, **Unidades**, **Empresas** e **Contas bancárias** (nome e banco).
- Cada grupo mostra quantos achou e os **5 primeiros**. Contas vêm da mais recente para a mais antiga. Com mais de 5, **"Ver todos os N em …"** abre a tela do grupo já com a busca aplicada.
- A palavra buscada aparece **marcada** no título e na linha de baixo de cada resultado.
- O clique leva ao item:
  - **conta a pagar** e **nota de conta a pagar**: Contas a pagar com a conta aberta (`/contas-a-pagar?modo=tudo&conta=ID`);
  - **conta a receber** e **nota de conta a receber**: Contas a receber com o detalhe aberto (`?modo=tudo&conta=ID`);
  - **projeto**: Relatório do projeto (`/relatorios/projeto?codigo=1804`);
  - **cadastros**: a aba do cadastro com a busca preenchida (`/cadastros?aba=customers&busca=Alfa`).
- **Enter** abre o primeiro resultado; **Esc** ou um clique fora fecha a lista.

## 2. Regras

1. **A regra de toda caixa de busca do sistema** (Bruno, 18/11: "Todas as barras de pesquisa tem que reconhecer mesmo se eu escrever sem ser minúsculo, exatamente a palavra, se for com ou sem acento"): **sem acento** e **sem diferença de maiúscula** ("itau" acha "Itaú"), e cada palavra precisa aparecer, em qualquer pedaço e em qualquer ordem ("certo PON" acha "Gráfica Ponto Certo"). Vale aqui, em Contas a pagar, Contas a receber, Cadastros (todas as abas, Feriados também), Relatório do projeto, na busca dentro das caixas de seleção e na busca de pessoas da lista de pagamento. No código é uma função só de cada lado: `core/text.matches_words` no servidor e `matchesSearch` (`frontend/src/lib/search.ts`, que o `filterOptions` usa) na tela. Nas contas, um **valor** ("1.250,00", "R$ 1.250") acha a conta com esse valor, principal ou líquido.
2. Só procura no que as telas já mostram para o financeiro. **Não procura** em e-mail, telefone ou contato de cliente e fornecedor, nas pessoas das listas de pagamento (entrevistados) nem em chave Pix (LGPD: minimização).
3. Conta apagada não aparece. Cadastro inativo e projeto encerrado ou inativo aparecem, com "inativo" ou "encerrado" na linha de baixo.
4. **O termo buscado não vai para o log** (pode ter nome de pessoa) e não é guardado.
5. A busca roda no servidor, olhando os registros em memória, como a busca da lista de contas: assim vale igual no Postgres e no SQLite dos testes, sem acento. Serve para o volume de hoje (milhares de contas); se ficar lenta, a troca é por índice de texto no Postgres.

## 3. Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Sem login | 401 | (o padrão da autenticação) |
| Papel sem acesso ao Financeiro | 403 | (o padrão das rotas do financeiro) |
| Menos de 2 letras (fora os espaços) | 422 | Digite ao menos 2 letras para buscar |
| Mais de 80 letras | 422 | A busca aceita até 80 letras |
| Excesso de buscas | 429 | Muitas tentativas — aguarde alguns minutos |

Na tela, com 1 letra aparece "Digite ao menos 2 letras." e, sem achado, "Nada encontrado para “…”.".

## 4. Critérios de aceite

- [x] "itau" acha a conta bancária "Itaú · PPlus", com "Itaú" marcado.
- [x] Um cliente aparece em Contas a receber e em Clientes, cada um no seu grupo, e o clique abre o cadastro com a busca preenchida.
- [x] O clique numa conta a pagar abre Contas a pagar com a conta aberta.
- [x] Cada grupo mostra os 5 primeiros e o total; "Ver todos" leva à tela com a busca.
- [x] Número de NF e valor também acham a conta.
- [x] E-mail de contato de cliente não é encontrado; conta apagada não aparece.

## 5. Onde está no código

- `backend/services/search.py` (regra e grupos), `backend/api/search.py` (`GET /search?q=`), `backend/schemas/search.py`
- `frontend/src/components/GlobalSearch.tsx` (a barra, no `app/(app)/layout.tsx`), `frontend/src/lib/search.ts` (destaque sem acento)
- `?busca=` e `?conta=` nas telas: `contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx`, `cadastros/page.tsx`
- Testes: `backend/tests/test_busca_geral.py`, `frontend/src/lib/search.test.ts`, `frontend/e2e/busca-geral.spec.ts`

## Ajustes

- 2026-11-24: a busca fica recolhida na faixa do alto, à direita das abas, e abre com Ctrl+K ou com o clique na lupa. A faixa tem a altura do cabeçalho do logo no menu, e a linha de baixo dela continua a do logo. Pedido do Bruno.
