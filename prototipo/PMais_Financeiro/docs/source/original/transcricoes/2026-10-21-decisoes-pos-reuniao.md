# 2026-10-21: Decisões do PO depois da reunião

- **Data:** 21/10/2026, mensagens do PO (João Paulo) depois da reunião com o financeiro.
- **O que é:** as respostas às perguntas que a reunião deixou abertas. Não é fala bruta; é o registro das decisões, para os specs apontarem para cá.

## Decisões

| # | Assunto | Decisão |
|---|---|---|
| D1 | Orçamento: quem altera | Só **supervisor autorizado pelo administrador** (permissão que já existe no Connect). Toda mudança **aparece no Financeiro**. |
| D2 | Orçamento: o que é um item | Uma linha de custo do projeto, como **pagamento a fornecedores** e **incentivos**. O orçamento é a soma dos itens. |
| D3 | Estourar o orçamento | **Algum administrador** autoriza, e a autorização **fica registrada em log** (quem, quando, valor, motivo). |
| D4 | Projeto | **Fica no Connect.** O supervisor administra o projeto inteiro lá. O Financeiro não tem projeto próprio, só a visão financeira dele. O **pedido de aumento de limite registrado** no Connect fica para depois: não é necessário agora. |
| D5 | Consumo do orçamento | O **supervisor vê no Connect** quanto já foi gasto dos itens que não são entrevista (fornecedor, incentivos). O Financeiro fornece esse número. |
| D6 | NF ou RPA | A pessoa **escolhe no cadastro do Connect**. |
| D7 | Dados do RPA | **Basta CPF e PIS/NIT**, além de nome e endereço (que o Connect já tem). O desconto, a retenção e os impostos a contabilidade calcula. |
| D8 | Onde fica a NF do entrevistador | O **Connect** guarda, **agrupada por projeto**, por **6 meses**. O financeiro baixa por lá e leva para a **rede da empresa**, onde a nota fica 5 anos. O Financeiro **não guarda o arquivo**: recebe só o status "recebida / pendente". Sem NF, não recebe. |
| D9 | Prazo de pagamento | O **supervisor define** o prazo de cada projeto e ele **vale para todas as equipes**. As regras por área (15 dias, 2 vezes por mês, 10 dias) viram orientação para o supervisor, não regra do sistema. |
| D10 | Contrato por projeto (ZapSign) | Já planejado, **só do Connect**. Sem contrato assinado o supervisor não lança entrevistas. Não passa pela integração. |
| D11 | Pagar direto pelo Itaú | **Anotado para pesquisar.** É assunto só do Financeiro; o Connect não participa. |
| D13 | Orçamento: o que se informa | Ao passar o orçamento, cada item vem com **item, valor e data estimada de pagamento**. A data estimada alimenta a provisão. |
| D12 | Escopo do Financeiro | **Sem ordem de módulos ainda.** A base antiga (SGE4B) deve ser **pedida ao fornecedor**. |

## Pontos ainda abertos que isto levanta

- **CPF inteiro para o RPA** vai contra "CPF só como hash" (ADR 0003 do Connect). Decisão do DPO (Q15).
- O prazo de **6 meses** vale também para as notas de **fornecedores**? Hoje o spec diz 5 anos no cofre (Q17).
- O **formato do prazo** de pagamento: dias depois do lançamento (como é no Connect) ou depois do fim do projeto (F4, resolvida só em quem decide).
- O **ciclo de vida do projeto** (`proposta` a `fechado`) e a aprovação do orçamento descritos em [projetos-financeiros](../specs/projetos-financeiros.md) precisam ser revistos à luz de D4 (Q16).
