# ADR 0008: Ler planilha com openpyxl

**Status:** Aceito
**Data:** 04/11/2026

## Contexto

O financeiro recebe as planilhas de incentivos e de folha de campo em .xlsx, e a importação precisa ler esse formato. O .xlsx é um arquivo compactado com XML, e ler isso à mão seria frágil. Como o arquivo vem de fora, ele também pode ser malicioso.

## Decisão

Usar `openpyxl` no modo somente leitura e, com ele, `defusedxml`, que protege a leitura do XML. Antes de abrir o arquivo, recusamos mais de 5 MB enviados, mais de 50 MB descompactados e mais de 5.000 linhas. O arquivo é lido em memória e descartado.

Também aceitamos .csv, que o Excel gera, sem nenhuma dependência.

## Consequências

- São duas dependências novas no backend, acompanhadas pelo `pip-audit` da CI.
- Células com fórmula são lidas pelo último valor calculado. Sem valor calculado, a linha vira erro na conferência.
- Dinheiro continua exato: a célula numérica vira `Decimal` pelo texto do número, nunca por conta com `float`.
