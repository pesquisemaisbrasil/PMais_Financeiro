# ADR 0030: DRE com linhas fixas, ligadas pelo plano de contas

**Status:** Aceito (o vínculo das contas com as linhas aguarda a conferência da Vivi, F3)
**Data:** 27/11/2026

## Contexto

Desde 25/11, cada grupo do plano de contas era uma linha do DRE, somada como receita ou despesa pelo tipo da conta. Nos dados do sistema antigo isso distorce o resultado: os grupos de **Ativo** e de **adiantamento de sócios** entravam como despesa, e há contas de **empréstimo** e de **aporte** dentro dos grupos de receita e de despesas bancárias. O Bruno pediu o DRE com subtotais, deixando fora o que não é resultado ([registro](../../transcricoes/2026-11-27-dre-com-subtotais.md)).

## Decisão

- **Linhas fixas**, no código (`services/dre.py`, `LINES`), com os subtotais depois delas:
  receita operacional (+), impostos (−), **receita líquida**, custos dos serviços (−), **lucro bruto**, despesas com pessoal (−), despesas administrativas (−), **resultado operacional**, despesas bancárias (−), outras receitas (+), **resultado do período**.
- **Vínculo no plano de contas:** `dreLine` no grupo e na conta (a da conta vale sobre a do grupo), editável em Cadastros → Plano de contas, que mostra a coluna **Linha do DRE** como o sistema antigo.
- **Fora do resultado** (`fora`): aparece à parte, com o sinal do dinheiro, e não soma.
- **Conta sem linha:** entra no resultado numa linha própria, "Sem linha do DRE", com um aviso. Nada some sem alguém escolher.
- **Vínculo inicial** pela migration `e5c9a1b7d2f4`, só nos grupos e contas vindos do sistema antigo (código e começo do nome): o rascunho aprovado na escolha. Empréstimos e aportes, em qualquer grupo, ficam fora.
- **Fluxo mensal continua por grupo**, com receitas e despesas: é o dinheiro, e ativo e empréstimo também saem e entram do banco.

## Consequências

- DRE e fluxo mensal não têm mais o mesmo quadro (o que valia desde 26/11); comparam-se pelo plano de contas.
- Linha nova ou outra ordem pede mudança no código. É o que se espera de uma estrutura contábil definida pela empresa.
- O DRE usa o valor principal dos títulos: juros, descontos e impostos retidos continuam fora (F3).
- Alternativa descartada: linhas cadastráveis pela tela. Ninguém pediu, e os subtotais teriam que ser montados por regra.
