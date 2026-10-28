# P+ Financeiro — roteiro do mockup interativo

**MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL**

Abra o Preview do projeto. Na tela de entrada, use o identificador `adm` e a senha que você configurou no formulário protegido. A sessão dura até 30 minutos; use **Sair** no cabeçalho para encerrá-la. Reiniciar o serviço pode exigir novo login. Esse acesso serve somente ao mockup, não autoriza o Financeiro de produção.

A Visão geral é o dashboard e a barra lateral dá acesso aos sete módulos. Os dados ficam somente neste navegador, não no banco. Não insira nomes, valores, documentos ou dados de pessoas/empresas reais. Os dados não são compartilhados entre computadores e não são uma base corporativa.

## Teste a interatividade

1. **Cadastros (M2):** crie um fornecedor ou cliente, categoria ou centro de custo DEMO. Eles ficam disponíveis em Contas. Edite o nome ou inative um fornecedor; seus registros anteriores continuam, mas ele deixa de ser elegível para um título novo. Crie um projeto sintético ligado a um cliente DEMO. O projeto não é criado no Connect.
2. **Projetos e orçamento (M4):** selecione DEMO-001. Converta “Próximo ciclo de campo” em título, escolhendo um fornecedor DEMO. A provisão deixa de compor o previsto e o título passa a aparecer em Contas, sem dupla contagem. Também é possível criar/cancelar provisão sintética com motivo.
3. **Contas (M3):** filtre pelo projeto para encontrar o título. Simule sua liquidação total ou, em título manual, parcial. O saldo é recalculado e surge uma linha de extrato demonstrativa. Título com pendência documental sintética exige a ação de resolução DEMO; nenhum documento real é recebido. Folhas e lotes exigem a soma exata total.
4. **Folha (M5):** escolha um projeto, crie a folha dos itens pendentes, confira e aprove. A aprovação cria um título em Contas. Simule o pagamento em Folha ou no título correspondente em Contas: ambos os caminhos atualizam o mesmo estado da folha, os itens e o movimento demonstrativo.
5. **Pagamentos de campo (M1):** escolha um projeto, selecione seus itens fictícios pendentes e forme um lote. Simule o pagamento após conferir a soma. O lote aparece em Contas, a liquidação em Conciliação e os totais no dashboard/relatórios. Não há Pix, PDF, chave ou baixa de entrevista no Connect.
6. **Conciliação (M6):** as linhas já foram geradas pelas simulações anteriores. Compare com a origem, escolha classificação e confirme a conciliação local ou registre exceção com motivo. Não há importação de extrato real. Após resolver todas as linhas de um mês, feche o período DEMO; tentativas de nova liquidação nesse mês são bloqueadas. Reabrir exige motivo local.
7. **Relatórios (M7):** ajuste período e projeto para consultar títulos, previsto por vencimento, realizado por data da baixa, resultado por competência, carteira/aging e conciliação. A exportação CSV e a impressão permanecem identificadas como demonstração. Os valores são recalculados a partir do mesmo estado usado nos módulos anteriores.

## Restaurar e recomeçar

No dashboard, use **Restaurar demonstração** e confirme no diálogo do app. Isso repõe as fixtures DEMO e descarta apenas alterações desta demonstração no navegador. Não afeta banco, Connect, arquivos ou outros dados do projeto.

Se o navegador impedir armazenamento local, a demonstração continua em memória e mostra aviso; recarregar pode perder essas alterações. O estado local é validado ao carregar. Um estado incompatível/corrompido é descartado e substituído pelas fixtures.

## O que esta entrega não prova

Login individual/MFA do Financeiro, papéis, auditoria financeira, banco de domínio, conformidade, regras fiscais reais, importação de comprovantes/extratos, integração Connect/Itaú, Pix, migração e prontidão de produção continuam fora. A entrada compartilhada no mockup não substitui esses controles. Regras, orçamento, pessoas, saldos, datas e movimentos são exemplos demonstrativos, não decisões aprovadas nem dados oficiais. O status técnico de Implantação é consultado no servidor e permanece separado dos valores do mockup.
