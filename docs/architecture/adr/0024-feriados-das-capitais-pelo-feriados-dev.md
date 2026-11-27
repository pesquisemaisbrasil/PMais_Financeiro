# ADR 0024: Feriados estaduais e municipais das capitais pelo feriados.dev, rodando no nosso servidor

**Status:** Aceito (provisório: os dados do feriados.dev vão até 2027). **Mudou em 27/11/2026:** nenhuma cidade por padrão, só os feriados nacionais contam (Bruno, depois da reunião de 26/11: o feriado de Alagoas em 30/11 empurrou o sábado 28/11 para 01/12). A busca tira os do feriados.dev de cidade fora de `HOLIDAYS_LOCATIONS`. Os containers continuam, para quando uma cidade for configurada
**Data:** 19/11/2026

## Contexto

O Bruno pediu, em 19/11/2026, que os feriados estaduais e municipais fiquem previstos sozinhos, e tirou a aba Feriados do menu. Até aqui ([ADR 0015](0015-feriados-por-cadastro-e-brasilapi.md)) só os nacionais vinham da BrasilAPI; os locais eram cadastrados à mão. Não existe fonte oficial única de feriado municipal (cada prefeitura cria o seu por lei). Das opções levantadas (Q60), o Bruno escolheu o **feriados.dev** (código aberto, MIT, roda no nosso servidor) e **todas as capitais**.

## Decisão

- **Dois containers novos**, só na rede interna (nenhuma porta publicada): `feriados` (a API do feriados.dev, construída do repositório no commit `2e5e787` de 10/10/2026) e `feriados-db` (o Postgres dele, volume `feriadosdata`). Na subida, o container cria as tabelas na primeira vez (`deploy/feriados/preparar-banco.cjs`, com o `init.sql` da própria imagem), carrega os dados novos da versão (`run-sql-migrations`) e sobe a API.
- **Os nacionais continuam da BrasilAPI** (é ela que traz o Carnaval como feriado, Q42). Do feriados.dev entram só os de tipo `state` e `municipal`; `national` vem da BrasilAPI e `optional` (ponto facultativo) fica de fora.
- **As cidades** são as 27 capitais (`HOLIDAYS_LOCATIONS`, com os códigos do feriados.dev, ex.: `SP-sao-paulo`). Um pedido por cidade e ano (`/v1/holidays?year=&location=`), que já traz os do estado. Os feriados vão para a tabela `holidays` com `source = feriados.dev`, `scope`, `uf` e `city`, e contam como dia não útil **para o sistema todo** (Q42), como os cadastrados à mão.
- **A busca roda sozinha** a cada `HOLIDAYS_SYNC_HOURS` horas (6 no servidor; 0 nos testes), para o ano de hoje e o próximo, e também pelo botão **Buscar feriados do ano** da tela (que ficou só pelo endereço). Busca a BrasilAPI e todas as cidades antes de gravar: se uma falha, nada entra, e a próxima rodada tenta de novo. Só acrescenta: o cadastrado à mão nunca é apagado nem trocado.
- Mesmos cuidados da BrasilAPI: endereço fixo da configuração, ano conferido, código da cidade conferido, sem seguir redirecionamento, resposta cortada em 400 KB e formato conferido campo a campo. As datas chegam como meia-noite em UTC; o dia é o que vem antes do "T" (o container roda em UTC).

## Consequências

- **Os dados do feriados.dev vão até 2027.** Para 2028 em diante, é preciso uma versão nova dele (trocar o commit no compose e rodar `make subir`). Até lá, só os nacionais e os cadastrados à mão contam.
- Parte dos feriados municipais do feriados.dev vem da Wikipedia (aniversários das cidades). Nas capitais os dados de 2026 foram revisados por ele, mas um feriado errado empurra a data de pagamento: a tela Feriados (pelo endereço) mostra a origem de cada um, e o financeiro pode cadastrar o certo à mão.
- Com as 27 capitais valendo para o sistema todo, há bem mais dias não úteis no cálculo (Q42 continua: feriado por unidade ou cidade fica para depois). Para usar menos cidades, troque `HOLIDAYS_LOCATIONS` no `deploy/.env`.
- O primeiro build do `feriados` precisa de internet (GitHub e npm) e leva alguns minutos. A imagem dele é Node 18, já sem suporte; como não sai da rede interna, o risco é baixo, mas a troca vem com uma versão nova dele.
- O volume `feriadosdata` não entra no backup: tudo nele é recarregado do próprio feriados.dev.
- Alternativas descartadas:
  - **Feriados API** (paga, diz cobrir os 5.570 municípios): custo mensal e dado fora da empresa;
  - **importar o SQL do feriados.dev direto na nossa tabela**: teríamos de reimplementar o carregamento e as correções dele a cada versão;
  - **só a cidade de São Paulo**: o Bruno preferiu todas as capitais.
