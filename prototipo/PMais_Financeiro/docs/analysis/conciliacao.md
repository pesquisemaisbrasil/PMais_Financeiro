# Análise — Conciliação bancária (P+ Financeiro)

## Síntese e delimitação

A conciliação bancária é o módulo 6 do roadmap: confronto linha a linha do extrato com baixas, títulos e itens de lançamentos do Financeiro, classificação das transações e fechamento mensal/exportação para a contabilidade. O módulo depende do módulo 3 (contas a pagar/receber, itens e baixas); relatórios e fluxo de caixa dependem também dele. A especificação do módulo está pronta, mas isso não equivale a protótipo validado ou software implementado.

O roadmap antigo descreve um ciclo de protótipo rápido, atualização de specs, construção e uso paralelo ao SGE4B. A solicitação atual, porém, é por software funcional entregue incrementalmente no Manus WebDev gerenciado, com adaptação da stack-alvo para React/Vite/Express/tRPC/Drizzle/MySQL. Essa autorização técnica não autoriza decisões de produto, migração de dados reais, novos papéis, pagamento bancário ou integração bancária simulada. Os números de qualquer prompt de protótipo visual devem ser tratados como fictícios, nunca como dados reais. Preservar login por e-mail/senha, MFA obrigatório e somente papéis `financeiro` e `admin`.

## Requisitos e campos

- **Conta bancária:** empresa, banco (atualmente Itaú), agência, conta, tipo (`corrente`, `aplicação`, `caixa`), saldo inicial, data do saldo inicial e status.
- **Importação:** extrato Itaú em OFX ou CSV, com pré-visualização antes de persistir. API bancária depende de N1; não presumir integração existente.
- **Conciliação:** interface em duas colunas (extrato × lançamentos/itens). Uma transação do lançamento agrupado pode ser conciliada a um item individual: por exemplo, cinco Pix de R$ 200 contra cinco itens de R$ 200 de um lançamento total de R$ 1.000.
- **Sugestões:** valor, data com tolerância de ±3 dias, favorecido e ID de transação; quando aplicável, comparar por item. Sugestão não substitui confirmação humana.
- **Classificação por linha:** tipo entre incentivo, adiantamento, pagamento com NF, RPA, sem NF, reembolso, tarifa, transferência e outro. Com NF, guardar número e data de emissão. Aproveitar classificação/documento fiscal de item quando disponível; o operador preenche o que faltar e não pode inferir tipo apenas pelo valor.
- **Ação por linha:** conciliar com baixa existente; baixar título em aberto; criar lançamento (ex.: tarifa ou rendimento); ou registrar exceção com motivo.
- **Voltas/devoluções:** crédito de Pix devolvido deve casar com a baixa original e gerar devolução no título. Pix de entrevistador deve casar com comprovante previamente conciliado.
- **Visões e fechamento:** diferença extrato × despesas por dia e mês, explicada por voltas, pendências e linhas não conciliadas; saldo mensal por conta e consolidado (inicial + entradas − saídas = final); fechamento mensal por empresa; exportação da conciliação com uma linha por transação e classificação, número/data da NF e lançamento.

## Estados e transições inferidos do spec

A linha importada é imutável e pode permanecer **não conciliada**, ser **conciliada** com uma baixa existente, produzir **baixa** de título aberto, gerar **lançamento** novo, ou ser marcada como **exceção com motivo**. Exceções contam como conciliadas para efeito de fechamento, mas classificação segue obrigatória. Uma conciliação existente só pode ser desfeita com motivo e auditoria. O mês/período passa de **aberto** para **fechado** quando todas as linhas estão conciliadas (incluindo exceções aceitas) e classificadas; fechado bloqueia baixa, estorno e lançamento com data naquele mês. Reabertura exige administrador e motivo, com auditoria recomendável/necessária segundo o controle geral. O spec não define estados detalhados para conta, workflow de revisão de exceção, nem se importações parciais ou reversões têm estados próprios.

## Regras críticas

1. Transação importada é imutável; reimportação idêntica não duplica. Chave de idempotência: conta + ID de transação ou, na ausência deste, data + valor + descrição.
2. Toda baixa pertence a uma conta bancária e sua data é a data em que o dinheiro saiu; saldo é calculado a partir do saldo inicial e baixas conciliadas.
3. Linhas conciliadas a um lançamento agrupado não podem exceder o total; o saldo restante aparece como itens não pagos.
4. Sem classificação não se fecha o mês. Fechamento exige zero linhas pendentes de conciliação ou classificação; exceção aceita conta como conciliada.
5. Desfazer conciliação exige motivo e auditoria.
6. Período fechado bloqueia baixa, estorno e lançamento retroativos para todos; reabrir é exclusivo de `admin`, com motivo.
7. Erros previstos: arquivo inválido (422), excesso no valor do agrupamento (409), pendências/classificação no fechamento (409), lançamento em período fechado (409), reabertura não autorizada (403).
8. Valores monetários devem respeitar regra geral do Financeiro: Decimal, trafegado como string; datas de negócio no fuso de São Paulo.
9. Não se infere natureza fiscal/contábil apenas pelo valor. Nenhuma ação financeira crítica deve ocorrer sem confirmação humana.

## Decisões abertas, tensões e dependências

- **N1 — integração Itaú:** tipo de integração, retorno por pagamento, custos e viabilidade são pesquisa pendente. API do Connect também não foi fornecida/validada. A baixa real deve permanecer bloqueada até validação; não simular integração como se fosse real.
- **Importação e formatos:** a spec pede OFX ou CSV do Itaú, mas não define layout/versões CSV, encoding, fuso/horário, parsing de sinal, estorno, duplicatas ambíguas ou política de correção de arquivo. Validar exemplos reais antes de estabilizar contrato; não preencher lacunas com decisão de produto.
- **Identidade/idempotência:** fallback data + valor + descrição pode colidir para transações legítimas iguais. Definir tratamento de colisão/identificação manual antes de garantir deduplicação sem falso positivo; transação já importada não deve ser sobrescrita.
- **Estados e exceções:** não está definido se exceção exige aprovação, quem pode resolvê-la, nem se “exceção aceita” equivale formalmente a conciliada sem baixa. Exige esclarecimento, não inferência.
- **Fechamento:** regra 6 exige “tudo conciliado”; regra 7 permite exceção como conciliada. Interpretar em conjunto como fechamento permitido para exceção registrada e classificada, mas o significado contábil e os controles dessa exceção permanecem a validar.
- **Saldo e movimentos:** regra do saldo menciona baixas conciliadas, mas o relatório também requer entradas, saídas, tarifas e rendimentos. O tratamento de créditos, saldo inicial, transferências entre contas e lançamentos sem baixa não está completamente especificado.
- **Recorrência e devoluções:** dependência de `baixas-recorrencia-e-anexos` e `comprovantes-e-baixa`; não implementar o caso de volta isoladamente sem contrato de estado/identidade da baixa original.
- **Conciliação de entrevistadores:** a visão geral atribui pessoas/CPF hash/chave Pix e status de entrevistas ao Connect, enquanto o Financeiro é dono de lotes, comprovantes e conciliação. Manter fronteira por API; sem API validada não presumir dados nem acionar baixa no Connect.
- **Multiempresa e permissões:** F8 mantém multiempresa e escopo por empresa como “hoje”, sem lista de CNPJs/unidades ou matriz detalhada. Não criar papéis novos: usar somente `financeiro` e `admin` até decisão explícita.
- **Proteção de períodos:** confirmar timezone e critério operacional do mês contábil. O bloqueio é global para todos; só admin reabre com motivo. Não permitir alteração retroativa silenciosa.

## Recomendação incremental

**Primeira entrega (fundação, fora da implementação funcional do módulo 6):** fundação, identidade visual/design, login e-mail/senha com MFA obrigatório, contas/permissões preservando `financeiro` e `admin`, e auditoria. Implementar a conciliação em fase posterior, após módulos 2 e 3 (cadastros e contas a pagar/receber/baixas), validação do protótipo/regras com financeiro e definição dos pontos abertos relevantes. Até então, não importar dados bancários reais, não fazer migração, não executar baixas reais nem apresentar integração simulada. Antes de habilitar fechamento contábil real, validar formatos de extrato, idempotência, regras de exceção/devolução, fronteira Connect/API e controles de período com responsáveis do produto/financeiro.
