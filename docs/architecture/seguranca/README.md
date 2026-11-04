# Segurança e LGPD

Inventário de dados, autenticação, RBAC, `lgpd/ropa.md` e `lgpd/ripd.md` entram aqui. O inventário e o ROPA do login são a PF-55.

Enquanto isso, as regras estão em [handoff/06](../../handoff/06-seguranca-e-lgpd.md) e na [spec de acesso](../../specs/acesso-e-auditoria.md).

## Inventário de dados (parcial)

O inventário completo e o ROPA são a PF-55. Enquanto eles não existem, cada dado pessoal novo fica registrado aqui.

| Dado | Origem | Onde fica | Por quê | Retenção |
|---|---|---|---|---|
| Nome da pessoa e valor a pagar (entrevistador, respondente de incentivo) | Planilha importada em Contas a pagar | `payable_items` | Saber quem recebe cada valor do lançamento | A definir com o DPO (Q5) |
| Número e data da NF, valor bruto do RPA | Planilha de folha de campo | `payable_items` | Acompanhar o documento fiscal e o desconto de INSS | A definir com o DPO (Q5) |

**O que a importação não guarda:** o arquivo, a chave Pix e o CPF. A chave Pix depende da Q22. O resumo do arquivo (`payables.importHash`) só serve para avisar quando a mesma planilha vier de novo e não permite recuperar o conteúdo.
