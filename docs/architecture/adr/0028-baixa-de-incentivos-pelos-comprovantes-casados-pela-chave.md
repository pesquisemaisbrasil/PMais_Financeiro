# ADR 0028: Baixa do lançamento de incentivos pelos comprovantes Pix, casados pela chave

**Status:** Aceito, com o comprovante guardado de cada pessoa ainda dependendo do DPO (Q19, Q69)
**Data:** 27/11/2026

## Contexto

Em 27/11/2026 o Bruno pediu para reformular o Carregar incentivos:

> "vai ser um lançamento só que daí ele vai ter um drill down, e daí quando elas derem a baixa eles vão verificar se os 25 comprovantes batem com o valor da conta e liberar para dar a baixa, e daí os 25 comprovantes vão ter que ser comparados chave pix por chave para poderem ser anexados aos devidos entrevistados"

Decisão dele sobre a baixa, nas perguntas do agente:
- **Só baixa com todos.** A baixa libera quando cada pessoa tem o seu comprovante, com o valor dela, e a soma bate com a conta.

Sobre a planilha, a primeira escolha foi "uma planilha = um lançamento". Ao ver o resultado, no mesmo dia, o Bruno pediu o contrário, com o print da planilha da equipe: "tem que ser algo mais nesse estilo, que elas possam colocar vários projetos e que eles possam ser carregados para seus respectivos projetos [...] e daí ele entenda que a data programada, no caso a preenchida pelo financeiro, seja a programada para o pagamento".

Até aqui, a importação guardava só a chave Pix mascarada (Q22). O envio de comprovantes era só do lançamento do Connect, que casa a chave pelo Connect (`POST /pix-key-matches`). O incentivo da planilha era baixado como uma conta comum.

## Decisão

- **A importação guarda o HMAC da chave** de cada pessoa (`payable_items.pix_hash`, `core/pix.hash_pix`, a mesma chave secreta e a mesma normalização do resto do sistema), além da versão mascarada. A chave completa continua sem ser guardada e sem aparecer na prévia ou no log. A chave Pix passa a ser **obrigatória** em cada linha do incentivo: sem ela a linha fica de fora, com o motivo.
- **A planilha segue a da equipe** e pode trazer vários projetos: a importação continua criando um lançamento por projeto, classificação e data de pagamento (a de "PAGAR (PREENCHIDO PELO FINANCEIRO)"). O modelo para download tem as colunas da equipe, sem CPF e dados de banco, e Projeto, Plano de contas e Forma de pagamento no fim. Cada lançamento com a chave de todas as pessoas nasce com `payables.paidByReceipts`.
- **A baixa desse lançamento é só pelos comprovantes** (`services/incentive_receipts.py`):
  - Rotas: `POST /payables/{id}/receipts/preview` e `/confirm`.
  - Os PDFs do Itaú são lidos em memória pelo mesmo leitor do Connect, só no bloco do recebedor.
  - Cada comprovante casa com a pessoa pelo HMAC da chave lida.
  - A baixa só sai com cada pessoa tendo um comprovante do valor dela, nenhum comprovante sobrando, repetido, ilegível ou já usado (`transactionId` de qualquer baixa ou `e2eId` pago no Connect) e a soma igual ao pendente.
  - Confirmar grava **um Pix por pessoa** (`payable_payments`, com o ID da transação e `item_id`), numa transação, com a conta travada e a conferência refeita.
  - A baixa comum (simples e em lote) recusa esse lançamento.
- **O comprovante de cada pessoa é guardado**: só a página dela, num PDF próprio, nos documentos da conta (`payable_attachments.item_id`), cifrado no mesmo cofre dos anexos ([ADR 0012](0012-anexos-das-contas-cifrados-por-arquivo.md)). Esses arquivos não contam no limite de 50 documentos da conta. É o que o Bruno pediu ("anexados aos devidos entrevistados"), e é o mesmo tipo de documento que o financeiro já anexa à mão desde 16/11 (tipo "Comprovante"). Isso abre uma exceção ao [ADR 0003](0003-pdf-de-comprovante-nao-e-armazenado.md), que segue valendo para o lote de comprovantes do Connect: lá o PDF continua lido e descartado.

## Consequências

- O lançamento de incentivos antigo (sem `paidByReceipts`) continua com a baixa comum.
- O dia de pagamento de cada pessoa é o do Pix dela (`own_paid_on`). O Pix estornado deixa a pessoa em aberto, sem apagar o comprovante, como na remoção lógica dos anexos. A baixa pelos comprovantes vale então só para quem está em aberto, e o comprovante de quem continua pago é ignorado (27/11, para o estorno de algumas pessoas não travar o lançamento).
- O HMAC da chave é dado pessoal pseudonimizado. Ele entra no inventário e no ROPA (FIN-I1). O comprovante guardado tem o nome e a chave como o Itaú imprime. O prazo de guarda é o dos anexos, ainda em aberto com o DPO (Q19, Q69). Se o DPO recusar a guarda, a baixa continua igual, e só deixa de anexar a página.
- Fica de fora, por enquanto:
  - baixa parcial (só quem bateu);
  - comprovante de outro banco (só o leitor do Itaú existe);
  - a chave mascarada do comprovante com dígitos escondidos (o Itaú mostra a chave inteira no bloco do recebedor).
