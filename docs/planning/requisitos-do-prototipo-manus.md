# O que o protótipo Manus acrescenta como requisito (PF-18, parte 3)

**Origem:** leitura dos docs 07 a 10 do protótipo (`prototipo/PMais_Financeiro/docs`: API, cadastros e campos, regras de negócio e fluxos), comparada com os specs em [docs/specs/](../specs/README.md). **Data:** 05/11/2026.

**Como ler:** o protótipo guarda tudo no navegador (`localStorage`), com dados sintéticos e rótulo "DEMO". Os docs dele dizem que as regras "não são política contábil, fiscal, bancária ou Connect". Por isso ele é **referência de telas e de ciclo de vida**, não fonte de regra: o que vale é o que o financeiro decidiu nos specs. Aqui está só o que o protótipo traz e **não achei** nos specs, mais o que **não deve ser copiado**. "Não achei" quer dizer que procurei por palavra-chave nos specs, não que li todos linha a linha.

## 1. Candidatos a requisito (decidir antes de construir)

| # | O que o protótipo faz | Situação nos specs | Proposta |
|---|---|---|---|
| 1 | **Período fechado bloqueia o que tem data nele**: lançar, baixar, converter provisão, cancelar. Cadastros e itens sem data não consultam o período | Os specs falam de "fechamento do mês", mas as regras de bloqueio não estão escritas por operação | Escrever no spec de bancos-e-conciliacao quais operações o fechamento bloqueia. Vale para o módulo 6 |
| 2 | **Fechar o mês exige tudo conciliado ou tratado como exceção**; reabrir exige motivo | Fechamento existe; o motivo da reabertura não achei | Reabrir pede motivo e o motivo **é gravado** (o protótipo pede e descarta, é um defeito dele) |
| 3 | **Faixas de vencimento** em 5 grupos: vencido há mais de 30 dias, vencido de 1 a 30, vence em 0 a 7, em 8 a 30 e depois de 30, separando pagar e receber | Não achei em relatorios-e-analises (só "faixa" de alerta no orçamento) | Acrescentar ao spec de relatórios |
| 4 | **Ordem das datas** emissão ≤ competência ≤ vencimento: o protótipo não valida e marca "a confirmar" | O sistema também não valida hoje | **Pergunta aberta** ao financeiro: validar, avisar ou deixar livre? |
| 5 | **Nome de fornecedor repetido**: o protótipo não bloqueia | Só o CNPJ ativo é único. Nome parecido pode duplicar | Avisar ao cadastrar ("já existe fornecedor com nome parecido"), sem bloquear. Pergunta ao financeiro |
| 6 | **Projeto fechado não aceita** novo lançamento, provisão ou folha. No protótipo, o orçamento do projeto fechado ainda podia ser alterado, o que ele mesmo marca como discrepância | Ciclo de vida do projeto está em projetos-financeiros; a regra de orçamento em projeto fechado não achei | Confirmar no spec: projeto fechado não recebe valor novo, nem orçamento |
| 7 | **Baixa parcial só em lançamento manual e provisão**; folha e entrevistadores exigem saldo integral e soma exata | Coerente com a regra de "valor exato" e com "Baixa parcial do lançamento" já na tela | Conferir se a folha de campo (módulo 5) fica com baixa integral. Já é a regra de dinheiro do projeto |
| 8 | **Cancelar folha só se estiver aberta**, devolvendo os itens como pendentes. O protótipo não guarda histórico do cancelamento | Folha de campo está no módulo 5 | Cancelar grava histórico (já é padrão do projeto, com a auditoria dos lançamentos) |

## 2. Já coberto, nada a fazer

- Dinheiro em centavos inteiros e `Decimal`, datas civis no fuso de São Paulo.
- Provisão que vira lançamento real e cancelamento com motivo.
- CSV com proteção contra fórmula.
- Orçamento por projeto com previsto, comprometido e realizado, com alertas de 80% e 100%.
- Folha de campo com itens e total exato, e conciliação ligada à baixa.
- Inativar em vez de apagar o cadastro que já tem histórico.

## 3. Não copiar

- **Nota fiscal bloqueando a baixa** (o protótipo trava a baixa até o documento ser "resolvido"). Foi **superado** pela decisão de 28/10: a NF não bloqueia mais o pagamento (PF-36).
- Login demo e sessão em memória, sem papéis, sem dono do registro e sem auditoria. O sistema real tem login com MFA, papéis e auditoria.
- Dados e rótulos "DEMO", e persistência no navegador.
- Qualquer coisa de banco, Pix ou Itaú: o protótipo não tem nada disso.

## 4. O que fica para decidir

Os itens **4 e 5** são decisão de produto, para o financeiro (Vivi, com a Bruna e a Camila na validação do PF-7). Os itens 1, 2, 3 e 6 viram texto de spec quando o módulo correspondente entrar. O item 7 e o 8 só confirmam regras que o projeto já segue.
