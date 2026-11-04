# Spec: Folha de campo

> **Módulo 5 — Folha de campo e pagamento em lote.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato do ciclo de folha de pagamento da equipe de campo (entrevistador, recrutador, supervisor) por projeto. Substitui o fluxo "supervisor monta planilha → gestora relança → um e-mail por folha ao financeiro → financeiro devolve o consolidado → gestora confere de novo" [S1 27:59–51:09].

A reunião de 21/10 confirmou o caminho [Reunião 21/10 24:10–25:50]:
- hoje: o entrevistador manda a NF ao supervisor, o supervisor faz a folha, a gestão confere e manda ao financeiro;
- daqui para a frente: o supervisor **lança no Connect**, o entrevistador **sobe a NF no sistema** e a folha chega ao financeiro sem e-mail.

## Comportamento

- **Data de pagamento.** Decidido ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md), D9): o **supervisor define o prazo de cada projeto** e ele **vale para todas as equipes**. A tabela abaixo é só a **orientação** de como cada área conta hoje; não é regra do sistema. Falta só decidir o formato do prazo (dias depois do lançamento ou depois do fim do projeto) [Reunião 21/10 25:52–29:06]:

| Área | Regra |
|---|---|
| Pesquisas de consumo (central de SP) | 15 dias corridos depois do **fim do projeto** |
| Health | 2 vezes por mês, em datas combinadas com o financeiro (começo do mês e depois do dia 20) |
| CATI (Curitiba) | 10 dias depois do fim do projeto |

- **Folha proporcional:** projeto grande pode ter uma ou mais folhas **antecipadas** no meio do campo, mais a folha final. A folha prevista já nasce como provisão no fluxo de caixa ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md)) [Reunião 21/10 26:51–27:37].
- Cada projeto tem uma **folha por data de pagamento**, aberta automaticamente.
- **Linhas da folha** (uma por pessoa × tipo × regra):
  - **automáticas:** entrevistas validadas vindas do Connect, já com valor, só para conferência e visão completa (o pagamento delas segue [../comprovantes-e-baixa](comprovantes-e-baixa.md));
  - **lançadas pelo supervisor ou pela gestora** (de preferência no Connect, junto com as entrevistas; pendência F11): horas, diárias, supervisão, recrutamento, incentivo, bônus e reembolso, com quantidade, data e evidência opcional;
  - **documento fiscal** por pessoa: NF enviada, RPA ou "NF pendente" (só aviso) ([documentos-fiscais](documentos-fiscais.md));
  - o valor é sempre **calculado pela regra vigente** ([regras-de-pagamento-de-campo](regras-de-pagamento-de-campo.md)), nunca digitado.
- **Conferência** (tela da gestora):
  - por pessoa: quantidade, valor, regra usada e a diferença em relação ao ciclo anterior;
  - **checagens automáticas**:
    - entrevistas declaradas × validadas no Connect;
    - online × verificação: a quantidade por pessoa na verificação [S1 32:13];
    - pessoa sem candidatura aprovada no projeto;
    - diária num dia sem produção;
    - mesma pessoa em dois projetos no mesmo dia por diária;
    - valor fora do padrão do projeto;
    - linha sem regra;
  - cada checagem com problema vira **exceção**, que a gestora aceita (com justificativa) ou devolve ao supervisor.
- **Estados:** `aberta` → `em_conferencia` (o supervisor envia) → `aprovada` (a gestora aprova) → `em_lote` → `paga` / `paga_parcial`. A gestora pode **devolver** ao supervisor, com comentário por linha.
- **Incentivo ao respondente** [Kickoff 03/11 13:23–17:50]: entra por **planilha importada** em [contas-a-pagar](contas-a-pagar.md), não por linha lançada à mão. O prazo vem do **tipo do projeto**, em **dias úteis a partir da data da resposta**, e a planilha é dividida em **um lançamento por data de pagamento** (cronograma). Projeto sem incentivo não recebe planilha. Pendências F22 a F24.
- **Onde se paga** [Kickoff 03/11, K10]: a folha aprovada e o lote viram **lançamentos agrupados em [contas-a-pagar](contas-a-pagar.md)**, e é lá que o financeiro abre os itens, importa planilha, baixa e anexa comprovantes. A tela de folha é de conferência e aprovação; não é onde se paga ("o nosso dia a dia é contas a pagar", Bruna).
- **Visão consolidada do ciclo** (para o financeiro): todas as folhas aprovadas do ciclo, de todos os projetos, por pessoa e por projeto. Substitui o "resumo das folhas" que o financeiro monta hoje [S1 50:35].
- O supervisor vê só os seus projetos e a chave Pix mascarada, e não aprova. Isso depende de ele ganhar acesso ao Financeiro (F11); a alternativa é lançar no Connect e chegar por evento ([papeis-e-escopo-ampliados](papeis-e-escopo-ampliados.md) regra 5).

## Regras

1. Uma folha por projeto × data de pagamento (o mesmo vale para o lançamento de incentivos: um por data). Lançamento depois de a folha ser aprovada vai para a próxima, marcado "atrasado".
2. A folha chega ao financeiro **pelo menos 3 dias antes** da data de pagamento. Menos que isso fica marcado "documentação atrasada" [Reunião 21/10 27:41–28:07].
3. **A NF não bloqueia o pagamento.** Quem recebe por NF e não enviou a nota continua na folha e no lote, com o aviso "NF pendente" (decisão do PO em 28/10/2026).
4. **Não há relançamento:** a folha aprovada é a mesma que vira lote. Ninguém redigita valor [SWOT PT2].
5. Aprovação exige zero exceção pendente: cada exceção aceita ou corrigida.
6. Aprovar a folha cria lançamentos `comprometido` no ledger. Pagar transforma em `realizado`. Ver [orcamento-e-saude-financeira](orcamento-e-saude-financeira.md).
7. Linha `pendente_autorizacao` por estouro de categoria não entra na folha aprovada até a autorização do administrador.
8. A mesma entrevista do Connect não entra em duas folhas (chave = ID da entrevista).
9. Depois de aprovada, a folha só muda por **ajuste no ciclo seguinte** (linha de ajuste positiva ou negativa com referência), nunca por edição.
10. Quem aprova a folha não pode pagar o lote dela ([papeis-e-escopo-ampliados](papeis-e-escopo-ampliados.md) regra 3).
11. Contestação do entrevistador ("fiz mais e não entrou" [S1 42:55]) é registrada como exceção do ciclo, com evidência e decisão. Pelo Connect, em etapa posterior (a validar).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Aprovar com exceções pendentes | 409 | Há N exceções sem decisão nesta folha |
| Supervisor tenta aprovar | 403 | Só a gestora do projeto aprova a folha |
| Lançar para pessoa sem candidatura aprovada no projeto | 409 | Essa pessoa não está aprovada neste projeto |
| Editar uma linha de folha aprovada | 409 | Folha aprovada — lance um ajuste no próximo ciclo |
| Lançar na folha de projeto fechado | 409 | Projeto fechado — peça a reabertura a um administrador |
| Entrevista do Connect já presente em outra folha | 409 | Essa entrevista já está na folha de {ciclo} |

## Critérios de aceite

- [ ] Um projeto de consumo encerrado em 21/10 ganha a folha final com data de pagamento 05/11 (15 dias corridos), e as entrevistas validadas no Connect entram sozinhas.
- [ ] Uma folha recebida 1 dia antes da data de pagamento aparece como "documentação atrasada".
- [ ] Um entrevistador NF sem nota aparece com o aviso "NF pendente" e vai para o lote normalmente.
- [ ] Uma planilha de incentivos com respostas de 4 datas gera 4 lançamentos de pagamento, cada um 10 dias úteis (projeto Health) depois da sua data.
- [ ] Uma planilha de incentivos que já traz "pagar em 12/11" gera um lançamento com vencimento 12/11, sem usar o prazo do projeto.
- [ ] Uma folha aprovada aparece como lançamento agrupado em Contas a pagar, com os itens abertos na lista, e a baixa é feita lá.
- [ ] O supervisor lança 5 diárias; o valor aparece pela regra vigente, sem digitação.
- [ ] Uma pessoa com 12 entrevistas declaradas e 9 validadas no Connect gera uma exceção que bloqueia a aprovação até a decisão.
- [ ] Uma diária em dia sem produção aparece como exceção; aceitar pede justificativa.
- [ ] A gestora devolve a folha com comentário na linha; o supervisor corrige e reenvia.
- [ ] O financeiro vê o consolidado do ciclo com 25 folhas aprovadas numa tela só, por pessoa e por projeto, com o total batendo com a soma das folhas.
- [ ] Na execução paralela, os totais por pessoa batem 100% com a folha manual do mesmo ciclo.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 24:10–29:06]: fluxo atual da folha, prazos por área, folha proporcional, antecedência de 3 dias.
- [S1 13:41–17:48]: fechamento e conferência de folha como os maiores consumidores de tempo; 25 folhas por quinzena.
- [S1 27:59–32:13, 50:35–51:09]: fluxo supervisor → gestora → financeiro → consolidado → conferência.
- [S1 32:13–33:04]: checagem online × verificação.
- [Kickoff 03/11 13:23–17:50]: incentivo por planilha, prazo em dias úteis por tipo de projeto e divisão por data.
- [SWOT P04, S04, PT2, RF05].

## Ajustes

- 2026-10-28: a regra 3 e o critério de aceite da NF mudaram: **a NF continua subindo no Connect, mas não é obrigatória para pagar.** "NF pendente" é só aviso, e quem está com NF pendente entra na folha e no lote. Decisão do PO em 28/10/2026 (ver [documentos-fiscais](documentos-fiscais.md)).
- 2026-11-03 (falas da Bruna e da Camila): a folha e o incentivo são **pagos em Contas a pagar**, o único lugar de pagamento; a planilha de incentivo que **já traz a data de pagamento** usa essa data (K10, K12; B5, C1, B8).
- 2026-11-03: o **incentivo ao respondente** entra por planilha importada, com prazo em **dias úteis a partir da data da resposta**, por tipo de projeto, e **um lançamento por data de pagamento** ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K5 a K7). O prazo de campo da D9 segue valendo para as demais equipes.
