# ADR 0014: Passeio de introdução com o Driver.js (e não o Intro.js)

**Status:** Aceito
**Data:** 11/11/2026

## Contexto

O Bruno pediu, em 11/11/2026, um **passeio de introdução do sistema** e citou o **Intro.js**. O Financeiro é um sistema interno de uma empresa, e o Intro.js (versão atual 8.6.0, conferida no npm) tem licença **AGPL-3.0**: o uso comercial exige comprar a licença comercial dele, e sem ela o projeto fica sujeito às regras da AGPL (entre elas, oferecer o código a quem usa o sistema pela rede). O Bruno escolheu a alternativa livre.

## Decisão

- **Biblioteca:** [Driver.js](https://driverjs.com), licença **MIT**, versão **1.10.2 fixa** (a 1.11.0 tinha 3 dias na hora da escolha). Faz o mesmo que o Intro.js: destaca um elemento, abre um balão com o texto e passa de passo em passo.
- **Quando abre:** sozinho **na primeira visita ao Início** de cada navegador, e a qualquer hora pelo botão **Conhecer o sistema**, no rodapé do menu. Abrir já marca como visto (`localStorage`, chave `financeiro:passeio-visto`): recarregar ou fechar a aba no meio não o faz voltar sozinho, e ele volta pelo botão. Sem armazenamento (navegação privada), ele só abre pelo botão.
- **Texto e passos** em `frontend/src/lib/tour.ts`, em português simples: boas-vindas, menu, Início, Financeiro, Relatórios, Cadastros, sino de avisos e o botão do passeio. Cada passo aponta para um `data-tour` do menu; o passo cujo elemento não está na tela é pulado.
- **Visual** no padrão do sistema (`.driver-popover.passeio` em `globals.css`); botões, progresso ("4 de 8") e o fechar em português; sem animação para quem pediu menos movimento.
- **Só se baixa quando abre:** a biblioteca entra por `import()` dinâmico.
- **Nos testes**, todo navegador já nasce com o passeio visto (`storageState` do Playwright), senão ele cobriria a tela de todo teste; o teste do passeio apaga a marca.

## Consequências

- Uma dependência a mais no frontend (MIT, sem dependências próprias). A CSP não muda: o Driver.js usa estilo em linha, que a política já permite (`style-src 'unsafe-inline'`).
- Trocar de biblioteca depois é barato: ela só aparece em `components/ProductTour.tsx`.
- O passeio geral é só o menu. Os passeios de cada tela vieram depois, na decisão abaixo.

## Ajuste de 13/11/2026: passeio de cada tela

O Bruno pediu que o botão **Conhecer o sistema** valha também para cada tela. O que ficou decidido:

- **O botão abre o passeio da tela em que a pessoa está.** No Início, e em tela sem passeio próprio, abre o geral, do menu. Os passeios de tela ficam em `SCREEN_TOURS` (`frontend/src/lib/tour.ts`), pelo endereço da tela (com ou sem barra no fim, por causa do site exportado da demonstração).
- **Cada passo é um `data-tour` na própria tela.** O cabeçalho (`PageHeader`) leva `data-tour="tela"` e abre todo passeio de tela; cada tela marca os seus blocos (cartões de resumo, barra de período e filtros, busca, lista, abas). O passo cujo elemento não está na tela (lista vazia, aba que não mostra o bloco) é pulado, como no geral.
- **Só o passeio geral abre sozinho e marca "já visto".** O de cada tela só abre pelo botão: abrir sozinho em toda tela atrapalharia quem usa o sistema todo dia.
- **Telas com passeio:** Contas a pagar, Contas a receber, Conferência bancária, Divergências, Cadastros, Relatório do projeto e Incentivos. Tela nova entra em `SCREEN_TOURS` com o seu `data-tour`; o Vitest confere que todo passeio começa pelo cabeçalho e não repete elemento, e o E2E abre o de cada tela e anda até o fim.
- O último passo do passeio geral diz que, em cada tela, o botão mostra o passeio daquela tela.
