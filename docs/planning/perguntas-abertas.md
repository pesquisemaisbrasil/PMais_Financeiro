# Perguntas abertas

Regras de produto e pesquisas ainda sem resposta. **Não decida no código:** implemente o comportamento da coluna "Hoje" e, quando sair a decisão, atualize o spec dono, registre em `docs/transcricoes/` e tire a linha daqui.

## Módulo 1: pagamento de entrevistadores

| # | Pergunta | Quem decide | Hoje | Origem |
|---|---|---|---|---|
| Q1 | O supervisor acessa o Financeiro? | Vivi | Não acessa. Lança entrevistas e sobe NF no Connect | handoff/01 |
| Q2 | O aviso "comprovantes de pessoas fora do projeto" deve chegar ao supervisor (hoje chega, no Connect)? | Vivi | Vai só para admin e financeiro | alinhamento 21/10 |
| Q3 | O entrevistador vê ou baixa o próprio comprovante? | Vivi + jurídico | Não; vê "Pago em dd/mm" no Connect | handoff/01, 08 |
| Q4 | Cancelar baixa (estorno do banco, baixa errada) passa a existir? Com dupla aprovação? | PO | Não existe para entrevistas; as voltas de contas a pagar são tratadas em baixas-recorrencia-e-anexos | handoff/07 §4.7 |
| Q5 | Retenção de comprovantes e logs. **Decidido para a NF do entrevistador** ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md), D8): 6 meses no Connect, agrupada por projeto; o definitivo (5 anos) fica na rede da empresa. Aberto: o mesmo vale para notas de fornecedores? (Q17) | DPO + contabilidade | Nada é apagado automaticamente; o PDF de Pix do entrevistador não é guardado; a NF do entrevistador sai do Financeiro | handoff/01, reunião 21/10 |
| Q6 | Aval do DPO sobre a planilha com chave Pix completa | DPO | Implementada com auditoria nos dois sistemas | handoff/08 |
| Q7 | ROPA/RIPD das novas operações (conciliação por comprovante, NF/RPA de prestadores) | DPO | Pendente | handoff/08, reunião 21/10 |
| Q8 | Segregação de funções: quem envia o lote não confirma a baixa dele acima de qual valor? | PO | Sem segregação | handoff/06 §2 |
| Q9 | Resumo de pagamentos para o Financeiro: diário ou semanal? | Financeiro | Diário | handoff/08 |
| Q10 | Login por e-mail ou por CPF? (o handoff/06 diz e-mail; o handoff/04 diz copiar o login por CPF do Connect) | PO + técnico | E-mail | alinhamento 21/10 |
| Q12 | Baixar em outro projeto um comprovante que caiu "fora do projeto" | PO | Não existe; fica como alerta | handoff/08 |
| Q13 | Comprovante de outros bancos ou em imagem (OCR) | PO | Só Itaú/Sispag, PDF com texto | handoff/01, 08 |
| Q14 | Login único entre Connect e Financeiro | PO | Contas separadas; desenhar pensando em OIDC | handoff/01 |
| Q15 | **CPF inteiro e PIS/NIT para o RPA** (D7): o Connect hoje só guarda o hash do CPF (ADR 0003). Guardar inteiro cifrado, ou a contabilidade coletar fora do sistema? | DPO | O Connect não coleta nenhum dos dois | decisões pós-reunião |
| Q16 | O ciclo de vida do projeto (`proposta` a `fechado`), o checklist e a aprovação do orçamento ficam no Financeiro ou no Connect, já que o **supervisor administra o projeto no Connect** (D4)? | PO + técnico | Spec projetos-financeiros descreve no Financeiro; revisar | decisões pós-reunião |
| Q17 | O prazo de **6 meses** vale também para as **notas de fornecedores** (hoje 5 anos no cofre do Financeiro)? | DPO + Bruna | 5 anos no cofre, com `retainUntil` | decisões pós-reunião |

## Módulos 2 a 7

| # | Pergunta | Quem decide | Hoje no spec | Origem |
|---|---|---|---|---|
| N1 | **Integração com o Itaú**: API Pix em lote ou arquivo de remessa? Como vem o retorno por pagamento (erro por pessoa)? Quanto custa? | Pesquisa técnica + PO | Etapa 2 do Módulo 5; até lá, planilha e comprovante em PDF | reunião 21/10 11:23–13:19; handoff/01 punha "pagar pelo banco" fora do escopo |
| N2 | **Captura automática de NF**: NFS-e (prefeitura / Emissor Nacional), NF-e (DANFE/XML) emitidas contra o CNPJ, cancelamentos. Que serviço ou API usar? NFC-e parece não ter fonte nacional | Pesquisa técnica (Manoel, Gustavo) + financeiro | Importar o arquivo exportado dos portais; NFC-e anexada à mão | reunião 21/10 34:41–38:39 |
| N3 | **Dados de RPA e ficha de fornecedor.** Decidido para o RPA ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md), D7): **CPF e PIS/NIT** bastam, além de nome e endereço. Aberto: teto do INSS, retenções, regime tributário do PJ e os campos da ficha de fornecedor | Camila + contabilidade | Alíquota de 11% configurável; campos da ficha `(a validar)` | reunião 21/10 39:44–44:00 |
| N4 | **Contrato com o Connect ampliado** (mudança aditiva no `v1`): itens do orçamento com data; modelo fiscal (NF/RPA) e status da NF do entrevistador; prazo definido pelo supervisor; **consumo do orçamento** lido pelo Connect (D5); fim do projeto. O arquivo da NF **não** atravessa a integração (D8) | PO + técnico (os dois repos) | Previsto nos specs; ainda não no [handoff/07](../handoff/07-integracao-com-o-connect.md) | reunião 21/10 e decisões pós-reunião |
| N5 | Os itens por pessoa do lançamento agrupado viram um título por pessoa ou continuam itens de um lançamento? | Financeiro | Itens de um lançamento (como o financeiro trabalha hoje) | reunião 21/10 20:36–22:55 |
| F2 | Pix que paga entrevistas **e** outros itens da mesma pessoa: a baixa no Connect exige `amount` = soma das entrevistas. Muda o contrato, ou cada natureza tem Pix próprio? | PO + técnico | Um Pix por natureza | alinhamento 21/10 |
| F3 | Lista oficial de **categorias** (plano de contas, cerca de 10 hoje?) e o vínculo com o DRE e com as categorias do orçamento | Financeiro + direção | Proposta de 8 categorias de custo | reunião 21/10 2:32 |
| F6 | Guardar no cofre os comprovantes de incentivo e de folha que hoje são anexados no SGE4B | DPO + financeiro | Não guardados; registra só "comprovante enviado ao supervisor" | reunião 21/10 9:22 |
| F8 | Multiempresa: quais empresas/CNPJs e unidades, e se há segregação de acesso | Direção + financeiro | Multiempresa com escopo por empresa | levantamento |
| F9 | Obrigações fiscais e contábeis além da exportação para a contabilidade (SPED, integração contábil) | Financeiro + contabilidade | Só a exportação mensal | levantamento |
| F11 | Novos papéis (direção, gestora de projeto, supervisor, comercial, auditor) no Financeiro | PO + Vivi | Só `financeiro` e `admin` | alinhamento 21/10 |

## Escopo futuro

| # | Pergunta | Quem decide | Hoje |
|---|---|---|---|
| F1 | Entram telefonia/consumo digital, atribuição de produção, calculadora de orçamento e evidências/OCR? Quando? | PO + direção | Fora do escopo ([specs/futuro](../specs/futuro/README.md)) |
| F7 | Regra corporativa de atribuição (online × recrutador × entrevistador) | Operação + financeiro + direção | Só se F1 trouxer a atribuição |
| F12 | **Planejamento orçamentário do Grupo:** orçamento de todas as áreas, comparado com o realizado. Como o Fabiano planeja hoje, quem preenche, se há versões ([spec](../specs/futuro/planejamento-orcamentario-do-grupo.md)) | PO + Fabiano | Fora do escopo; fase seguinte |

## Decididas (histórico)

Decisões do PO depois da reunião de 21/10: [registro](../transcricoes/2026-10-21-decisoes-pos-reuniao.md).

- **F4**, datas de pagamento por área: o **supervisor define o prazo do projeto e vale para todas as equipes** (D9). As regras por área viram orientação. Falta só o formato do prazo (depois do lançamento ou do fim do projeto).
- **F5**, quem autoriza gasto acima do orçamento: **algum administrador**, com **log** da autorização (D3).
- **Orçamento em itens** (D1, D2) e **projeto fica no Connect** (D4); pedido de aumento de limite registrado: fora por enquanto.
- **NF ou RPA:** a pessoa escolhe no cadastro do Connect (D6). **Pagar pelo Itaú:** segue como pesquisa N1 (D11).

- **Q11**, o Financeiro altera o orçamento? **Não.** O orçamento é montado no Connect e só muda com autorização de administrador; o Financeiro aplica. Reunião de 21/10 (33:26).
- **F1 (parte)**: substituir o SGE4B entra, em módulos (reunião de 21/10).
- **F10**, formulário completo do SGE4B: substituída pela ação "login de consulta + exportação completa" no [roadmap](roadmap.md).
- **F12**, orçamento de outros custos: por categoria, montado no Connect (reunião de 21/10).
