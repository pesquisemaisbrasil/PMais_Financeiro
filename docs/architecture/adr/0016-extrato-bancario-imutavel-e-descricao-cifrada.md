# ADR 0016: Extrato bancário importado: linhas imutáveis, descrição cifrada e reimportação sem duplicar

**Status:** Aceito, provisório (a confirmar com a Vivi e o DPO: Q44)
**Data:** 12/11/2026

## Contexto

A conferência bancária (PF-61) parte do extrato do Itaú: o financeiro exporta um arquivo (OFX ou CSV), importa no sistema e depois concilia cada linha com as contas a pagar. A PF-69 é só a primeira etapa: **cadastrar a conta bancária e importar o extrato**. A spec pede que a transação importada seja **imutável** e que **reimportar o mesmo extrato não duplique** ([bancos-e-conciliacao](../../specs/bancos-e-conciliacao.md), regra 1).

Duas coisas não estavam decididas:

- a linha de Pix do extrato traz **o nome de quem pagou ou recebeu** (dado pessoal), e o sistema nunca teve um lugar para guardar isso fora dos comprovantes;
- não temos um arquivo de exemplo do Itaú: o OFX tem formato padrão, mas o layout do CSV é desconhecido (Q44).

## Decisão

- **Duas tabelas:** `bank_statements` (uma importação: conta, nome e hash do arquivo, formato, período, quantas linhas entraram e quantas já estavam, quem importou) e `bank_transactions` (a linha: data, valor com sinal, descrição, ID do banco e chave de repetição). **O arquivo não fica guardado**, só o nome e o hash.
- **Imutável:** não há rota para alterar nem apagar uma linha (só `GET` e `POST`, e um teste confere isso nas rotas), as chaves estrangeiras são `RESTRICT` e a role da app perde `UPDATE` e `DELETE` nas duas tabelas (a mesma regra que as baixas e o histórico já têm). Conta bancária com extrato **não se exclui**, só se inativa.
- **Descrição cifrada** com `encrypt_payload` (AES-GCM, a mesma chave das outras colunas cifradas), amarrada à conta e à chave da linha: copiada para outra linha, não abre. O histórico da conta diz só "Importou extrato: N linhas novas e M repetidas (período)", nunca o texto das linhas, e nada disso vai para o log.
- **Reimportar não duplica:** a chave da linha é o **ID que o banco dá** (FITID do OFX) ou, sem ele, **data + valor + descrição**. Dois lançamentos iguais no mesmo arquivo (dois Pix de R$ 200 no mesmo dia para a mesma pessoa) contam a **repetição**, então são duas linhas, e o mesmo arquivo gera as mesmas chaves. A unicidade (conta, chave) é do banco, e um envio simultâneo é segurado com a conta travada e, no limite, devolve 409.
- **Prévia antes de gravar:** a tela mostra linhas novas, linhas que já estavam, período, entradas e saídas novas e as 10 primeiras linhas. Avisa se o arquivo parece ser de **outra conta** (compara só os dígitos) e se **o mesmo arquivo já foi importado**.
- **Leitor próprio, sem dependência nova:** o OFX é lido por expressão regular (sem parser de XML, então não há entidade externa para abrir) e o CSV acha o cabeçalho pelos nomes das colunas (data, lançamento ou histórico, valor, ou crédito e débito), com valores como `1.234,56`, `-50,00` e `(50,00)`. O formato vem do **conteúdo**, não do nome do arquivo. Limites: 5 MB e 20.000 linhas. Arquivo que não dá para ler responde 422: "Não foi possível ler o extrato — envie OFX ou CSV do banco".

## Consequências

- **Dado pessoal novo:** o inventário e o ROPA ganharam a conta bancária da empresa e as linhas do extrato. O **prazo de guarda é do DPO** (Q44); até lá nada apaga.
- O **CSV do Itaú é uma estimativa** até alguém mandar um arquivo de exemplo (com dados trocados): a pergunta está na Q44.
- `shortcut`: sem ID do banco, dois extratos que se sobrepõem podem contar a repetição de forma diferente quando um deles começa no meio de um dia. Com OFX (que traz o ID) isso não acontece. Evoluir para uma chave melhor se o CSV virar o caminho principal.
- A etapa seguinte (conciliar cada linha com a conta a pagar, classificar, fechar o mês) usa estas tabelas sem mudar o que foi importado: a conciliação será uma tabela à parte, ligada à linha.
- Alternativas descartadas: guardar o **arquivo** do extrato (mais dado pessoal e sem necessidade, já que as linhas ficam); guardar a descrição **em claro** (o nome de quem recebeu não precisa ficar legível no banco); usar **`ofxparse`** ou parser de XML (dependência nova e superfície de ataque sem ganho, já que o formato do que precisamos é simples).
