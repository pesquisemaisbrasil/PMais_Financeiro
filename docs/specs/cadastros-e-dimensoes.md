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

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 2:48–5:47, 42:49–44:00]: o financeiro cadastra fornecedores, categorias e projetos; 11 bases; ficha de fornecedor.


- [SGE4B §4, §5.7, §5.8, §7.1]; lista de campos a validar: [SGE4B §5.7].
- [S1 05:03, 07:45]: planilha de controle e planejamento recebido.
- Pendências F8 (multiempresa), F9 (fiscal). Formulário completo do SGE4B: ver o login de consulta e a exportação no roadmap.
