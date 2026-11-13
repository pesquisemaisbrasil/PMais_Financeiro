# Spec: Baixas, recorrência e anexos

> **Módulo 3 — Contas a pagar e a receber.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato das três abas compartilhadas por contas a pagar e a receber: **Baixas**, **Repetir** e **Documentos**.

## Comportamento

**Baixa**
- A aba Baixas lista data, descrição, valor, tipo (pagamento/recebimento/estorno), transação, documento, origem (por exemplo "Lançamento a Pagar", "Lote de campo", "Conciliação"), observações, conta bancária e ações [SGE4B §5.2].
- Nova baixa: data*, valor*, conta bancária*, forma (Pix, TED, boleto, débito em conta, dinheiro), transação/ID bancário, documento, juros/multa/desconto/tarifa, observação.
- Várias baixas por título (liquidação parcial). Barra de progresso "% pago".
- **Estorno:** cria uma baixa negativa vinculada à original, com motivo. A original nunca some.
- **Baixa em lote:** a mesma baixa (data, conta, forma) aplicada a vários títulos selecionados, cada um com o seu valor pendente [Reunião 21/10 9:04].
- **Volta (Pix devolvido):** o pagamento voltou, geralmente por chave Pix errada.
  - O financeiro registra a **devolução** na baixa: o título fica `devolvido` e o valor volta a pendente.
  - A pessoa é sinalizada para o supervisor corrigir a chave no Connect.
  - O novo pagamento é **uma nova baixa, com a data real** em que saiu [Reunião 21/10 11:45, 19:27–20:15].
  - Assim o relatório por data de baixa bate com o extrato.

**Repetir / parcelar**
- Dados: valor padrão, data inicial, tipo (mensal: dia do mês | semanal: dia da semana | parcelado: N parcelas dividindo o valor), quantidade.
- **Simular** gera a tabela de ocorrências (nº, vencimento, valor, status). Datas e valores são editáveis na própria tabela antes de salvar.
- Salvar cria as ocorrências como títulos ligados à série.
- Editar uma ocorrência salva pergunta: **"só esta"**, **"esta e as seguintes"** ou **"todas em aberto"**.
- **Recorrência estimada:** uma conta fixa de valor variável (luz, por exemplo, média de R$ 150) é replicada por 12 meses como estimativa. Todo mês, a ocorrência é **substituída pelo valor real** da fatura, sem mexer nas seguintes [Reunião 21/10 47:29].

**Documentos**
- Escolher arquivo, ajustar o nome, enviar, listar, baixar, renomear, excluir (lógico) e atualizar a lista.
- Tipos de documento: nota, boleto, contrato, comprovante, recibo e outro.

## Regras

1. Soma das baixas ≤ valor devido. Passar do devido é bloqueado, salvo juros/multa declarados.
2. Baixa não é editada nem apagada depois de salva: correção = estorno + nova baixa [SGE4B §4.3]. Isso substitui o "editar/excluir baixa" do SGE4B.
3. Baixa com data em período **fechado** é bloqueada ([bancos-e-conciliacao](bancos-e-conciliacao.md)).
4. Baixa retroativa (data < hoje) exige observação.
5. Recorrência:
   - dia inexistente no mês (31 em fevereiro) vai para o **último dia do mês**;
   - vencimento em fim de semana ou feriado nacional vai para o **próximo dia útil** (a validar: ou anterior?);
   - quantidade = **número total de ocorrências**, incluindo a primeira;
   - parcelado: a diferença de arredondamento vai na última parcela;
   - "esta e as seguintes" muda só ocorrências **em aberto**; ocorrência paga ou parcialmente paga nunca muda;
   - cancelar uma ocorrência não afeta as outras.
6. Anexos:
   - cofre cifrado de [handoff/06 §4](../handoff/06-seguranca-e-lgpd.md) (MinIO, duas camadas), separado por empresa;
   - PDF, JPG, PNG, XLSX, DOCX, XML de nota, até 20 MB cada e 50 por título (a validar);
   - verificação de tipo real (não só a extensão) e antivírus;
   - guarda nome original, nome interno, checksum, autor, data e título;
   - download só para quem pode ver o título, e cada download é auditado;
   - exclusão é lógica, com motivo; a retenção segue a política do DPO (Q5; comprovantes de incentivo e folha: F6).
7. Comprovante Pix de entrevistador **não** vira anexo (decisão 10 do handoff: o PDF não é guardado).
   - Comprovantes de incentivo e de folha, que hoje a equipe baixa do banco, junta num arquivo e anexa ao lançamento no SGE4B [Reunião 21/10 9:22–9:52], dependem da pendência F6. Até a decisão, não são guardados.
   - A tela registra só "comprovante enviado ao supervisor em dd/mm".
8. Nota fiscal, RPA e DANFE seguem [documentos-fiscais](documentos-fiscais.md) (guarda fiscal de 5 anos).
9. Uma devolução não apaga a baixa original: as duas ficam na aba, com motivo "Pix devolvido".

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Baixa acima do saldo pendente | 409 | O valor passa do saldo pendente (R$ X) |
| Baixa em período fechado | 409 | O período de {mês/ano} está fechado. Só um administrador pode reabrir |
| Editar ou apagar uma baixa | 409 | Baixas não são alteradas — faça um estorno |
| Alterar ocorrência já paga pela série | 409 | Ocorrências pagas não são alteradas pela série |
| Arquivo com tipo não permitido ou acima do limite | 422 | Envie PDF, imagem, planilha, documento ou XML de até 20 MB |
| Arquivo reprovado no antivírus | 422 | Arquivo bloqueado por segurança |
| Baixar anexo de título fora do escopo | 404 | (registro não encontrado) |

## Critérios de aceite

- [ ] Um título de R$ 1.000 com baixa de R$ 400 fica `parcial`, com pendente R$ 600; segunda baixa de R$ 600 deixa `pago`.
- [ ] Estornar a baixa de R$ 600 volta o pendente para R$ 600, e as duas linhas ficam visíveis.
- [x] Simular 6 meses a partir de 31/01 gera vencimentos 31/01, 28/02 (ou 29), 31/03, 30/04, 31/05 e 30/06 (ajustados para dia útil).
- [x] Mudar o valor da 3ª parcela com "só esta" mantém a 4ª–6ª; com "esta e as seguintes" muda a 3ª–6ª em aberto.
- [x] Incluir, renomear, baixar e excluir um comprovante deixa as 4 operações na trilha.
- [x] Enviar um .exe renomeado para .pdf é recusado.
- [ ] Um Pix devolvido em 15/10 e pago de novo em 16/10 deixa o título com as duas baixas e a devolução; o relatório por data de baixa mostra a saída em 16/10.
- [x] Uma conta de luz estimada em R$ 150 por 12 meses tem a ocorrência de outubro substituída por R$ 163,40, e as de novembro em diante continuam R$ 150.
- [ ] Baixa em lote de 5 títulos grava 5 baixas iguais em data e conta.

## Onde está no código

- Recorrência (PF-57): `backend/services/recurrence.py`, `backend/models/payable.py` (`PayableSeries`), rotas em `backend/api/payables.py` (`/payables/recurrence`, `/payables/{id}/series`), tela em `frontend/src/components/RecurrenceFields.tsx` e `SeriesDialog.tsx` (compartilhados com o Contas a receber). Testes: `backend/tests/test_recurrence.py`, `frontend/e2e/recorrencia.spec.ts`.
- Anexos: `backend/core/file_vault.py` (cofre), `backend/services/attachments.py` (regras), `PayableAttachment` em `backend/models/payable.py`, rotas `/payables/{id}/attachments` em `backend/api/payables.py`, tela em `frontend/src/components/DocumentsPanel.tsx` (a mesma para a conta e para o título), com `ReceivableAttachment` em `backend/models/receivable.py` e as rotas `/receivables/{id}/attachments`. A aba Repetir do detalhe é `frontend/src/components/SeriesPanel.tsx`. Testes: `backend/tests/test_file_vault.py` e a seção "Anexos" de `test_payables.py`; `frontend/e2e/contas-a-pagar.spec.ts`.
- Baixas: a criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 6:27, 8:15–9:52, 11:45, 19:27–20:15, 47:29]: anexos, baixa em lote, voltas, recorrência estimada.
- [SGE4B §5.2, §5.3, §5.4, §10 CT-03–CT-06].
- [Connect: financeiro] regra 5 (o PDF de Pix não é guardado).

## Ajustes

- 2026-11-06 (PF-57, recorrência entregue em Contas a pagar): **mensal**, **semanal** e **parcelado**, de 2 a 60 ocorrências (a primeira incluída), com a tabela simulada editável antes de salvar. Cada ocorrência é um título normal ligado à série (`payable_series`, `payables.series_id` e `seriesIndex`). A criação é tudo ou nada.
- 2026-11-06: o dia vem sempre da **data inicial** (31/01 dá 28/02 e volta a 31/03), e só depois o vencimento vai para o **próximo dia útil** (a regra "a validar: ou anterior?" ficou com o próximo, como a spec diz; mudar é uma linha em `services/recurrence.py`). Feriado nacional entra na conta (Proclamação da República, 15/11, vai para o dia 16).
- 2026-11-06: parcelado divide também o rateio entre projetos, com a diferença de arredondamento no último projeto. Só a primeira ocorrência leva nota, boleto e competência informados: as demais ficam "Sem documento", porque nota e boleto são de cada mês.
- 2026-11-06: **editar a série** muda valor e descrição ("só esta", "esta e as seguintes", "todas em aberto"); o vencimento de uma ocorrência continua sendo mudado nela mesma. **Cancelar a série** vale para "esta e as seguintes" ou "todas em aberto" (cancelar só uma é o cancelamento normal da conta). Ocorrência paga, parcialmente paga ou já cancelada nunca é alterada pela série: fica de fora, e se a ocorrência escolhida em "só esta" já foi paga, a resposta é 409 ("Ocorrências pagas não são alteradas pela série").
- 2026-11-06: **recorrência estimada** (luz): marca a série como estimada; "só esta" troca uma ocorrência pelo valor real sem mexer nas seguintes. Provisão não tem série (422).
- 2026-11-06: ficou de fora desta entrega: estender uma série (acrescentar ocorrências depois) e a baixa em lote por série.
- 2026-11-06: a série (`payable_series`) e a simulação também servem ao Contas a receber, para parcelar a receita do projeto (ver [contas-a-receber](contas-a-receber.md)). O nome da tabela ficou como está para não migrar dado; a coluna `series_id` de `receivables` aponta para ela.
- 2026-11-06 (anexos em Contas a pagar): a conta aberta ganhou a aba **Documentos**, com vários arquivos de uma vez. Vale o que a regra 6 pede, com os limites "a validar" mantidos: PDF, JPG, PNG, XLSX, DOCX e XML, até 20 MB cada e 50 por conta. O tipo é conferido pelo conteúdo, o XML não aceita DTD, e o mesmo arquivo (mesmo SHA-256) não entra duas vezes na conta, mas volta a ser aceito depois de tirado. O nome é guardado sem pasta e sem caractere de controle. Como a spec manda, cada arquivo vai cifrado para o cofre ([ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md)), o download só passa pela API, e **incluir, baixar e tirar** ficam no histórico da conta, com o motivo na remoção.
- 2026-11-06: **ficou de fora dos anexos:** antivírus (o gancho existe e não recusa nada), renomear, separação por empresa (um bucket só por ora), prazo de guarda e rotina de limpeza (Q5, F6) e anexos no Contas a receber. Conta paga ou cancelada também aceita e perde documento, porque a prova de uma conta paga costuma chegar depois; tudo fica no histórico.
- 2026-11-06: a regra 7 vale para o **fluxo de comprovante** (conciliar e dar baixa não guarda o PDF). O sistema não impede alguém de anexar à mão um PDF de comprovante na aba Documentos: isso é anexo comum, com a guarda ainda sem prazo (Q19, Q5).
- 2026-11-09 (documentos): o documento ganha um **tipo** (nota fiscal, boleto, contrato, comprovante, recibo, planilha ou outro; sem escolha, outro), escolhido ao anexar e mudado ao renomear. "Planilha" vem do protótipo e do kickoff (K2), não da lista acima ([Q31](../planning/perguntas-abertas.md)). **Renomear** muda só o nome e o tipo: a extensão não muda, o arquivo guardado é o mesmo, e a trilha guarda o nome antigo e o novo. **Anexos no Contas a receber**: mesmas regras e mesmo cofre (chave `receivable/{id}/...`), com a trilha no histórico do título. Isso resolve o que a nota de 06/11 deixou de fora (renomear e anexos no a receber); antivírus, separação por empresa e prazo de guarda continuam de fora.
- 2026-11-09 (aba Repetir): o detalhe de uma conta ou título de série ganha a aba **Repetir**, com todas as ocorrências (número, vencimento, valor líquido e situação), **Abrir** para trocar de ocorrência sem fechar a janela e os botões de alterar e cancelar a série, que usam as regras desta spec. Cancelada e paga aparecem na lista; só o que está em aberto muda.
- 2026-11-11 (revisão): **ID da transação (Pix)** é aparado e comparado **sem diferenciar maiúscula de minúscula** ("E0001", "e0001" e " E0001 " são o mesmo ID), em Contas a pagar e a receber. Duas baixas ao mesmo tempo com o mesmo ID, em contas diferentes, esperam uma pela outra no banco (`pg_advisory_xact_lock`), e a baixa por **comprovante** também recusa um ID já usado numa baixa manual ("Esse ID de transação já foi usado em outra baixa"). **Repetir:** a tabela simulada só vale com o **vencimento e o valor** com que foi simulada: mudou um dos dois, a tabela some com o aviso "Simule de novo" e o salvamento é barrado, no lugar de lançar contas de valor diferente do que a tela mostrava. **Série** do a pagar ignora a conta excluída (como a do a receber). "Cancelar a série" mostra até quantas contas ou títulos serão alcançados. Parcelas que não fecham o total dizem os valores ("As parcelas somam R$ X, mas a conta é de R$ Y").
