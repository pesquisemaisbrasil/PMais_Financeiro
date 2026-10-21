# Spec: Papéis e escopo ampliados

> **Módulo 2 — Cadastros, papéis e migração.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

## Comportamento

- Cada usuário tem um papel e um **escopo**: empresas e unidades, e opcionalmente uma lista de projetos.
- Papéis novos:

| Papel | Quem é | Faz |
|---|---|---|
| `direcao` | Direção | Vê tudo do escopo; aprova acima da alçada da gestora, o orçamento de abertura e o fechamento negativo |
| `gestor_projeto` | Gestora operacional / analista de projeto | Abre, acompanha e fecha os seus projetos; lança custos; **aprova a folha**; justifica o resultado |
| `supervisor` | Supervisor de campo | Vê a folha dos seus projetos e envia lançamentos de diária/hora/supervisão; **não aprova** e não vê chave Pix |
| `comercial` | Comercial / orçamentos | Cria a proposta e o orçamento inicial; vê o resultado dos projetos dos seus clientes |
| `auditor` | Auditoria / DPO | Só leitura, inclusive da trilha; não exporta chave Pix |

## Regras

1. **Matriz de permissões** (C = criar, E = editar, V = ver, A = aprovar, X = exportar; `financeiro` e `admin` como hoje, mais o que a tabela soma):

| Área | direcao | gestor_projeto | supervisor | financeiro | comercial | auditor |
|---|---|---|---|---|---|---|
| Cadastros/dimensões | V | V | — | CEV | V | V |
| Projeto (ficha) | CEVA | CEV (seus) | V (seus) | V | CV | V |
| Orçamento por rubrica (fora entrevistas) | CEVA | E dentro da alçada | V valores | CEV | CV (proposta) | V |
| Lançamento de custo | V | CEV (seus) | C (diária/hora/supervisão, seus) | CEV | — | V |
| Folha | VA | VEA (seus) | V (seus) | V | — | V |
| Lote, planilha e chave Pix completa | — | — | — | como hoje | — | — |
| AP/AR, baixas | V | V (seus projetos) | — | CEVX | V (AR dos seus clientes) | V |
| Bancos/conciliação | V | — | — | CEV | — | V |
| Relatórios/DRE/fluxo | VX | VX (seus) | — | VX | V (seus clientes) | VX |

2. Fora do escopo de empresa/unidade/projeto, a resposta é 404.
3. **Segregação:**
   - quem aprova a folha não pode pagar o lote dela;
   - quem cria um título acima da alçada não o baixa sozinho.
4. Supervisor com escopo por projeto desde o início (lacuna Z1 do Connect, [handoff/06 §13](../handoff/06-seguranca-e-lgpd.md)).
5. Alternativa a avaliar com a Vivi: o supervisor lança diárias e horas **no Connect**, e o Financeiro recebe por evento, sem o supervisor ter login aqui.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Ação fora do papel | 403 | Seu perfil não permite essa ação |
| Registro fora do escopo | 404 | (registro não encontrado) |
| Quem aprovou a folha tenta pagar o lote (ou o inverso) | 409 | Quem aprova a folha não pode ser quem paga o lote |
| Supervisor tenta ver chave Pix | 403 | Só o Financeiro pode ver a chave Pix completa |

## Critérios de aceite

- [ ] Um usuário com escopo "Empresa A" não vê nada da Empresa B, nem pela URL direta.
- [ ] O supervisor vê a folha do seu projeto com as chaves mascaradas e sem "Aprovar".
- [ ] Aprovar a folha e pagar o lote com o mesmo usuário é recusado.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:


- [SGE4B §5.9]; [SWOT §6.1, §7]; [S1 44:11]: o papel da gestora é aprovar.
- Pendências F5 (alçadas), F8 (multiempresa), F11 (papéis), Q1 (supervisor).
