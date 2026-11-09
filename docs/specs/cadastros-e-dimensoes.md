# Spec: Cadastros e dimensões

> **Módulo 2 — Cadastros, papéis e migração.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato dos cadastros-base e das dimensões de gestão que classificam todo lançamento: empresa, unidade, centro de custo, plano de contas, linha do DRE, cliente, fornecedor, contrato e pessoa de campo. Inclui a migração do SGE4B.

## Comportamento

- **Empresa** (CNPJ, razão social, nome fantasia) → **Unidade** (pertence a uma empresa) → **Centro de custo**. As quatro dimensões — empresa, unidade, projeto e centro de custo — são **independentes** no lançamento: o projeto sugere unidade e centro de custo, mas o usuário pode trocar [SGE4B §4.3].
- **Plano de contas** hierárquico (código, descrição, natureza receita/despesa, analítica ou sintética). Só conta analítica recebe lançamento. Cada conta analítica aponta para **uma linha do DRE**.
- **Linha do DRE**: lista ordenada (receita bruta, deduções, custos diretos de campo, despesas operacionais...) usada pelo relatório DRE.
- **Rubrica** (custo de projeto, ver [orcamento-e-saude-financeira](orcamento-e-saude-financeira.md)): cada rubrica aponta para uma conta analítica padrão.
- **Fornecedor**: apelido* e nome*, como no SGE4B, mais CPF/CNPJ, razão social, nome fantasia, contato responsável, referências (como na ficha de fornecedor que o financeiro usa hoje [Reunião 21/10 42:49–44:00]), telefones (código do país, DDD, número), e-mails, endereço, dados bancários, chave Pix, condição de pagamento, status ativo/inativo e anexos. Tipos: empresa (telefonia, lista, plataforma de disparo, bot) ou pessoa.
- **Cliente**: os mesmos dados do fornecedor, mais contatos de cobrança, condições comerciais e a lista dos projetos.
- **Contrato**: número, parte (cliente ou fornecedor), vigência, valor e anexo. É opcional no lançamento (a validar: no SGE4B aparece como obrigatório).
- **Pessoa de campo**: **não é cadastrada aqui.** Fica no Connect; o Financeiro referencia `connect_interviewer_id` e lê nome e chave mascarada pela API ([../integracao-com-o-connect](integracao-com-o-connect.md)).
- Toda lista tem pesquisa, filtros, ordenação, paginação, quantidade por página, impressão e exportação, e mostra "últimos alterados" [SGE4B §5.7–5.8].

## Regras

1. Código único por empresa para o projeto, o centro de custo e a conta.
2. CPF/CNPJ válido (dígito verificador) e único entre os fornecedores ativos. CPF de fornecedor pessoa física é guardado só em hash + 4 últimos dígitos (a validar com o DPO; o fiscal pode exigir CPF em claro para pagamento).
3. Cadastro em uso (com lançamento) **não é excluído**, só inativado. Inativo não aparece para novos lançamentos, mas continua nos relatórios.
4. Mudar o vínculo conta ↔ linha do DRE vale dali para a frente. O DRE de períodos fechados não muda.
5. Telefone em E.164 (`+55` + DDD + número); e-mail válido.
6. Importação em massa por planilha (CSV/XLSX) com pré-visualização, erros linha a linha e confirmação antes de gravar.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Salvar sem campo obrigatório | 422 | (validação por campo) |
| CNPJ/CPF já cadastrado em outro fornecedor ativo | 409 | Já existe um fornecedor ativo com esse documento |
| Excluir cadastro com lançamentos | 409 | Esse cadastro tem lançamentos — inative em vez de excluir |
| Lançar em conta sintética | 422 | Escolha uma conta analítica |
| Conta analítica sem linha do DRE | 422 | Vincule a conta a uma linha do DRE |

## Critérios de aceite

- [ ] Cadastrar uma empresa com 2 unidades e 3 centros de custo e usá-los num lançamento.
- [ ] Um projeto sugere unidade e centro de custo no lançamento, e trocar a sugestão é permitido.
- [ ] Um fornecedor com título lançado não pode ser excluído; inativado, some do seletor e continua no relatório.
- [ ] Importar 100 fornecedores com 3 linhas erradas mostra as 3 linhas com o motivo e grava só depois da confirmação.

## Migração

Tudo o que existe no SGE4B vem junto: são **11 bases de dados** e cerca de **mil fornecedores**. Não dá para começar do zero nem recadastrar à mão [Reunião 21/10 3:30–5:47, 46:30]. O caminho é pedir ao fornecedor do SGE4B a **exportação completa** e fazer uma reunião só para levantar as bases e os relatórios usados.

Do SGE4B e das planilhas, nesta ordem, com relatório de conferência a cada etapa:

1. Empresas, unidades, centros de custo, plano de contas e linhas do DRE.
2. Clientes, fornecedores e contratos (com deduplicação por documento).
3. Projetos: SGE4B + planilha de controle de projetos da gestão (desde ago/2024) [S1 05:03], casados com o ID do Connect. Daqui para a frente, **projeto novo vem do Connect**: o financeiro não cadastra mais projeto à mão [Reunião 21/10 3:00–3:15, 33:26].
4. Títulos em aberto (a pagar e a receber), com as baixas parciais.
5. Histórico (títulos pagos e recebidos, fechamentos por projeto) como **somente leitura**, para relatórios e para a calculadora (escopo futuro).

Critério: o saldo em aberto por empresa e por fornecedor/cliente bate 100% com o SGE4B na data de corte. Até o corte, os dois sistemas rodam em paralelo.

## Onde está no código

- `backend/api/records.py`, `backend/services/records.py` e `frontend/src/app/(app)/cadastros/page.tsx`.

**O que ainda falta:** cliente e contrato, CNPJ e razão social da empresa, centro de custo e conta com código por empresa, plano de contas com conta sintética, natureza e linha do DRE, rubrica, CPF e chave Pix do fornecedor (Q23), telefones e e-mails múltiplos, endereço, dados bancários, anexos, filtros, ordenação, impressão e exportação das listas, "últimos alterados", importação em massa e a migração do SGE4B.

Origem do requisito:

- [Reunião 21/10 2:48–5:47, 42:49–44:00]: o financeiro cadastra fornecedores, categorias e projetos; 11 bases; ficha de fornecedor.


- [SGE4B §4, §5.7, §5.8, §7.1]; lista de campos a validar: [SGE4B §5.7].
- [S1 05:03, 07:45]: planilha de controle e planejamento recebido.
- Pendências F8 (multiempresa), F9 (fiscal). Formulário completo do SGE4B: ver o login de consulta e a exportação no roadmap.

## Ajustes

- 2026-10-23: o Grupo tem **4 empresas** (MC, PPlus, P Plus Log e Medtrek). A **I-hea** é uma unidade de negócio com sistema próprio e fica **fora** do Financeiro por enquanto (pergunta F13) ([respostas do financeiro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A1).
- 2026-11-04 (tela de cadastros): o fornecedor aceita só **CNPJ**, opcional, inclusive o alfanumérico. O spec pede CPF/CNPJ, mas a regra do projeto é não guardar CPF, e o hash com os 4 últimos dígitos ainda depende do DPO; por isso fornecedor pessoa física fica sem documento até a Q23. A chave Pix de fornecedor também fica de fora até lá.
- 2026-11-04 (tela de cadastros): **projeto não é criado aqui**, só recebe o tipo, o "tem incentivo" e o prazo (F23). Até a integração com o Connect (PF-6), os projetos só existem se entrarem pela carga inicial.
- 2026-11-04 (tela de cadastros): toda criação, edição, inativação e exclusão fica em `record_events`, que só recebe linhas novas. Cadastro em uso mantém a empresa, para o lançamento não ficar com a unidade de outra empresa. Empresa com unidade ou conta bancária conta como em uso.
- 2026-11-05: o time de desenvolvimento **já tem o login de consulta no SGE4B**. A **migração das bases** (as 11 bases, cerca de mil fornecedores) e o pedido de exportação completa ao fornecedor ficam **para depois**, sem data. Até lá, os cadastros entram pela tela de Cadastros e pela planilha importada (PF-8).
- 2026-11-06: o **cliente** passou a existir no Cadastros (apelido, nome, CNPJ, contato, telefone e e-mail; **só CNPJ**, como no fornecedor, e único entre os ativos). Cliente com título é inativado, não excluído. O **plano de contas** ganhou o tipo **despesa** ou **receita**; o tipo não muda quando a conta já tem lançamento. Contrato e linha do DRE seguem como estavam.
- 2026-11-09 (**CNPJ primeiro**): fornecedor, cliente e **empresa do Grupo** passam a ter os mesmos campos, com o **CNPJ** no topo e a busca por ele: a pessoa digita o CNPJ (ou clica em **Buscar**), o sistema consulta a Receita pela BrasilAPI ([ADR 0013](../architecture/adr/0013-consulta-de-cnpj-pela-brasilapi.md)) e preenche o **Nome / razão social** e o **Apelido**, que continuam editáveis. Campos: **Código** (opcional), **Apelido**, **Nome / razão social** e **CNPJ**; fornecedor e cliente seguem com contato, telefone e e-mail (e o fornecedor, com a condição de pagamento). O **Tipo** do sistema antigo não entra: cada tipo tem a sua tela.
- 2026-11-09: a consulta só completa o que está vazio (ou ainda é o que ela mesma pôs); **Buscar** troca Nome e Apelido. Empresa **baixada**, inapta ou suspensa na Receita ganha um aviso ("Situação na Receita: BAIXADA"), mas pode ser cadastrada. **CPF continua não sendo guardado** (Q23): vale só CNPJ, e o CPF que vem no fim da razão social de MEI é tirado do nome. Se a Receita não responde ou não conhece o CNPJ, a tela avisa e deixa preencher à mão.
- 2026-11-09 (**empresa do Grupo**): ganha **código**, **apelido** e **CNPJ** (único entre as ativas, só CNPJ). O nome passa a aceitar 200 letras. O código dos três é gerado pelo sistema (ver a nota "código gerado", abaixo). A lista de Cadastros mostra Código, Apelido · nome e CNPJ também na empresa.
- 2026-11-09 (totais): no alto de cada aba de Cadastros ficam dois totais, como no sistema antigo: **Exibindo** (quantos a busca de agora está mostrando) e **Total de …** (todos os cadastros da aba, com a conta de ativos e inativos; em Projetos, o total que vem do Connect). O total não muda com a busca.
- 2026-11-09 (**código gerado**): o **Código** de fornecedor, cliente e empresa do Grupo é **gerado pelo sistema**, no cadastro novo: 0001, 0002..., um contador para cada cadastro. Não se repete e **não é reaproveitado**, nem se o cadastro for excluído; depois de criado, não muda (nem na edição, nem ao inativar). O campo na tela só mostra. O que vier digitado é ignorado. Os cadastros que já existiam ficam sem código (a lista mostra "—"). O plano de contas continua com o código que a pessoa escolhe (2.04, por exemplo). Decisão do PO; resolve a Q32.
- 2026-11-09 (ordem): o menu de Cadastros segue esta ordem: **Empresas, Unidades, Centros de custo, Clientes, Fornecedores, Plano de contas**, e depois **Projetos (Connect), Contas bancárias e Formas de pagamento**. Abrir Cadastros sem escolher o tipo abre o primeiro, **Empresas** (antes abria Fornecedores). Pedido do PO.
- 2026-11-09 (**tipo de pessoa**): fornecedor, cliente e empresa ganham o campo **Tipo**, como no sistema antigo: **Pessoa jurídica** (padrão no cadastro novo, com CNPJ e a busca pela Receita) ou **Pessoa física**. O tipo é guardado (`personType`: PJ ou PF). **Pessoa física fica sem documento**: o CPF continua não sendo guardado (Q23), o campo CNPJ fica desligado, trocar para pessoa física limpa o CNPJ e o servidor recusa PF com documento. A lista mostra "Pessoa física" onde o CNPJ ficaria. Os cadastros que já tinham CNPJ viram pessoa jurídica; os outros ficam sem tipo até alguém escolher.
- 2026-11-09 (ações em todas as linhas): **Editar, Inativar (ou Reativar) e Excluir** aparecem em **todas** as linhas de todas as abas. Cadastro com lançamentos continua **não podendo ser excluído** (o banco não deixa: o histórico precisa do cadastro), então nele o Excluir aparece esmaecido e, ao clicar, a tela explica "tem lançamentos: inative em vez de excluir". Pedido do PO.
- 2026-11-09 (quatro totais): no alto de cada aba ficam **quatro** cards: **Exibindo**, **Total de …**, **Ativos** e **Inativos** (a soma dos dois últimos é o total). Em Projetos (Connect), os dois últimos são **Em andamento** e **Encerrados**. Substitui a linha "N ativos · M inativos" que ficava dentro do card do total. Pedido do PO.
