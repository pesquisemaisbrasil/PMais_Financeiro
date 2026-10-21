# Spec: Regras de pagamento de campo

> **Módulo 5 — Folha de campo e pagamento em lote.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato da tabela de valores que define quanto cada pessoa de campo recebe e da versão de cada valor ao longo do projeto. Substitui as colunas de valor da folha em planilha e o "começo com 45, passa para 50, passa para 100" feito à mão [S1 14:54].

## Comportamento

- Cada projeto tem uma **tabela de regras**. Cada regra tem:
  - **tipo**: `entrevista` | `hora` | `diaria` | `supervisao` | `recrutamento` | `incentivo_respondente` | `bonus` | `reembolso`;
  - **valor** unitário;
  - **aplica-se a**: todos, uma função (entrevistador, recrutador, supervisor), um perfil de cota/segmento (por exemplo, especialidade médica) ou uma pessoa específica;
  - **vigência**: de/até (data da produção, fuso de São Paulo);
  - motivo, autor e aprovação.
- **Mudar um valor no meio do campo** cria uma **nova versão** com vigência a partir de uma data, sem mexer no que já foi produzido. A tela mostra a linha do tempo dos valores ("R$ 45 até 10/03 → R$ 50 até 20/03 → R$ 100").
- **Simulador:** dada uma pessoa, um período e as quantidades, mostra o valor calculado e qual versão de regra foi usada. Serve para conferir antes de aprovar a folha.
- **Entrevistas do Connect:** o valor já vem congelado do Connect (`earnedValue`). O valor por entrevista é do Connect ([handoff/01](../handoff/01-visao-escopo-e-decisoes.md)); aqui não existe regra de entrevista editável.
- **Incentivo ao respondente:** valor por perfil (por exemplo, por especialidade) e fonte (`caixa_proprio` → vira pagamento; `link_cliente` → só informativo, não paga).

## Regras

1. Cada lançamento de folha guarda o ID da **versão** da regra usada. Mudar a regra depois não altera lançamentos aprovados.
2. Versões do mesmo tipo e do mesmo alvo **não podem se sobrepor** na vigência.
3. Vigência retroativa (início antes de hoje) só com autorização de um administrador e motivo. Recalcula apenas lançamentos ainda **não aprovados**; os aprovados geram uma divergência para ajuste manual.
4. Precedência quando mais de uma regra serve: pessoa específica > perfil > função > todos.
5. Aumento de valor acima de X% (a validar) sobre a regra anterior exige aprovação conforme a alçada e avisa o financeiro.
6. Sem regra vigente para um lançamento, não há cálculo: o lançamento fica `sem_regra` e não entra na folha aprovada [SWOT §7: "sem regra ativa, não calcular/pagar"].
7. Valor > 0, 2 casas. `bonus` e `reembolso` exigem justificativa por lançamento.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Criar uma versão que sobrepõe outra vigente | 409 | Já existe um valor de {tipo} vigente nesse período para {alvo} |
| Vigência retroativa sem administrador | 403 | Mudança retroativa de valor precisa de autorização de um administrador |
| Editar uma versão já usada em folha aprovada | 409 | Esse valor já foi usado em folha aprovada — crie uma nova versão |
| Lançar produção sem regra vigente | 422 | Não há valor de {tipo} vigente em {data} para esta pessoa |
| Editar a regra de entrevista quando o dono é o Connect | 409 | O valor por entrevista é definido no P+ Connect |

## Critérios de aceite

- [ ] Projeto com entrevista a R$ 45 até 10/03 e R$ 50 a partir de 11/03: 38 entrevistas de 01–10/03 e 12 de 11–15/03 dão 38 × 45 + 12 × 50 no simulador e na folha.
- [ ] Mudar o valor de diária hoje não altera a folha aprovada ontem.
- [ ] Regra específica para uma pessoa vence a regra geral, e o simulador mostra qual foi usada.
- [ ] Produção de um dia sem regra fica `sem_regra` e bloqueia a aprovação daquela linha.
- [ ] Incentivo com fonte "link do cliente" aparece no relatório, mas não entra no lote.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:


- [S1 14:54–16:04]: colunas de valor da entrevista, supervisão e diária; variação de valor por dificuldade.
- [S1 59:15]: em SP paga-se por entrevista realizada; no CATI, por hora/diária.
- [S2 28:01, 30:54]: incentivo por pessoa e por especialidade.
- [SWOT RF04, S04]; [Connect: projetos-cotas-e-orcamento] (valor congelado no lançamento).
