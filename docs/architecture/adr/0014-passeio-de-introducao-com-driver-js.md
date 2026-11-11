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
- O passeio é só o menu. Passeios por tela (por exemplo, dentro do Contas a pagar) ficam para quando o PO pedir.
