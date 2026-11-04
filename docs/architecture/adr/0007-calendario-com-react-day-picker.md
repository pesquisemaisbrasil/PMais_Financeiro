# 0007 — Calendário com react-day-picker

- **Status:** aceito
- **Data:** 2026-11-04
- **Quem decidiu:** técnico, na implementação, a pedido do Bruno

## Contexto

O Contas a pagar precisa de um calendário para escolher um dia ou um intervalo entre duas datas. O conjunto de componentes copiado do Connect não tem calendário, e o campo de data nativo não escolhe intervalo.

## Decisão

Usar `react-day-picker` 9, a base do componente `calendar` do shadcn, em `frontend/src/components/ui/calendar.tsx`, com o idioma pt-BR da própria biblioteca.

## Alternativas consideradas

- Escrever o calendário à mão: navegação por teclado, leitor de tela e idioma dariam mais código para manter do que a dependência.
- Dois campos de data nativos: foi a primeira versão, e o pedido foi por um calendário.

## Consequências

- O Financeiro passa a ter uma dependência que o Connect não tem. O protótipo Manus já a usa.
- O `npm audit` do CI cobre a biblioteca.
- As telas continuam usando só componentes de `components/ui`, e `PeriodPicker` monta o calendário em cima deles.
