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
| Baixa em período fechado | 409 | O período de {mês} está fechado |
| Editar ou apagar uma baixa | 409 | Baixas não são alteradas — faça um estorno |
| Alterar ocorrência já paga pela série | 409 | Ocorrências pagas não são alteradas pela série |
| Arquivo com tipo não permitido ou acima do limite | 422 | Envie PDF, imagem, planilha, documento ou XML de até 20 MB |
| Arquivo reprovado no antivírus | 422 | Arquivo bloqueado por segurança |
| Baixar anexo de título fora do escopo | 404 | (registro não encontrado) |

## Critérios de aceite

- [ ] Um título de R$ 1.000 com baixa de R$ 400 fica `parcial`, com pendente R$ 600; segunda baixa de R$ 600 deixa `pago`.
- [ ] Estornar a baixa de R$ 600 volta o pendente para R$ 600, e as duas linhas ficam visíveis.
- [ ] Simular 6 meses a partir de 31/01 gera vencimentos 31/01, 28/02 (ou 29), 31/03, 30/04, 31/05 e 30/06 (ajustados para dia útil).
- [ ] Mudar o valor da 3ª parcela com "só esta" mantém a 4ª–6ª; com "esta e as seguintes" muda a 3ª–6ª em aberto.
- [ ] Incluir, renomear, baixar e excluir um comprovante deixa as 4 operações na trilha.
- [ ] Enviar um .exe renomeado para .pdf é recusado.
- [ ] Um Pix devolvido em 15/10 e pago de novo em 16/10 deixa o título com as duas baixas e a devolução; o relatório por data de baixa mostra a saída em 16/10.
- [ ] Uma conta de luz estimada em R$ 150 por 12 meses tem a ocorrência de outubro substituída por R$ 163,40, e as de novembro em diante continuam R$ 150.
- [ ] Baixa em lote de 5 títulos grava 5 baixas iguais em data e conta.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 6:27, 8:15–9:52, 11:45, 19:27–20:15, 47:29]: anexos, baixa em lote, voltas, recorrência estimada.
- [SGE4B §5.2, §5.3, §5.4, §10 CT-03–CT-06].
- [Connect: financeiro] regra 5 (o PDF de Pix não é guardado).
