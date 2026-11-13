# Spec: Bancos e conciliação

> **Módulo 6 — Conciliação bancária.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato de contas bancárias, importação de extrato, conciliação **linha a linha do extrato** contra os lançamentos, e do fechamento do mês que vai para a contabilidade. Substitui o "Extrato/Controle bancário" do SGE4B e a planilha de conciliação mantida à mão.

## Comportamento

- **Conta bancária:** empresa*, banco* (hoje Itaú), agência, conta, tipo (corrente, aplicação, caixa), saldo inicial e data, status.
- **Importar extrato:** OFX ou CSV do Itaú, com pré-visualização antes de gravar. A API do banco depende da pendência N1.
- **Conciliação** pelo extrato, como a Bruna faz hoje [Reunião 21/10 13:36–16:57]. A tela tem duas colunas: extrato × lançamentos/itens.
  - **Um lançamento, várias linhas no extrato:** o lançamento de R$ 1.000 de 5 incentivos aparece no extrato como 5 Pix de R$ 200. A conciliação casa cada linha com um **item** do lançamento ([contas-a-pagar](contas-a-pagar.md), lançamento agrupado), não com o total.
  - **Sugestão automática** por valor + data (±3 dias) + favorecido + ID da transação; com itens, por item.
  - **Classificação de cada linha** (o que a contabilidade precisa):
    - tipo: incentivo, adiantamento, pagamento com NF, RPA, sem NF, reembolso, tarifa, transferência, outro;
    - com NF: número e data de emissão.
    - A classificação vem do item ou do documento fiscal quando já existe ([documentos-fiscais](documentos-fiscais.md)). O que não vem é preenchido na tela, e a pessoa **nunca deduz** o tipo só pelo valor [Reunião 21/10 13:52–14:12].
  - Para cada linha: **conciliar** com uma baixa existente, **baixar** um título em aberto, **criar** um lançamento (tarifa, rendimento) ou marcar **exceção** com motivo.
  - **Voltas:** um crédito de Pix devolvido casa com a baixa original e gera a devolução no título ([baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md)).
  - Pix de entrevistador casa com o comprovante já conciliado em [comprovantes-e-baixa](comprovantes-e-baixa.md).
- **Diferença extrato × despesas:** por dia e por mês, mostra a saída do extrato contra as baixas do sistema, e explica a diferença: voltas, pendências, linhas não conciliadas [Reunião 21/10 17:01–20:31].
- **Saldo mensal:** por conta e consolidado: saldo inicial, entradas, saídas e saldo final.
- **Fechamento do mês:** o financeiro fecha o mês por empresa quando tudo está conciliado e exporta a **planilha de conciliação para a contabilidade**: cada linha do extrato com a classificação, o número da NF, a data de emissão e o lançamento [Reunião 21/10 16:32–16:57].

## Regras

1. A transação importada é imutável. Reimportar o mesmo extrato não duplica (chave = conta + ID da transação, ou data + valor + descrição, guardada como HMAC).
2. Toda baixa tem conta bancária e **data de baixa = data em que o dinheiro saiu**. O saldo da conta = saldo inicial + baixas conciliadas.
3. A soma das linhas conciliadas a um lançamento agrupado não passa do valor dele. O que falta aparecer como "itens não pagos" ainda não existe na tela (ver "A criar").
4. Linha sem classificação não deixa fechar o mês.
5. Transação conciliada só se desfaz com motivo e auditoria.
6. **Período fechado** bloqueia baixa, estorno e lançamento com data naquele mês, para todos. Reabrir é só para um administrador, com motivo.
7. Fechar o mês exige zero linha sem conciliar e sem classificar (exceção aceita conta como conciliada).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Arquivo de extrato inválido | 422 | Não foi possível ler o extrato — envie OFX ou CSV do banco |
| Conciliar linhas acima do valor do lançamento | 409 | As linhas somam R$ X, mas o lançamento é de R$ Y |
| Fechar mês com linhas pendentes ou sem classificação | 409 | Há N linhas não conciliadas ou sem classificação em {empresa} |
| Lançar em período fechado | 409 | O período de {mês/ano} está fechado. Só um administrador pode reabrir |
| Reabrir período sem ser administrador | 403 | Só um administrador pode reabrir um período fechado |

## Critérios de aceite

- [x] Um lançamento de 5 incentivos (R$ 1.000) concilia com 5 Pix de R$ 200 do extrato, um por item, e cada linha sai classificada como "incentivo".
- [ ] Um pagamento de fornecedor com NF concilia trazendo o número e a data de emissão da nota anexada.
- [x] Um Pix devolvido em agosto e pago em setembro aparece na diferença de agosto explicado como "volta", e o fechamento de setembro bate com o extrato.
- [x] Importar o mesmo OFX duas vezes não duplica.
- [x] A planilha da contabilidade tem uma linha por transação, com classificação, NF e data de emissão.
- [x] Depois de fechar março, nenhuma baixa com data de março é aceita.

## Onde está no código

- **Feito (PF-69):** conta bancária com banco, agência, conta, tipo e saldo inicial (`models/reference.py`, `services/records.py`) e importação de extrato: leitor em `core/statement.py`, regras em `services/bank_statement.py`, rotas em `api/bank_statements.py`, tabelas `bank_statements` e `bank_transactions` (migration `d8f0b2c4e6a8`) e a tela **Financeiro → Conferência bancária**. [ADR 0016](../architecture/adr/0016-extrato-bancario-imutavel-e-descricao-cifrada.md).
- **Feito (PF-70, fatia 1):** conciliar a linha com um lançamento (e a pessoa), exceção com motivo, classificação e desfazer: `services/bank_reconciliation.py`, rotas `/bank-transactions/{id}/…` em `api/bank_statements.py`, tabelas `bank_reconciliations` e `bank_reconciliation_events` (migration `e9a1c3e5b7d9`) e a tela de conciliação na Conferência bancária.
- **Feito (PF-71):** a diferença extrato × sistema e o saldo do mês: `services/bank_reports.py` e `api/bank_reports.py` (`GET /bank-accounts/{id}/difference?month=` e `GET /bank-balances?month=`).
- **Feito (PF-72):** o fechamento do mês por empresa, a trava de período e a planilha da contabilidade: `services/period_closing.py`, `services/period_lock.py`, `api/period_closings.py` e as tabelas `period_closings` e `period_closing_events` (migration `f1c3e5a7b9d1`). As três visões têm abas na tela **Financeiro → Conferência bancária**.
- **A criar:** baixar título em aberto e criar lançamento a partir da linha, e o Pix devolvido casado com a baixa original (PF-70 fatia 2); a **sugestão pelo ID da transação** (hoje só valor, data e nome) e a lista de **"itens não pagos"** do lançamento agrupado.

Origem do requisito:

- [Reunião 21/10 13:23–21:29]: conciliação pelo extrato, classificação, voltas, diferença extrato × relatório.
- [SGE4B §1.2, §5.6, §7.2, §10 CT-08]; [SWOT S05].

## Ajustes

- 2026-11-12 (**conta bancária e importação do extrato, PF-69**): a **conta bancária** passa a ter **banco** (obrigatório, vem preenchido com "Itaú"), **agência** e **conta** (só números, hífen e o dígito, que pode ser X), **tipo** (conta corrente, aplicação ou caixa; corrente por padrão) e **saldo inicial com a data** (sem saldo, zero; com saldo, a data é obrigatória). Contas antigas ficam sem banco até alguém editar. A **importação** lê **OFX** (padrão dos bancos) ou **CSV** (colunas de data, lançamento ou histórico e valor, ou crédito e débito; o layout real do Itaú ainda é estimativa, Q44), mostra a **prévia** (linhas novas, linhas que já estavam, período, entradas e saídas, 10 primeiras linhas, aviso de "outra conta" e de "este arquivo já foi importado") e só grava ao confirmar. **Reimportar não duplica:** a chave é o ID do banco ou data + valor + descrição, contando a repetição dentro do arquivo. Arquivo ilegível responde 422 "Não foi possível ler o extrato — envie OFX ou CSV do banco"; acima de 5 MB ou 20.000 linhas, 422 pedindo períodos menores; conta inativa recusa com 409. A linha importada é **imutável**, a descrição fica **cifrada** (traz nome de quem pagou ou recebeu) e o **arquivo não é guardado**. Conta com extrato não se exclui, só se inativa. Provisório até a Vivi (layout) e o DPO (guarda) responderem a Q44; [ADR 0016](../architecture/adr/0016-extrato-bancario-imutavel-e-descricao-cifrada.md).
- 2026-11-12 (**conciliar o extrato, PF-70 fatia 1**): cada linha do extrato fica **pendente**, **conciliada** (ligada a um lançamento) ou **exceção** (com motivo). A **sugestão** olha os lançamentos **com baixa na mesma conta**, de **valor igual** (valor diferente nunca é sugerido: é divergência para revisão humana) e **até 3 dias** da linha, e ordena por proximidade da data (+ peso para o **nome** da pessoa ou do fornecedor na descrição). **Saída casa com conta a pagar e entrada com conta a receber.** Lançamento com **pessoas** (folha, incentivo) casa **por pessoa**: o valor da linha tem de ser o da pessoa, e cada pessoa só casa com uma linha. Lançamento sem pessoas aceita várias linhas, **sem passar do valor dele** (409 "As linhas somam R$ X, mas o lançamento é de R$ Y"). Só concilia lançamento **com baixa** (409 "Esse lançamento ainda não tem baixa: dê a baixa antes de conciliar") e **da empresa dona da conta bancária**. A **classificação** é obrigatória e vem sugerida pelo tipo da pessoa (Incentivo, NF, RPA, Sem NF) ou do lançamento; **Pagamento com NF** pede número e data de emissão (preenchidos do lançamento quando ele já tem). A lista de classificações ganhou **"Recebimento de cliente"**, para as entradas. **Exceção** pede motivo e classificação (a classificação passou a ser obrigatória com o fechamento do mês, PF-72) e conta como conciliada. **Desfazer** (conciliação ou exceção) pede motivo, devolve a linha a pendente e o histórico (`bank_reconciliation_events`, só de inserção) guarda quem, o quê e por quê, sem nunca copiar o texto da linha do extrato. A lista do extrato ganha o filtro por situação e as contagens. Fora desta fatia: baixar o título em aberto ou criar o lançamento a partir da linha (tarifa, rendimento), Pix devolvido como volta e ler a nota anexada para trazer número e emissão. Provisório até a Vivi responder a Q45.
- 2026-11-12 (**extrato × sistema e saldo do mês, PF-71**): a aba **Extrato × sistema** compara, por conta e por mês, as **saídas do extrato** com as **baixas do sistema** (pagamentos com data no mês, na mesma conta), dia a dia, e explica a diferença em três partes: **saídas do extrato sem par** (sem lançamento ligado: pendentes e exceções, cada uma dizendo qual), **baixas sem linha no extrato** (o pago na conta menos o que as linhas conciliadas com o lançamento somam) e **voltas** (Pix devolvido no mês). A baixa **anulada** (estornada ou com Pix devolvido) **não conta como saída do sistema**: a saída fica no extrato e a diferença é explicada como volta, e quando o lançamento é pago de novo no mês seguinte a diferença some. A aba **Saldo do mês** mostra, por conta e consolidado, o **saldo inicial**, as **entradas**, as **saídas**, o **saldo final pelo extrato**, o **saldo pelo sistema** (só com as linhas já conferidas) e o que falta **conferir**. O **saldo inicial** da conta vale a partir da **data do saldo**: o que o extrato trouxe antes dessa data já está dentro dele e não conta de novo, e cada mês começa onde o anterior terminou.
- 2026-11-12 (**fechamento do mês, PF-72**): o mês fecha **por empresa** quando toda conta bancária ativa dela tem extrato no mês e **todas as linhas estão conciliadas ou como exceção, e classificadas** (409 "Há N linhas não conciliadas ou sem classificação em {empresa}", "Importe o extrato de {conta} antes de fechar", "Esse mês já está fechado"; mês que ainda não começou é 422). **Fechado**, a trava recusa (409 "O período de {mês} está fechado. Só um administrador pode reabrir") para todos: **baixa** (uma a uma, em lote e por comprovante), **estorno e Pix devolvido** (pelo mês da baixa original e pelo mês em que a volta é registrada), **recebimento e estorno de recebimento**, **novo lançamento a pagar ou a receber** (pela data de emissão, inclusive recorrência e importação de planilha), **conciliar, marcar exceção e desfazer** linha do mês e **importar linha nova** de extrato do mês. Só um **administrador reabre** (403 para os outros), com **motivo**, e o histórico (`period_closing_events`, só de inserção) guarda quem fechou, quem reabriu e por quê, e cada download da planilha. A **planilha da contabilidade** (Excel, `GET /period-closings/{empresa}/{mês}/sheet`) sai a qualquer hora, com uma linha por transação do extrato das contas da empresa: data, conta, descrição, valor, classificação, número e emissão da NF, lançamento e situação (Conferida, Exceção com o motivo ou Pendente), com o total no fim. A **exceção passou a exigir classificação** (antes era opcional), porque sem ela o mês não fecha. Fora da trava, por ora: editar ou cancelar um lançamento que já existe e anexar documento. Provisório até a Vivi responder a Q46.
- 2026-11-13 (**correções da revisão, backend**): (a) o **mês fechado** também recusa **duplicar** e **trocar uma provisão por um valor real**, porque a cópia nasce com emissão de hoje (regra 6); (b) o **teto da conciliação** soma também o que **voltou** (Pix devolvido): a linha de agosto continua conciliada e não esgota o teto do pagamento feito de novo em setembro; (c) **conciliar exige baixa ativa na conta bancária da linha**: ligar a linha de uma conta a um lançamento pago em outra dá 409 "A baixa desse lançamento foi em outra conta bancária"; (d) a **chave de repetição do extrato é um HMAC** (`PIX_SECRET_KEY`), não SHA puro, para a descrição cifrada não se confirmar por hash; (e) valor de linha igual ou acima de R$ 1 trilhão é arquivo ilegível (422), em vez de erro 500 no banco.
- 2026-11-13 (**limites conhecidos da revisão, sem correção agora**): (a) a checagem de "extrato de outra conta" é só aviso na prévia; a **tela** passou a exigir a confirmação, mas a API `POST /bank-accounts/{id}/statements` ainda importa se for chamada direto; (b) o teto da conciliação é o **valor do lançamento**, não o que foi **baixado**: com baixa parcial, uma linha maior que a baixa concilia (decidir com a Vivi, junto da Q45); (c) conta ativa com `openingDate` posterior ao mês bloqueia o fechamento do mês anterior ("Importe o extrato de X"); o jeito é inativá-la; (d) fechar o mês e a trava de período não usam trava de linha no banco: há uma janela pequena entre "desfazer" ou "dar baixa" e o fechamento; (e) o `DTPOSTED` do OFX usa só o dia escrito, ignorando o fuso: um banco que grava horário em GMT pode jogar uma linha para o mês errado; (f) a **volta** de Pix é explicada pela **data da devolução**: se a baixa for de um mês e a devolução de outro, o mês da baixa mostra a diferença sem a explicação.

