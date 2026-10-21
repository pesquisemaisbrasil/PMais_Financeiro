# 2026-10-21: Processo de reconciliação e lançamento

- **Data:** 21/10/2026, 49 min, online (transcrição automática do Teams)
- **Participantes:**
  - João Paulo (PO);
  - Bruna Palagano e Camila Fernochi (financeiro; a Camila saiu aos 23:50);
  - Marco Braga;
  - Manoel Carvalho e Gustavo Pasquini (desenvolvimento).
- **Assunto:** o financeiro mostra como lança, dá baixa e concilia no sistema atual (SGE4B) e o que seria o ideal.

**Como ler este registro:**
- É um **resumo** das falas que viram requisito, com o minuto, e não a fala bruta.
- O repositório pode ser público: ficaram fora comentários sobre pessoas e fornecedores, valores reais e números de projetos.
- A transcrição completa fica com o PO.
- A transcrição automática tem ruído: termos duvidosos estão marcados *(a confirmar)*.

## Lançamento (contas a pagar)

| Min | Fala / fato | Virou |
|---|---|---|
| 1:21–1:50 | Lançamento manual: data, fornecedor, projeto, categoria, forma de pagamento ("importante para a Bruna no fechamento"); listas com busca | [contas-a-pagar](../specs/contas-a-pagar.md) |
| 1:53–2:26 | **Rateio**: um lançamento sem projeto; colam a lista de projeto + valor (só números, sem "R$") e o sistema distribui. "Facilitou muito a nossa vida" | contas-a-pagar (rateio) |
| 2:32 | Descrição obrigatória; plano de contas com cerca de 10 categorias *(a confirmar)* | cadastros-e-dimensoes |
| 2:48–3:15 | O financeiro cadastra fornecedores, categorias e **cada projeto aberto** | cadastros, projetos (projeto passa a vir do Connect) |
| 3:30–5:47 | São **11 bases de dados** no sistema atual; pedir ao fornecedor do SGE4B a exportação completa para importar e não recadastrar; reunião específica para levantar bases e relatórios | cadastros (migração), roadmap |
| 4:27–4:49 | O sistema atual "não é financeiro, porque não tem integração financeira; é só um controle, tipo um caixa"; dá para desenvolver o nosso | visao-geral (substitui o SGE4B) |
| 6:09–6:27 | Segunda página do lançamento só para observações (opcional); anexos; repetir mensal/semanal | contas-a-pagar, baixas-recorrencia-e-anexos |
| 6:39–8:01 | Incentivos e folhas: **um lançamento no sistema por planilha/projeto**, com a planilha anexada, e um Pix por pessoa no banco | contas-a-pagar (lançamento agrupado), lotes |
| 8:15–9:18 | Ações em lote: baixa em lote, editar, reclassificar em lote, copiar, excluir; faltam legendas nos ícones | contas-a-pagar (ações em lote) |
| 9:22–9:52 | Baixam do banco os comprovantes do lote, juntam num arquivo, anexam ao lançamento e mandam ao supervisor | baixas-recorrencia-e-anexos (pendência F6) |

## Integração com o banco

| Min | Fala / fato | Virou |
|---|---|---|
| 11:23–11:45 | O "sonho" da direção: o banco puxar a planilha de incentivos e pagar sozinho; hoje é um Pix por um | lotes (etapa 2), N1 |
| 11:45–12:32 | Receio: chave Pix errada. Hoje sinalizam na planilha, o supervisor corrige e refazem. Se o banco devolver erro, ele precisa dizer **qual pessoa e qual projeto** | lotes (retorno por pessoa) |
| 12:32–13:16 | O ideal (PO): o sistema gera os pagamentos, envia ao banco e mostra os erros no próprio sistema ("100 do job, 98 pagos, falharam 2") | lotes (etapa 2) |
| 13:19 | O banco é o Itaú | N1 |

## Conciliação

| Min | Fala / fato | Virou |
|---|---|---|
| 13:36–14:12 | A conciliação é feita pelo extrato. Um lançamento de 5 incentivos aparece como 5 Pix separados. Cada linha precisa ser classificada, sem deduzir só pelo valor (incentivo? adiantamento? tem NF? RPA?) | bancos-e-conciliacao |
| 15:02–15:57 | Toda NF é guardada por **5 anos** (auditoria fiscal), com nome padrão: data de pagamento, número da NF, fornecedor, valor, data de emissão. A data de emissão importa porque há notas pagas num mês e emitidas no anterior | documentos-fiscais |
| 16:32–16:57 | Na planilha de conciliação: sem NF / NF número X emitida em Y. Isso é o que a contabilidade usa | bancos-e-conciliacao (exportação) |
| 17:01–20:31 | O relatório de despesas não bate com o extrato por causa das **voltas** (Pix devolvido e pago outro dia): o relatório usa a data do lançamento, e o extrato a data da baixa. Só a tela de controle bancário bate, e ela não gera relatório | baixas (voltas), relatorios (data de baixa, extrato × despesas) |
| 20:36–22:55 | Uma folha de 10 pessoas pode ter 5 NF, 2 RPA e 1 faltando nota. Ideia: importar o Excel e o sistema criar um item por pessoa | contas-a-pagar (itens), documentos-fiscais |

## Fluxo da folha e NF

| Min | Fala / fato | Virou |
|---|---|---|
| 21:48–22:55 | Recebem por e-mail a folha (Excel) e as NF; RPA é pedido à Camila. Internos fixos (supervisor, gerente, coordenador) têm lançamento individual; entrevistadores e recrutadores vão juntos num lançamento | contas-a-pagar |
| 23:06–23:45 | PO: o Connect já gera o que pagar e o valor; falta a NF. Bruna: o supervisor ou a pessoa sobe a NF no sistema e ela aparece para o financeiro | documentos-fiscais, folha-de-campo |
| 24:10–24:50 | Hoje: entrevistador → NF ao supervisor → supervisor faz a folha → a gestão confere → financeiro | folha-de-campo |
| 24:56–25:50 | PO: a ideia é cortar esse fluxo e fazer tudo dentro do sistema | folha-de-campo |
| 25:52–29:06 | Datas de pagamento por área *(a confirmar)*: consumo, 15 dias corridos depois do fim do projeto; Health, 2 vezes por mês em datas combinadas; CATI (Curitiba), 10 dias depois do fim. Projeto grande pode ter folha proporcional antecipada | folha-de-campo, F4 |
| 27:41–28:07 | A folha precisa chegar pelo menos 3 dias antes da data de pagamento | contas-a-pagar, folha-de-campo |

## Orçamento e provisionamento

| Min | Fala / fato | Virou |
|---|---|---|
| 29:06–31:03 | No início do projeto chega uma "provisão" (orçamento) com datas; o financeiro lança no sistema para ter fluxo de caixa para a direção; quando chega a folha real, substitui a provisão pelo real | orcamento-e-saude-financeira |
| 29:17–29:33 | PO: o orçamento já é informado ao abrir o projeto no Connect; pode aparecer direto no Financeiro | orcamento (vem do Connect) |
| 32:03–33:01 | O orçamento precisa ser dividido (por exemplo, fornecedores). Não precisa ser por fornecedor: basta a categoria, e o que importa é a soma não estourar | orcamento (por categoria) |
| 33:26–33:45 | PO: o orçamento vai automaticamente para o financeiro; o valor só é alterado com autorização de um administrador | orcamento (regra 1) |
| 34:02–34:15 | Um valor de fornecedores dividido entre dezenas de fornecedores não pode estourar sem autorização | orcamento (teto por categoria) |

## Documentos fiscais

| Min | Fala / fato | Virou |
|---|---|---|
| 34:35 | O prestador sobe a NF, ou o supervisor sobe | documentos-fiscais |
| 34:41–36:41 | Notas de empresas aparecem no site da prefeitura e no Emissor Nacional, com data de emissão e status cancelada. Citam um sistema de mercado que puxa as notas de serviço. Pesquisar se dá para puxar automaticamente | documentos-fiscais, N2 |
| 36:59–38:39 | DANFE (produto, com XML) não aparece nesses portais; NFC-e (cupom de padaria, mercado) vem com pedido de reembolso e, segundo um fornecedor consultado, não há sistema que puxe em nível Brasil | documentos-fiscais |
| 38:57–39:16 | Cerca de 300 notas por mês e aumentando; incentivo não tem nota | documentos-fiscais |
| 39:44–40:11 | RPA: recibo de autônomo com desconto de 11% de INSS, feito pela contabilidade a partir de uma planilha | documentos-fiscais |
| 40:11–41:41 | PO: perguntar no cadastro do entrevistador se recebe por NF ou RPA. Bruna: é o ideal; para RPA, pedir os dados (PIS, a confirmar com a Camila). Só esses dois modelos para prestador | documentos-fiscais, N3 |
| 42:30–42:44 | PO: no limite, quem não manda a NF no sistema não recebe | documentos-fiscais (regra 2) |
| 42:49–44:00 | A ficha de fornecedor tem: razão social, nome fantasia, CNPJ, contato responsável, dados bancários, referências | cadastros |

## Processo e próximos passos

| Min | Fala / fato | Virou |
|---|---|---|
| 45:23–45:39 | Pedir um login no sistema atual para ver funcionalidades e relatórios | roadmap (ação) |
| 45:39–46:21 | Protótipo rápido e genérico para validar com o financeiro, até o "OK, esse é o ideal"; depois, construir com segurança na arquitetura; entregar módulos pequenos para testarem | roadmap |
| 46:30 | Importar os dados (cerca de mil fornecedores); não dá para começar do zero | cadastros (migração) |
| 46:33–47:49 | O básico: lançamentos, anexos, rateio (quem recebe por projeto, em dezenas de projetos, num lançamento só), recorrência com valor estimado substituído pelo real | contas-a-pagar, baixas-recorrencia-e-anexos |
| 47:49–48:25 | Relatórios precisam de muito trabalho; o fluxo de caixa atual confunde e acaba sendo feito à mão | relatorios-e-analises |
| 48:29–48:46 | PO: dividir em módulos e validar cada um com o financeiro; fluxo de caixa entra no seu módulo | roadmap |
