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
| Q12 | Baixar em outro projeto um comprovante que caiu "fora do projeto" | PO | Não existe; fica como alerta | handoff/08 |
| Q13 | Comprovante de outros bancos ou em imagem (OCR) | PO | Só Itaú/Sispag, PDF com texto | handoff/01, 08 |
| Q14 | Login único entre Connect e Financeiro | PO | Contas separadas; desenhar pensando em OIDC | handoff/01 |
| Q15 | **CPF inteiro e PIS/NIT para o RPA** (D7): o Connect hoje só guarda o hash do CPF (ADR 0003). Guardar inteiro cifrado, ou a contabilidade coletar fora do sistema? | DPO | O Connect não coleta nenhum dos dois | decisões pós-reunião |
| Q17 | O prazo de **6 meses** vale também para as **notas de fornecedores** (hoje 5 anos no cofre do Financeiro)? | DPO + Bruna | 5 anos no cofre, com `retainUntil` | decisões pós-reunião |
| Q18 | O que substitui o **MinIO** no armazenamento de arquivos? O projeto foi arquivado no GitHub, e as imagens e os binários oficiais saíram do ar | João | O compose sobe o MinIO pelo build da Chainguard, fixo por digest ([ADR 0010](../architecture/adr/0010-minio-pelo-build-da-chainguard.md)), até o João decidir. O primeiro upload entrou em 06/11/2026 (anexos das contas, `boto3`, cifra por arquivo): [ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md). Falta o usuário restrito ao bucket | PF-13, 03/11/2026 |
| Q19 | O PDF de comprovantes **fica guardado no lançamento**? O kickoff de 03/11 (K2) pede isso, mas a decisão 10 do handoff, a regra 5 de `visao-geral` e a regra 7 de `comprovantes-e-baixa` dizem que ele é descartado. Se ficar, em qual cofre e por quanto tempo? | João + DPO | O fluxo de comprovante não guarda o PDF. A aba Documentos da conta existe desde 06/11/2026 e aceita qualquer PDF, inclusive um comprovante anexado à mão ([ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md)) | kickoff 03/11 |
| Q20 | A **baixa manual** em Contas a pagar pede reautenticação? A spec de acesso pede para "confirmar baixa", e ainda não está definido como quem entra por Google ou Microsoft se reautentica | João | Não pede; a baixa exige só a sessão. Resolver antes de produção | revisão de 04/11 | **Hoje, na confirmação dos comprovantes:** quem tem autenticador digita o código; quem entra por Google ou Microsoft sem TOTP confirma sem etapa extra.
| Q22 | A **chave Pix do respondente** que vem na planilha de incentivos pode ser guardada no Financeiro? Ela não vem do Connect, e a regra atual só cobre a chave buscada na hora. Se puder, com qual retenção? E a planilha fica anexada ao lançamento? | DPO + João | Não é lida nem guardada: entram só nome e valor. Até a decisão, a chave para pagar continua na planilha original | importar planilha, 04/11/2026 |
| Q23 | **Fornecedor pessoa física:** o CPF pode ser guardado, em hash com os 4 últimos dígitos ou inteiro, se o fiscal exigir? E a chave Pix de fornecedor? | DPO + João | Só CNPJ, opcional. Fornecedor pessoa física fica sem documento, e a chave Pix do fornecedor não é guardada | tela de cadastros, 04/11/2026 |
| Q21 | Provisão conta em **Hoje** e **Vencidos**, e no aviso do Início? Conta parcial que vence hoje mostra "Vence hoje" ou "Parcial"? | Financeiro | Como no protótipo: conta, e o prazo prevalece | revisão de 04/11 |
| Q24 | As datas do lançamento precisam seguir a ordem **emissão ≤ competência ≤ vencimento**? Validar (recusa), só avisar ou deixar livre? | Financeiro (Vivi) | Livre: o sistema não valida a ordem | PF-18, `requisitos-do-prototipo-manus.md` §1 item 4, 05/11/2026 |
| Q25 | Ao cadastrar um fornecedor com **nome parecido** a um que já existe, o sistema só avisa ou bloqueia? | Financeiro (Vivi) | Só impede o mesmo CNPJ ativo; o nome repetido passa sem aviso | PF-18, `requisitos-do-prototipo-manus.md` §1 item 5, 05/11/2026 |
| Q26 | Por quanto tempo guardar as **tentativas de login** (`login_events`) e as **sessões** (`refresh_tokens`)? | DPO | Guarda sem limite: nada apaga. A rotina de limpeza já existe e está **desligada** (simula por padrão e só apaga com prazo configurado e `--apply`). Proposta: 6 meses (Marco Civil, art. 15) e 30 dias depois de expirar |
| Q28 | O **aviso ao comercial** de inadimplência sai depois de quantos dias do vencimento? | Financeiro + comercial | Sem aviso: o sistema só lista a inadimplência por cliente |
| Q29 | **Acréscimos, descontos e impostos** da conta: valem também para contas com pessoas (folha, incentivo) e para parcelas? O imposto lançado é **retenção** (reduz o que se paga ao fornecedor) ou só informação? | Financeiro (Vivi) | Valem na conta comum, a pagar e a receber. Conta com pessoas não aceita, e o parcelado recusa na criação (lance em cada parcela depois). O imposto reduz o valor líquido, que é o que a lista, o pendente e a baixa usam | pedido do PO, 06/11/2026 |
| Q30 | O **Pagar em** (data prevista de pagamento) deve passar a mandar em alguma coisa: sugerir a data da baixa, ou ser a data das visões dia, semana e mês? E ele entra na nova conta? | Financeiro (Vivi) + PO | Só informa e só na edição; lista, indicadores e baixa continuam pelo vencimento | PO, 09/11/2026 |
| Q31 | A lista de **tipos de documento** (nota fiscal, boleto, contrato, comprovante, recibo, planilha e outro) está certa? A spec não tinha "planilha"; falta algum? | Financeiro (Vivi) | Usa essa lista; sem escolha, o tipo é "outro" | protótipo e kickoff (K2), 09/11/2026 |
| Q33 | A consulta de CNPJ na **BrasilAPI** (que recebe só o CNPJ) está de acordo com a LGPD? O CNPJ de MEI identifica uma pessoa. Convém um contrato ou trocar por uma API paga? | DPO | Consulta ligada, sem guardar nada; o DPO pode pedir para desligar com `CNPJ_LOOKUP_MODE` | PO, 09/11/2026 |
| Q34 | No **centro de custo em árvore**, inativar o principal deve inativar também os sub-centros dele? E o superior de um sub-centro poderia mudar (com o código sendo refeito)? | PO + financeiro | Inativar o principal não mexe nos sub-centros (eles continuam escolhíveis); o superior não muda depois de cadastrado | PO, 09/11/2026 |
| Q35 | A mesma **planilha de pagamentos importada duas vezes** deve ser **bloqueada** (ou só com "Importar mesmo assim")? Hoje a tela avisa "Esta planilha já foi importada" e deixa criar, e os lançamentos saem em dobro, prontos para pagar. | João + financeiro (Vivi) | Só avisa; o botão Criar continua ligado | Revisão, 11/11/2026 |
| Q36 | **Envios de comprovantes abandonados** na conferência (a janela é fechada sem confirmar nem cancelar, por exemplo com Esc) ficam abertos no servidor, com nome cifrado e chave mascarada dos recebedores. Depois de quantos dias o sistema deve apagá-los? Fechar a conferência sem querer deve pedir confirmação? | DPO + financeiro | Ficam abertos até alguém cancelar; Esc e clique fora fecham a janela sem perguntar | Revisão, 11/11/2026 |
| Q37 | O cliente **pessoa física** precisa de **RG** no cadastro (o sistema antigo tinha "IE ou RG")? O RG identifica a pessoa, como o CPF (Q23). | DPO + PO | Só a **IE** se guarda; RG e CPF são recusados | PO, 11/11/2026 |
| Q38 | Do cadastro de cliente do sistema antigo, o PO quer também a **busca do endereço pelo CEP** (consulta a um serviço externo, que recebe o CEP) e a aba **Follow Up**? | PO | Nenhum dos dois: o endereço é digitado à mão, e não há Follow Up | PO, 11/11/2026 |
| Q39 | O **gasto do projeto** no relatório usa o **valor líquido** da conta (o que se paga, com acréscimos, descontos e impostos) ou o **bruto**? Imposto retido (INSS, por exemplo) baixa o líquido, mas o custo para a empresa continua. | Financeiro (Vivi) | Valor **líquido**, o mesmo da lista de Contas a pagar | PO, 11/11/2026 |
| Q40 | Quando o Financeiro passa a **ler do Connect** o **orçamento** do projeto (`GET /projects/{id}/budget`) e a **situação** (encerrado)? Hoje o cliente HTTP só lê projetos, itens a pagar e entrevistadores. | João (Connect) | Orçamento e saldo em "—" no relatório, e o projeto do Connect entra sempre "em andamento" | PO, 11/11/2026 |
| Q41 | Onde fica hospedada a **versão de teste do Financeiro** (API, banco e cofre de arquivos) para abrir em `teste/`, no mesmo site do protótipo? Quem paga e quem cuida das contas e das chaves? (Os dados já estão decididos: **só fictícios**; os testes com dados reais ficam só na máquina do Bruno, 11/11/2026.) | João (infraestrutura) + PO | Nada publicado: o botão do protótipo abre a página de aviso. Ver [publicar a versão de teste](../operations/publicar-a-versao-de-teste.md) | PO, 11/11/2026 |
| Q42 | **Feriados e dia não útil:** (a) feriado **municipal ou estadual** vale para todas as unidades ou só para a de cada cidade? (b) a data de pagamento da planilha em dia não útil vai para o **próximo** dia útil (como a recorrência) ou para o **anterior**? (c) o **Carnaval** (BrasilAPI o traz como nacional) conta como dia não útil para pagamento? | Financeiro (Vivi) | Vale para o sistema todo, a data vai para o próximo dia útil com aviso na prévia, e o Carnaval conta nos anos buscados ([ADR 0015](../architecture/adr/0015-feriados-por-cadastro-e-brasilapi.md)) | Bruno, 11/11/2026 |

## Módulos 2 a 7

| # | Pergunta | Quem decide | Hoje no spec | Origem |
|---|---|---|---|---|
| N1 | **Integração com o Itaú**: API Pix em lote ou arquivo de remessa? Como vem o retorno por pagamento (erro por pessoa)? Quanto custa? | Pesquisa técnica + PO | Etapa 2 do Módulo 5; até lá, planilha e comprovante em PDF | reunião 21/10 11:23–13:19; handoff/01 punha "pagar pelo banco" fora do escopo |
| N2 | **Captura automática de NF**: NFS-e (prefeitura / Emissor Nacional), NF-e (DANFE/XML) emitidas contra o CNPJ, cancelamentos. Que serviço ou API usar? NFC-e parece não ter fonte nacional | Pesquisa técnica (Manoel, Gustavo) + financeiro | Importar o arquivo exportado dos portais; NFC-e anexada à mão | reunião 21/10 34:41–38:39 |
| N3 | **Dados de RPA e ficha de fornecedor.** Decidido para o RPA ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md), D7): **CPF e PIS/NIT** bastam, além de nome e endereço. Aberto: teto do INSS, retenções, regime tributário do PJ e os campos da ficha de fornecedor | Camila + contabilidade | Alíquota de 11% configurável; campos da ficha `(a validar)` | reunião 21/10 39:44–44:00 |
| N4 | **Contrato com o Connect ampliado** (mudança aditiva no `v1`): itens do orçamento com data; modelo fiscal (NF/RPA) e status da NF do entrevistador; prazo definido pelo supervisor; **consumo do orçamento**: lançado no Connect pelo coordenador e **lido** pelo Financeiro (E3 de 23/10, que inverte a D5); fim do projeto. O arquivo da NF **não** atravessa a integração (D8) | PO + técnico (os dois repos) | Previsto nos specs; ainda não no [handoff/07](../handoff/07-integracao-com-o-connect.md) | reunião 21/10 e decisões pós-reunião |
| N5 | Os itens por pessoa do lançamento agrupado viram um título por pessoa ou continuam itens de um lançamento? | Financeiro | Itens de um lançamento (como o financeiro trabalha hoje) | reunião 21/10 20:36–22:55 |
| F2 | Pix que paga entrevistas **e** outros itens da mesma pessoa: a baixa no Connect exige `amount` = soma das entrevistas. Muda o contrato, ou cada natureza tem Pix próprio? | PO + técnico | Um Pix por natureza | alinhamento 21/10 |
| F3 | Lista oficial de **categorias** (plano de contas, cerca de 10 hoje?) e o vínculo com o DRE e com as categorias do orçamento | Financeiro + direção | Proposta de 8 categorias de custo | reunião 21/10 2:32 |
| F6 | Guardar no cofre os comprovantes de incentivo e de folha que hoje são anexados no SGE4B | DPO + financeiro | Não guardados pelo fluxo de comprovante; a equipe já pode anexá-los à conta na aba Documentos, sem prazo de guarda; a tela registra só "comprovante enviado ao supervisor" | reunião 21/10 9:22 |
| F8 | Multiempresa: quais empresas/CNPJs e unidades, e se há segregação de acesso | Direção + financeiro | Multiempresa com escopo por empresa | levantamento |
| F9 | Obrigações fiscais e contábeis além da exportação para a contabilidade (SPED, integração contábil) | Financeiro + contabilidade | Só a exportação mensal | levantamento |
| F11 | Novos papéis (direção, gestora de projeto, supervisor, comercial, auditor) no Financeiro | PO + Vivi | Só `financeiro` e `admin` | alinhamento 21/10 |

## Respostas do financeiro de 23/10 (novas)

Respostas e consequências: [registro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md).

| # | Pergunta | Quem decide | Hoje |
|---|---|---|---|
| F13 | A **I-hea** (unidade de negócio com sistema próprio) entra no consolidado do Grupo? Como os números dela chegam (importação, lançamento resumido)? | Direção + financeiro | Fora do Financeiro |
| F14 | **Invoice internacional**: em que moeda é o valor, e o câmbio é registrado? | Financeiro | Título em reais; PDF da invoice anexado; moeda e câmbio não tratados |
| F15 | **Transferência entre empresas**: marcar no lançamento e eliminar no consolidado quando houver repasse | PO + direção | O lançamento pode ser marcado; a eliminação entra com o DRE consolidado |
| F16 | **Boleto recebido por e-mail**: ler o código de barras do PDF automaticamente | PO | Campo "código de barras" digitado; leitura automática é futuro |
| F17 | **Fatura do cartão**: importar a fatura e conferir com os lançamentos rateados | PO | Lançamento manual rateado; importação é futuro |
| F18 | **Adiantamentos e prestação de contas** de viagem ([spec futuro](../specs/futuro/adiantamentos-e-prestacao-de-contas.md)) | PO + financeiro | Lançamento comum com anexos |
| F19 | **Cobrança e comunicação com o cliente** pelo sistema (hoje por e-mail, de forma pessoal) | PO + financeiro | Fora do escopo; revisar depois |
| F20 | **Autorização para passar do orçamento** (D3): como fica agora que o gasto é lançado no Connect pelo coordenador (E3). O mesmo pedido existe no Connect (Q4 de lá) | PO | O Connect bloqueia gasto acima do item; sem autorização por enquanto |
| F21 | O Financeiro pode lançar o gasto de um item do orçamento, ou só **ler** o que o coordenador lançou no Connect (Q5 do Connect)? | PO | Só lê |

## Kickoff de 03/11 (novas)

Perguntas e consequências: [registro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md).

| # | Pergunta | Quem decide | Hoje |
|---|---|---|---|
| F22 | **Tabela de prazos do incentivo por tipo de projeto** (Health 10 dias úteis? "CLT"/CATI 3 ou 4? consumo?). Conta a partir da data da resposta? | Financeiro (Camila) | Prazo em dias úteis no projeto, contado da data da resposta |
| F23 | Onde se marca **tipo de projeto, "tem incentivo" e prazo**: no Connect (coordenador) ou no Financeiro? | PO | Connect, lido pelo Financeiro; no protótipo, campo no cadastro de projeto (o futuro está no [spec](../specs/futuro/respondentes-e-incentivos-no-connect.md)) |
| F24 | **Colunas padrão da planilha de incentivos** (nome, CPF?, chave Pix, valor, data da resposta, projeto) | Financeiro | Modelo fixo para importar: `Nome`, `Valor`, `Data da pesquisa` e/ou `Data de pagamento`, e as colunas opcionais `Projeto`, `Empresa`, `Unidade`, `Centro de custo`, `Categoria` e `Forma de pagamento`, que permitem vários de cada numa planilha. CPF e chave Pix não são lidos |
| F25 | Entrevistadores: **um lançamento por projeto × data de pagamento** ou um por ciclo com vários projetos? | PO + financeiro | Um por projeto × data de pagamento |

## Escopo futuro

| # | Pergunta | Quem decide | Hoje |
|---|---|---|---|
| F1 | Entram telefonia/consumo digital, atribuição de produção, calculadora de orçamento e evidências/OCR? Quando? | PO + direção | Fora do escopo ([specs/futuro](../specs/futuro/README.md)) |
| F7 | Regra corporativa de atribuição (online × recrutador × entrevistador) | Operação + financeiro + direção | Só se F1 trouxer a atribuição |
| F26 | **Respondentes (entrevistados) no Connect:** base de respondentes e incentivo saindo de lá, no ecossistema coordenador → supervisor → entrevistador → entrevistado, com data de pagamento por resposta ([spec](../specs/futuro/respondentes-e-incentivos-no-connect.md); [registro de 03/11](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K5) | PO | Fora do escopo; o incentivo entra por planilha importada |
| F12 | **Planejamento orçamentário do Grupo:** orçamento de todas as áreas, comparado com o realizado. Como o Fabiano planeja hoje, quem preenche, se há versões ([spec](../specs/futuro/planejamento-orcamentario-do-grupo.md)) | PO + Fabiano | Fora do escopo; fase seguinte |

## Decididas (histórico)

Decisões do PO depois da reunião de 21/10: [registro](../transcricoes/2026-10-21-decisoes-pos-reuniao.md).

- **F4**, datas de pagamento por área: o **supervisor define o prazo do projeto e vale para todas as equipes** (D9). As regras por área viram orientação. Falta só o formato do prazo (depois do lançamento ou do fim do projeto).
- **Q27**, receita sem projeto: **existe**. O projeto do título a receber é **opcional**; quando há, é um só, sem rateio (resposta do Bruno, 11/11/2026; a Vivi pode confirmar). Substitui a regra 2 da spec de Contas a receber, que era provisória.
- **Q32**, código do cadastro (fornecedor, cliente e empresa): **gerado pelo sistema**, sequencial em cada cadastro (0001, 0002...), único e nunca reaproveitado (PO, 09/11/2026). Os que já existiam ficam sem código.
- **F5**, quem autoriza gasto acima do orçamento: **algum administrador**, com **log** da autorização (D3).
- **Orçamento em itens** (D1, D2) e **projeto fica no Connect** (D4); pedido de aumento de limite registrado: fora por enquanto.
- **NF do entrevistador não bloqueia o pagamento** (28/10/2026): continua subindo no Connect, mas "NF pendente" é só aviso e quem está pendente entra na planilha e no pagamento. Revê a última frase da D8 ([nota](../transcricoes/2026-10-21-decisoes-pos-reuniao.md#nota-de-28102026-nf-não-bloqueia-o-pagamento)).
- **Q16**, ciclo de vida do projeto: **fica no Connect**, com o papel de **coordenador** (cria o projeto, atribui o supervisor, monta o orçamento por itens e lança o gasto). O Financeiro só tem a visão financeira do projeto. Registro de 23/10 (E1 a E5).
- **Consumo do orçamento** (muda a D5): lançado no Connect pelo coordenador; o Financeiro **lê** o gasto por item. Registro de 23/10 (E3).
- **NF ou RPA:** a pessoa escolhe no cadastro do Connect (D6). **Pagar pelo Itaú:** segue como pesquisa N1 (D11).

- **Q11**, o Financeiro altera o orçamento? **Não.** O orçamento é montado no Connect e só muda com autorização de administrador; o Financeiro aplica. Reunião de 21/10 (33:26).
- **F1 (parte)**: substituir o SGE4B entra, em módulos (reunião de 21/10).
- **F10**, formulário completo do SGE4B: substituída pela ação "login de consulta + exportação completa" no [roadmap](roadmap.md).
- **F12**, orçamento de outros custos: por categoria, montado no Connect (reunião de 21/10).
