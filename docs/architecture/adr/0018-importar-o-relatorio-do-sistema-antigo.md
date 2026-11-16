# ADR 0018: Importar o relatório do sistema antigo: uma conta por linha, chave por linha e CPF retirado do texto

**Status:** Aceito, provisório (a confirmar com a Vivi e o DPO: Q49)
**Data:** 16/11/2026

## Contexto

O financeiro tem as contas a pagar no SGE4B e quer trazê-las para o Financeiro sem digitar de novo. A exportação completa das 11 bases ainda não foi pedida ao fornecedor (a migração ficou para depois, ver [cadastros-e-dimensoes](../../specs/cadastros-e-dimensoes.md)), então o caminho de hoje é o relatório **"Lançamentos a Pagar"**, que o próprio sistema antigo exporta.

O arquivo real, visto em 16/11/2026, tem características que decidem o desenho:

- é uma **tabela HTML com a extensão `.xls`** (UTF-8 com BOM), e não um Excel de verdade; os valores são **texto em português** (`1.234,56`, `03/11/2026`);
- tem 15 colunas, mas **não traz Vencimento nem Forma de pagamento**; a Programação é a única data da conta;
- a descrição tem quebras de linha, a **linha digitável do boleto** e, em 6 de 100 linhas, a chave Pix escrita como **"PIX CPF ..."**;
- as linhas pagas trazem a conta bancária e o R$ Pago; as pendentes vêm sem conta.

## Decisão

- **Uma conta por linha**, com a origem `relatorio` (etiqueta "Importado de relatório", aba e grupo próprios). A linha paga (R$ Pago maior que zero) cria também a **baixa**, com a data de Pagamento, o valor e a conta bancária da empresa da linha; a opção "Registrar a baixa das contas pagas" pode ser desligada. O que vale é o número, não o texto da Situação.
- **Leitor próprio, sem dependência nova:** o `.xls` em HTML é lido com o `html.parser` da biblioteca padrão (não busca nada na rede e não expande entidade externa; funciona também na demonstração no navegador, [ADR 0017](0017-demonstracao-com-o-backend-no-navegador.md)); o `.xlsx` pelo `openpyxl`, como as outras importações, e o `.csv`. O `.xls` no formato antigo do Excel (binário) é **recusado com a instrução** de salvar como `.xlsx` ou `.csv`: ler esse formato pediria uma biblioteca nova para um arquivo que o sistema antigo não exporta.
- **O cabeçalho é achado**, nas 30 primeiras linhas, pelos nomes das colunas (Programação, Fornecedor e R$ Líquido são obrigatórios); o título de cima é ignorado.
- **Repetir é seguro:** cada linha ganha uma **chave** (HMAC com a chave permanente de hash, a mesma do extrato) feita dos campos que a identificam, mais o número da repetição dentro do arquivo (duas linhas iguais são duas contas). A coluna `payables.importKey` tem **índice único**, então reenviar o arquivo, ou um relatório mais novo, só cria o que faltava, e dois envios ao mesmo tempo não criam a mesma conta. O Pagamento, o R$ Pago e a Situação **ficam fora da chave**, para a linha continuar sendo a mesma depois de paga. Conta já importada **não é atualizada**.
- **CPF nunca é guardado, e não barra a linha:** em qualquer coluna de texto, o número que fecha a conta do CPF é **trocado por "(CPF retirado)"** antes de qualquer coisa ser gravada, a conta entra e a prévia avisa em cada linha. Isso vale também para a chave da linha, que é calculada com o texto já limpo. Barrar a linha, como o texto de notas faz, obrigaria a Vivi a editar o arquivo à mão em 6% das linhas do relatório real.
- **A linha digitável do boleto** (de banco ou de concessionária) sai da descrição e vai para `payables.barcode`. Isso acontece **antes** de procurar CPF, porque um bloco da linha de concessionária pode, por acaso, fechar a conta de um CPF.
- **Nome que não existe nos cadastros:** o fornecedor entra só com o **nome** e o projeto fica **em branco**, para completar depois; plano de contas, centro de custo, unidade, forma de pagamento e conta bancária usam o **padrão marcado na tela**, e sem padrão a linha fica de fora, com o motivo. A empresa vem da unidade.
- **Prévia antes de gravar, tudo ou nada**, mês fechado respeitado, e o **arquivo não fica guardado** (só o hash, em `payables.importHash`, e a linha de cada conta no histórico).

## Consequências

- **Dado pessoal:** o inventário de dados, o ROPA (FIN-I2) e o README de segurança foram atualizados no mesmo conjunto de mudanças. A migration `d5f7b9e1a3c4` cria `importKey` e o índice único.
- O relatório real é **dado real**: fica só na máquina de quem importa. A pasta `docs/Excel/` e os arquivos `*.xls` estão no `.gitignore`, e os testes usam arquivos gerados no código.
- A Programação vira o vencimento (o relatório não tem outro); isso, a coluna Documento e as situações que existem além de PENDENTE e PAGO estão na Q49.
- `shortcut`: o CPF retirado leva junto a chave Pix, que passa a ser buscada onde o fornecedor estiver cadastrado; se a equipe precisar da chave no histórico, a decisão é do DPO (Q49 f). Uma linha mudada no sistema antigo (valor ou texto) vira outra chave e entra como conta nova: para o saldo, a conta antiga precisa ser cancelada à mão.
- Alternativas descartadas: ler o `.xls` binário com `xlrd` (dependência nova sem necessidade); guardar o arquivo para reprocessar (mais dado pessoal e sem ganho, já que as contas ficam); barrar a linha que tem CPF; atualizar a conta já importada quando o relatório mais novo a traz paga (apagaria a história da conta, e a baixa se dá na própria conta).
