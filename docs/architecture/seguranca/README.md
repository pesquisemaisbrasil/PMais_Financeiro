# Segurança e LGPD

Inventário de dados, autenticação, RBAC, `lgpd/ropa.md` e `lgpd/ripd.md` entram aqui. O inventário e o ROPA do login estão em [inventario-de-dados.md](inventario-de-dados.md) e [lgpd/ropa.md](lgpd/ropa.md) (PF-55); o prazo de guarda aguarda o DPO (Q26).

Enquanto isso, as regras estão em [handoff/06](../../handoff/06-seguranca-e-lgpd.md) e na [spec de acesso](../../specs/acesso-e-auditoria.md).

## Inventário de dados (parcial)

O inventário completo e o ROPA são a PF-55. Enquanto eles não existem, cada dado pessoal novo fica registrado aqui.

| Dado | Origem | Onde fica | Por quê | Retenção |
|---|---|---|---|---|
| Nome da pessoa e valor a pagar (entrevistador, respondente de incentivo) | Planilha importada em Contas a pagar | `payable_items` | Saber quem recebe cada valor do lançamento | A definir com o DPO (Q5) |
| Número e data da NF, valor bruto do RPA | Planilha de folha de campo | `payable_items` | Acompanhar o documento fiscal e o desconto de INSS | A definir com o DPO (Q5) |
| Data da pesquisa de cada respondente, ligada ao nome | Planilha de incentivos | `payable_items` | Calcular a data de pagamento e devolver o cronograma ao projeto | A definir com o DPO (Q5) |
| Contato do fornecedor: nome, telefone e e-mail | Tela de cadastros | `suppliers` | Falar com o fornecedor | A definir com o DPO (Q5) |
| Quem alterou cada cadastro | Tela de cadastros | `record_events` | Auditoria | A definir com o DPO (Q5) |

**O que a importação não guarda:** o arquivo, a chave Pix e o CPF. A chave Pix depende da Q22. O resumo do arquivo (`payables.importHash`) só serve para avisar quando a mesma planilha vier de novo e não permite recuperar o conteúdo.

**O que os cadastros não guardam:** CPF e chave Pix de fornecedor, que dependem da Q23.
