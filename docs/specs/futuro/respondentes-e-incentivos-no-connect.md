# Spec (futuro): Respondentes e incentivos no Connect

> **Não implementar sem decisão do PO.** Origem: kickoff com o financeiro em 03/11 ([registro](../../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K5 a K7, K12). Hoje o incentivo chega por planilha de e-mail e é **importado em [contas-a-pagar](../contas-a-pagar.md)**; isso é o que está no escopo.

## Comportamento

Três pedaços, todos no Connect, que o Financeiro só leria:

- **FU1, respondentes (entrevistados):** o Connect passa a ter a base de respondentes, fechando o ecossistema **coordenador → supervisor → entrevistador → entrevistado**. A pessoa que respondeu a entrevista, com a data da resposta, fica registrada lá.
- **FU2, incentivo gerado pelo Connect:** a planilha de incentivos deixa de vir por e-mail e **sai do Connect**, com um item por respondente e **a data de pagamento de cada resposta** (não uma data única). O Financeiro recebe isso como lançamentos agrupados em Contas a pagar, um por data de pagamento, como na importação de hoje.
- **FU3, tipo de projeto no Connect:** o coordenador marca no projeto o **tipo de projeto, se tem incentivo e o prazo**. O Financeiro lê esses campos em vez de tê-los no cadastro de projeto dele (pergunta F23).

Proposta (a validar): a importação de planilha do Financeiro **continua existindo** mesmo depois disso, porque nem todo incentivo virá do Connect (por exemplo, o caso em que o cliente manda a planilha pronta, com a data de pagamento).

## Regras

1. (a validar) O Connect é dono de respondentes, tipo de projeto e prazo; o Financeiro lê e **não copia pessoas** ([../integracao-com-o-connect](../integracao-com-o-connect.md)). O respondente é dado pessoal e entra na análise de LGPD antes de existir.
2. (a validar) O incentivo gerado pelo Connect respeita a mesma regra de hoje: **dias úteis a partir da data da resposta**, com feriados, e **um lançamento por data de pagamento**. Uma data única para a planilha inteira seria errado (fala da Camila, 17:24).
3. (a validar) Projeto sem incentivo não gera incentivo; o campo "tem incentivo" do projeto decide.
4. (a validar) Se o Connect e uma planilha importada trouxerem o mesmo respondente na mesma data, o sistema avisa duplicidade em vez de pagar duas vezes.

## Casos negados

(a definir com o financeiro)

## Critérios de aceite

(a definir quando o PO trouxer o tema para o escopo)

## Por que é futuro

- O **Connect não tem entrevistados hoje**. João, no kickoff: "é uma evolução futura do Connect, ter esse ecossistema completo: coordenador, supervisor, entrevistador e entrevistado" (14:45–15:07).
- O foco atual é substituir o SGE4B e pagar entrevistadores; o incentivo já tem caminho funcionando pela importação (K5, K6).
- Depende de decisões em outro repositório (o Connect) e de LGPD, porque o respondente é dado pessoal.

## O que já foi dito na reunião

- **Camila, 14:09–14:42 (FU1):** "A gente recebe por e-mail a planilha. Porém, se o Connect tiver o link do banco de dados dos respondentes… pode ser que se consiga de lá", porque o supervisor e o coordenador já vão saber quantas entrevistas o pessoal fez. Hoje "a planilha de incentivos eles puxam do banco de dados".
- **João, 13:23–15:07 (FU1):** reconheceu que se enganou ao dizer que o Connect tinha isso; "ainda não tem por agora".
- **Bruno, 16:31–17:10 (FU2, FU3):** sugeriu separar no Connect "que tipo de projeto, se ele tem incentivo ou não, depende da data de pagamento", porque nem todo projeto tem incentivo.
- **João, 17:10 (FU2):** "a gente faz a importação de planilha automatizada aqui, que já reconhece a planilha e lança como contas a pagar, ou é no Connect." Decisão atual: importação no Financeiro.
- **Camila, 17:24 (FU2):** "o problema de lançar direto no contas a pagar é essas datas": o pessoal respondeu em várias datas e ela distribuiria em 5 dias diferentes, mas o Connect lançaria uma data só.
- **Bruna, 17:40 (FU2):** "o sistema teria que ler a coluna da data da pesquisa para destrinchar o que vai ficar em cada dia."
- **Bruna, 15:07–16:27 (FU3):** o prazo depende do tipo de projeto (Health: 10 dias úteis; "CLT": 3 a 4).

## O que o Financeiro faz hoje no lugar

- O financeiro recebe a **planilha por e-mail** e a **importa** em Contas a pagar ([contas-a-pagar](../contas-a-pagar.md), [folha-de-campo](../folha-de-campo.md)).
- O sistema lê a coluna "data da pesquisa" (ou a data de pagamento, quando a planilha já a traz) e gera **um lançamento por data de pagamento**, com o prazo em dias úteis do tipo de projeto ([regras-de-pagamento-de-campo](../regras-de-pagamento-de-campo.md)).
- Tipo de projeto, "tem incentivo" e prazo ficam no cadastro de projeto do Financeiro, no protótipo e até a pergunta F23 ser decidida.

## Origem

- [Kickoff 03/11 13:23–17:50]: respondentes, incentivo por planilha, tipo de projeto e data de pagamento por resposta.
- Perguntas para decidir:
  - O Connect passa a ter respondentes? Em que fase, e quem cadastra (o supervisor, uma importação, um formulário)? ([F26](../../planning/perguntas-abertas.md#escopo-futuro))
  - O respondente é dado pessoal: que dados o Connect guarda (nome, CPF, chave Pix)? O que o DPO diz? O Financeiro recebe o CPF e a chave Pix ou só um identificador?
  - Quem marca o tipo de projeto, "tem incentivo" e o prazo: o coordenador, ao abrir o projeto? ([F23](../../planning/perguntas-abertas.md#kickoff-de-0311-novas))
  - A tabela de prazos por tipo de projeto (Health 10 dias úteis, "CLT" 3 a 4) é a mesma no Connect e no Financeiro? ([F22](../../planning/perguntas-abertas.md#kickoff-de-0311-novas))
  - O incentivo gerado pelo Connect substitui a planilha por e-mail ou convive com ela, no caso em que o cliente manda a planilha pronta?
  - Como o Connect entrega ao Financeiro: um evento por resposta, ou um lote por data de pagamento?
