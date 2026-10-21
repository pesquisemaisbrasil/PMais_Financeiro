# Perguntas abertas

Regras de produto e pesquisas ainda sem resposta. **Não decida no código:** implemente o comportamento da coluna "Hoje" e, quando sair a decisão, atualize o spec dono, registre em `docs/transcricoes/` e tire a linha daqui.

## Módulo 1: pagamento de entrevistadores

| # | Pergunta | Quem decide | Hoje | Origem |
|---|---|---|---|---|
| Q1 | O supervisor acessa o Financeiro? | Vivi | Não acessa. Lança entrevistas e sobe NF no Connect | handoff/01 |
| Q2 | O aviso "comprovantes de pessoas fora do projeto" deve chegar ao supervisor (hoje chega, no Connect)? | Vivi | Vai só para admin e financeiro | alinhamento 21/10 |
| Q3 | O entrevistador vê ou baixa o próprio comprovante? | Vivi + jurídico | Não; vê "Pago em dd/mm" no Connect | handoff/01, 08 |
| Q4 | Cancelar baixa (estorno do banco, baixa errada) passa a existir? Com dupla aprovação? | PO | Não existe para entrevistas; as voltas de contas a pagar são tratadas em baixas-recorrencia-e-anexos | handoff/07 §4.7 |
| Q5 | Retenção de comprovantes, notas e logs (a NF tem guarda fiscal de 5 anos) | DPO + contabilidade | Nada é apagado automaticamente; o PDF de Pix do entrevistador não é guardado; NF guardada com `retainUntil` de 5 anos | handoff/01, reunião 21/10 |
| Q6 | Aval do DPO sobre a planilha com chave Pix completa | DPO | Implementada com auditoria nos dois sistemas | handoff/08 |
| Q7 | ROPA/RIPD das novas operações (conciliação por comprovante, NF/RPA de prestadores) | DPO | Pendente | handoff/08, reunião 21/10 |
| Q8 | Segregação de funções: quem envia o lote não confirma a baixa dele acima de qual valor? | PO | Sem segregação | handoff/06 §2 |
| Q9 | Resumo de pagamentos para o Financeiro: diário ou semanal? | Financeiro | Diário | handoff/08 |
| Q10 | Login por e-mail ou por CPF? (o handoff/06 diz e-mail; o handoff/04 diz copiar o login por CPF do Connect) | PO + técnico | E-mail | alinhamento 21/10 |
| Q12 | Baixar em outro projeto um comprovante que caiu "fora do projeto" | PO | Não existe; fica como alerta | handoff/08 |
| Q13 | Comprovante de outros bancos ou em imagem (OCR) | PO | Só Itaú/Sispag, PDF com texto | handoff/01, 08 |
| Q14 | Login único entre Connect e Financeiro | PO | Contas separadas; desenhar pensando em OIDC | handoff/01 |

## Módulos 2 a 7

| # | Pergunta | Quem decide | Hoje no spec | Origem |
|---|---|---|---|---|
| N1 | **Integração com o Itaú**: API Pix em lote ou arquivo de remessa? Como vem o retorno por pagamento (erro por pessoa)? Quanto custa? | Pesquisa técnica + PO | Etapa 2 do Módulo 5; até lá, planilha e comprovante em PDF | reunião 21/10 11:23–13:19; handoff/01 punha "pagar pelo banco" fora do escopo |
| N2 | **Captura automática de NF**: NFS-e (prefeitura / Emissor Nacional), NF-e (DANFE/XML) emitidas contra o CNPJ, cancelamentos. Que serviço ou API usar? NFC-e parece não ter fonte nacional | Pesquisa técnica (Manoel, Gustavo) + financeiro | Importar o arquivo exportado dos portais; NFC-e anexada à mão | reunião 21/10 34:41–38:39 |
| N3 | **Dados de RPA e ficha de fornecedor**: PIS/NIT, outros campos, teto do INSS, retenções; regime tributário do PJ | Camila + contabilidade | Alíquota de 11% configurável; campos `(a validar)` | reunião 21/10 39:44–44:00 |
| N4 | **Contrato com o Connect ampliado**: categorias e datas no orçamento, modelo fiscal (NF/RPA) e NF enviada pelo entrevistador, fim do projeto. Mudança aditiva no `v1` | PO + técnico (os dois repos) | Previsto nos specs; ainda não no [handoff/07](../handoff/07-integracao-com-o-connect.md) | reunião 21/10 |
| N5 | Os itens por pessoa do lançamento agrupado viram um título por pessoa ou continuam itens de um lançamento? | Financeiro | Itens de um lançamento (como o financeiro trabalha hoje) | reunião 21/10 20:36–22:55 |
| F2 | Pix que paga entrevistas **e** outros itens da mesma pessoa: a baixa no Connect exige `amount` = soma das entrevistas. Muda o contrato, ou cada natureza tem Pix próprio? | PO + técnico | Um Pix por natureza | alinhamento 21/10 |
| F3 | Lista oficial de **categorias** (plano de contas, cerca de 10 hoje?) e o vínculo com o DRE e com as categorias do orçamento | Financeiro + direção | Proposta de 8 categorias de custo | reunião 21/10 2:32 |
| F4 | **Datas de pagamento por área** (consumo: 15 dias depois do fim; Health: 2 vezes por mês; CATI: 10 dias depois do fim) contra o prazo do Connect, que conta a partir do **lançamento** (`paymentTermDays`). Qual vale para a previsão? | PO + financeiro + gestão | Folha pela regra da área; previsão do Connect mantida para "Meus ganhos" | reunião 21/10 25:52–29:06 |
| F5 | Autorização de gasto acima do orçamento: só admin, ou há alçadas por valor (gestora, direção)? | Direção | Só administrador | reunião 21/10 33:26 |
| F6 | Guardar no cofre os comprovantes de incentivo e de folha que hoje são anexados no SGE4B | DPO + financeiro | Não guardados; registra só "comprovante enviado ao supervisor" | reunião 21/10 9:22 |
| F8 | Multiempresa: quais empresas/CNPJs e unidades, e se há segregação de acesso | Direção + financeiro | Multiempresa com escopo por empresa | levantamento |
| F9 | Obrigações fiscais e contábeis além da exportação para a contabilidade (SPED, integração contábil) | Financeiro + contabilidade | Só a exportação mensal | levantamento |
| F11 | Novos papéis (direção, gestora de projeto, supervisor, comercial, auditor) no Financeiro | PO + Vivi | Só `financeiro` e `admin` | alinhamento 21/10 |

## Escopo futuro

| # | Pergunta | Quem decide | Hoje |
|---|---|---|---|
| F1 | Entram telefonia/consumo digital, atribuição de produção, calculadora de orçamento e evidências/OCR? Quando? | PO + direção | Fora do escopo ([specs/futuro](../specs/futuro/README.md)) |
| F7 | Regra corporativa de atribuição (online × recrutador × entrevistador) | Operação + financeiro + direção | Só se F1 trouxer a atribuição |

## Decididas (histórico)

- **Q11**, o Financeiro altera o orçamento? **Não.** O orçamento é montado no Connect e só muda com autorização de administrador; o Financeiro aplica. Reunião de 21/10 (33:26).
- **F1 (parte)**: substituir o SGE4B entra, em módulos (reunião de 21/10).
- **F10**, formulário completo do SGE4B: substituída pela ação "login de consulta + exportação completa" no [roadmap](roadmap.md).
- **F12**, orçamento de outros custos: por categoria, montado no Connect (reunião de 21/10).
