# ADR 0009: Padrões do Ant Design, MUI X e Mantine feitos em shadcn

**Status:** Aceito
**Data:** 04/11/2026

## Contexto

O pedido foi melhorar a interface usando componentes do shadcn/ui, do Mantine, do Ant Design e do MUI X. Hoje o Financeiro usa shadcn (estilo new-york), Radix e Tailwind 4, e a regra do projeto é usar só componentes de `src/components/ui`.

Instalar as outras três traria três sistemas de tema e de estilo no mesmo app, um pacote bem maior, componentes pagos no MUI X (como a fixação de colunas do Data Grid Pro) e uma tela com visual dividido.

## Decisão

Não instalar Mantine, Ant Design nem MUI X. Trazemos os **padrões** deles e os construímos com os componentes shadcn que já temos:

- filtros em painel lateral, com contagem de resultados ao vivo (Drawer do Ant Design e do Mantine) usando `Sheet`;
- densidade confortável ou compacta, lembrada no navegador (Data Grid do MUI X);
- seletor com busca (Select do Ant Design e do Mantine) com `Popover`.

## Consequências

- Nenhuma dependência nova, e o `check:ui` continua valendo.
- Cada padrão novo é nosso para manter. Se um dia precisarmos de tabela com milhares de linhas, edição na célula ou agrupamento, avaliar o TanStack Table (sem estilo próprio) antes de pensar numa biblioteca de componentes completa.
- **Testado e descartado:** coluna de ações fixa à direita (fixação de colunas do MUI X) com `position: sticky`. Em tela de 1280 px, ela cobria a coluna **Pendente** até a pessoa rolar. Só vale se a coluna fixa tiver espaço reservado, o que pede um componente de tabela próprio (TanStack Table).
