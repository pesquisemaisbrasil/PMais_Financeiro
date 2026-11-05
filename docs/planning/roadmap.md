# Roadmap

Ordem dos módulos do Financeiro e o estado de cada um. Cada módulo segue o mesmo caminho:

1. **Protótipo** rápido e genérico, validado com o financeiro (Bruna e Camila) até o "é isso" [Reunião 21/10 45:39–46:21].
2. **Specs** atualizados com o que o protótipo mostrou.
3. **Construção** na arquitetura e nos padrões do [handoff](../handoff/README.md) (02 a 10), com um PR por entrega.
4. **Uso em paralelo** com o SGE4B até bater, e depois troca.

## Ações antes de começar

- [x] Login de consulta no SGE4B para o time de desenvolvimento (funcionalidades e relatórios). Já existe (05/11/2026).
- [ ] Reunião só para levantar as **11 bases** e os relatórios usados, e pedir ao fornecedor do SGE4B a **exportação completa**. **Adiada** (05/11/2026): a migração das bases fica para depois, sem data.
- [ ] Levantar com a Camila os dados de RPA e da ficha de fornecedor (N3).
- [ ] Ampliar o contrato `v1` com o que as decisões de 21/10 pedem (N4): itens do orçamento com data, modelo fiscal e status da NF, consumo do orçamento, prazo do projeto. ADR da integração no Connect.
- [ ] Pesquisas técnicas: integração Itaú (N1) e captura automática de NF (N2).

## Módulos

| # | Módulo | Specs | Depende de | Estado |
|---|---|---|---|---|
| 0 | Fundação do repositório | [handoff/11 fase 0](../handoff/11-plano-de-implementacao.md) | — | em andamento: login com MFA e SSO, CI, compose e componentes entregues; faltam o armazenamento de arquivos (Q18) e AGENTS.md, skills e revisores (PF-11) |
| 1 | Pagamento de entrevistadores | acesso-e-auditoria, pagamentos-a-pagar, comprovantes-e-baixa, integracao-com-o-connect | 0; API de integração no Connect | specs prontos |
| 2 | Cadastros, papéis e migração | cadastros-e-dimensoes, papeis-e-escopo-ampliados | 0; exportação do SGE4B | specs prontos; falta a exportação |
| 3 | Contas a pagar e a receber | contas-a-pagar, contas-a-receber, baixas-recorrencia-e-anexos, documentos-fiscais | 2 | em andamento: Início e primeira fatia do Contas a pagar na `homolog`; faltam importar planilha, anexos (Q18, Q19) e as ações listadas na spec |
| 4 | Projetos, orçamento e provisionamento | projetos-financeiros, orcamento-e-saude-financeira | 1, 3; categorias do orçamento no Connect (N4) | specs prontos |
| 5 | Folha de campo e pagamento em lote | regras-de-pagamento-de-campo, folha-de-campo, lotes-de-pagamento-de-campo | 1, 3, 4; etapa 2 depende de N1 | specs prontos |
| 6 | Conciliação bancária | bancos-e-conciliacao | 3 | specs prontos |
| 7 | Relatórios e fluxo de caixa | relatorios-e-analises | 3, 4, 6 | specs prontos |

**Por que essa ordem:**
- o Módulo 1 já está desenhado em detalhe pelo handoff e tira o risco da integração com o Connect;
- o 2 e o 3 substituem o uso diário do SGE4B;
- o 4 e o 5 eliminam a redigitação;
- o 6 e o 7 dependem de lançamentos e baixas confiáveis.

O 2 pode começar em paralelo ao 1, porque não depende do Connect.

## Plano dos 3 primeiros meses (apresentado à direção)

Decidido em 22 e 23/10 ([registro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E9 a E11). Antes de tudo, o **protótipo do Marco** com dados de exemplo, aprovado pelo financeiro. Depois, 6 entregas em 12 semanas, com reunião de status semanal ou quinzenal e acompanhamento no Jira:

| Semanas | Entrega | Módulos | Observação |
|---|---|---|---|
| 1–2 | Base do sistema e cadastros | 0, 2 | Importação **de teste** do SGE4B; a definitiva fica perto da troca |
| 3–4 | Pagamento de entrevistadores | 1 | **Porta o que já roda no Connect** (planilha, PDF de comprovantes, baixa) |
| 5–6 | Contas a pagar | 3 | Rateio, baixa parcial e em lote, recorrência, código de barras |
| 7–8 | Folha, incentivos, notas e provisões | 3, 4, 5 (parte) | Lançamento agrupado com itens; NF do entrevistador sobe no Connect; provisão vem do orçamento por itens do Connect |
| 9–10 | Contas a receber e dashboards | 3, 7 (parte) | Bruto, abatimentos e líquido; dashboards dentro do plano |
| 11–12 | Conferência do banco e caixa | 6 | Conciliação com sugestão; IA fica para depois; treinamento e balanço |

**Fora dos 3 meses ("próximas evoluções"):** captura automática de NF, conciliação com IA, autorização para passar do orçamento, folha de campo e pagamento em lote pelo Itaú, fechamento do mês, relatórios por projeto, DRE por empresa/unidade/Grupo, planejamento do Grupo × realizado, pipeline de propostas, integrações com bancos, novos perfis.

**Dependência no Connect (mudanças em outro repositório):** papel de **coordenador**, escopo do supervisor por projeto, histórico de alterações do projeto, gasto por item do orçamento e convite de cadastro de entrevistadores. O Financeiro lê `items[].spent` e a provisão a partir de `/integrations/v1/projects/{id}/budget`.

## Kickoff com o financeiro (03/11/2026)

[Registro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md). O protótipo foi mostrado a Bruna e Camila, mas a chamada caiu e o resto **não foi visto: a reunião será remarcada**. O que mudou no plano:

- o pagamento de entrevistadores chega como **lançamento agrupado em Contas a pagar**, e a tela por projeto vira relatório (K1 a K4); isso afeta as entregas 2 e 3;
- o **incentivo** entra por planilha importada, dividido por data de pagamento, com prazo em dias úteis por tipo de projeto (K5 a K7); entra na entrega 4;
- o protótipo é **revisto** com isso; as próximas demonstrações usam **dados reais** do SGE4B (K9);
- perguntas novas F22 a F25 em [perguntas-abertas](perguntas-abertas.md).

## Como testar

Cada módulo, ao ser entregue, ganha aqui o roteiro manual de teste (como no roadmap do Connect).

### Início e Contas a pagar

Com o sistema rodando e as contas fictícias carregadas (`.venv/Scripts/python scripts/seed_demo.py`, em `backend/`):

1. Entre: a tela abre no **Início**, com contas vencidas, a pagar em 7 dias, o que precisa de atenção, fluxo previsto e próximos vencimentos. A receber e saldo nos bancos ficam com "—".
2. Em **Contas a pagar**, a tela abre no dia de hoje. Troque para semana, mês, ano e tudo. Clique na data para abrir o calendário: a data inicial e depois a final já aplicam o intervalo.
3. Clique nos indicadores e nas abas: a lista e os totais acompanham. Combine com filtros e busca, e use **Limpar filtros**.
4. Na linha de **14 entrevistados**, abra a seta: as pessoas aparecem na própria lista, com busca por nome.
5. Provisão e **Do Connect** não têm o botão de baixa. Na conta de passagens, **Dar baixa**: a situação vira "Paga" e o contador do menu diminui.
6. Em **Ver detalhes → Baixas**, estorne com motivo: as duas linhas ficam visíveis, e o valor volta a pendente. O **Histórico** mostra quem fez o quê.
7. **Nova conta a pagar**: um rateio que não fecha mostra a diferença e não salva. Corrija e lance.
8. Selecione duas contas e dê baixa em lote. Tente excluir uma com baixa: o sistema recusa até estornar.
9. Recolha o menu lateral pelo botão ao lado do logo: ficam só os ícones, e a escolha continua depois de recarregar.
10. **Filtros** abre um painel lateral: a lista muda enquanto você escolhe, e o botão de baixo mostra quantas contas sobraram. Digite na lista de **Fornecedor** para achar sem rolar, sem precisar de acento. Experimente **Unidade**, **Situação**, **Tipo** e **Período por**.
11. Em **Colunas**, ligue mais colunas e escolha a densidade **Compacta**. A escolha fica guardada neste navegador.
12. **Exportar** baixa um CSV com tudo o que os filtros mostram. Abra no Excel: os acentos aparecem certos, e os filtros estão na primeira linha.
13. Selecione contas e use **Reclassificar**: sem escolher nada, o sistema pede o que vai mudar. O **Histórico** mostra o antes e o depois.
14. Selecione uma conta e use **Duplicar**: a cópia aparece no mês seguinte, sem baixas.
15. Em **Nova conta a pagar**, marque **É uma provisão** e lance sem fornecedor. Na linha, **Substituir pelo valor real**: o total conta só o real, sem contar duas vezes. Cancele o real: a provisão volta a valer.

Para **importar planilha**, use um arquivo fictício, nunca uma planilha real em ambiente de teste. Em **Contas a pagar → Importar planilha**:

1. Escolha **Incentivos**, o PRJ-1804, os cadastros e um arquivo com as colunas `Nome`, `Valor` e `Data da pesquisa`, em .xlsx ou .csv.
2. **Ler planilha** mostra o cronograma: um lançamento por data de pagamento, 10 dias úteis depois da pesquisa, pulando feriados. Linha com `R$` no valor fica de fora e diz o motivo.
3. Com o PRJ-1790, que não tem prazo, a tela avisa e não deixa criar, a não ser que a planilha traga a coluna `Data de pagamento`.
4. **Copiar cronograma para o projeto** gera o texto para o e-mail. **Criar** abre os lançamentos na aba **Planilhas e agrupados**, com as pessoas na seta da linha.
5. Na seta de um lançamento importado, cada pessoa mostra a **data da pesquisa** (incentivos), o número e a emissão da **nota**, o **bruto e o INSS** (RPA) e o **pagamento**: "A pagar" até a baixa do lançamento, e "Paga em dd/mm" depois dela.
6. Em **Folha de campo**, use `Nome`, `Documento`, `Valor`, `Número da NF` e `Emissão`: RPA de R$ 1.000,00 entra como R$ 890,00, e NF sem número fica como pendente.

Em **Cadastros**, no menu:

1. **Novo fornecedor**: apelido e nome são obrigatórios. Um CNPJ com dígito errado é recusado, e um CPF também, porque CPF não fica guardado. Teste com `11.222.333/0001-81`.
2. O mesmo CNPJ em outro fornecedor ativo é recusado.
3. Um cadastro com lançamento não mostra **Excluir**, só **Inativar**. Inativado, ele some da **Nova conta a pagar** e continua na lista de contas.
4. Em **Projetos (Connect)**, marque o tipo, o incentivo e o prazo. Volte ao **Importar planilha**: o projeto passa a calcular o cronograma.

### Login com MFA, Google e Microsoft

Com o sistema rodando ([README](../../README.md#como-rodar)):

1. Abra `http://localhost:3010/`: sem sessão, cai em `/login`.
2. Entre com a senha errada: "E-mail ou senha incorretos", igual para e-mail sem conta.
3. Entre com a senha certa pela primeira vez: pede o cadastro do segundo fator. Abrir `/` em outra aba ainda cai em `/login`.
4. Leia o QR code com um app autenticador e digite o código: aparecem os 10 códigos de recuperação. Só depois de **Já guardei, continuar** a tela inicial abre.
5. Recarregue a página e abra outra aba: continua logado nas duas, sem pedir código.
6. Clique em **Sair** e abra `/`: volta para `/login`.
7. Entre de novo: agora pede só o código do app. Repetir o mesmo código não entra.
8. Saia e entre com **Usar um código de recuperação**: entra, e o mesmo código não vale uma segunda vez.
9. Erre a senha 6 vezes em um minuto: "Muitas tentativas — aguarde alguns minutos".
10. Sem as chaves do provedor, **Entrar com Google** e **Entrar com Microsoft** voltam para o login avisando que ainda não está disponível.
11. Com as chaves no `backend/.env` e a conta criada com o mesmo e-mail: o botão leva ao provedor e volta para a tela inicial, sem código no Financeiro. E-mail sem conta volta para o login com o aviso de falta de acesso.
