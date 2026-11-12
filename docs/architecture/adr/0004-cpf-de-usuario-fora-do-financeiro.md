# 0004 — O Financeiro não guarda CPF de usuário

- **Status:** aceito
- **Data:** 2026-11-03 (registro; adapta o ADR 0003 do Connect)
- **Quem decidiu:** Bruno Conrado, ao fechar a Q10 (PF-4)

## Contexto

No Connect, o CPF identifica a pessoa no login e fica só como hash, com `CPF_SECRET_KEY`. No Financeiro, quem entra é usuário interno, por e-mail, e o cadastro das pessoas pertence ao Connect.

## Decisão

- Conta do Financeiro não tem CPF, em claro, cifrado ou em hash. Não existe `CPF_SECRET_KEY` aqui.
- Quem precisa identificar um entrevistador usa o id dele no Connect.

## Alternativas consideradas

- Copiar o login por CPF do Connect: guardaria um dado sem necessidade, contra a [spec de acesso](../../specs/acesso-e-auditoria.md).

## Consequências

- `test_schema_has_no_cpf_nor_pix_column`, em `backend/tests/test_auth.py`, falha se alguém criar uma coluna de CPF ou de chave Pix. **Exceção única e explícita (12/11/2026, provisória, Q22):** `payable_items.pix_masked`, que guarda só a chave Pix do respondente de incentivo já mascarada (3 primeiros e 2 últimos caracteres), nunca a completa. Qualquer outra coluna com "pix" ou "cpf" no nome continua barrada.
- **Quando os dados de RPA entrarem:** a decisão D7, de 21/10, pede CPF e PIS/NIT, e esse caso precisa de um ADR próprio e de passar pelo inventário de dados e pelo ROPA antes do código.
