# Visão, escopo e decisões

O que o sistema Financeiro faz, o que continua no P+ Connect e as decisões já tomadas. Leia antes de escrever qualquer linha de código: quase todo erro de desenho vem de puxar para o Financeiro algo que é do Connect, ou o contrário.

## O que é

O **P+ Connect** gerencia os entrevistadores de campo da Pesquise+: cadastro, recrutamento, treinamentos, projetos, lançamento das entrevistas feitas e o que cada pessoa tem a receber.

O **Financeiro** é um sistema **separado**, que cuida de pagar essas pessoas e provar que foram pagas:

- o que pagar, para quem, quando;
- planilha de pagamento para o banco;
- leitura dos comprovantes Pix (PDF do Itaú/Sispag);
- conciliação: o comprovante confere com o que estava a pagar;
- baixa: devolve ao Connect "estas entrevistas foram pagas";
- relatórios e auditoria financeira.

Hoje parte disso já roda **dentro** do Connect: a tela `/financeiro`, a planilha de pagamentos e a baixa por comprovante. Esse código é a referência do novo sistema (ver [08-dominio-e-codigo-atual.md](08-dominio-e-codigo-atual.md)). Na migração, o Connect deixa de fazer a conciliação e passa a só **receber** a baixa pela API.

## Quem usa

| Papel | No Financeiro |
|---|---|
| **Financeiro** (equipe de pagamento) | Vê o que pagar, baixa a planilha, envia comprovantes, confirma baixas, acompanha divergências. É o usuário principal. |
| **Admin** | Tudo, mais usuários, contas de serviço e auditoria. |
| **Supervisor** | Continua vendo os pagamentos dos projetos dele e exportando pelo **Connect**, como hoje (decisão do PO). Acesso ao Financeiro: [perguntas em aberto](#perguntas-em-aberto). |
| **Entrevistador** | Não entra no Financeiro. Vê "Pago em dd/mm" no próprio Connect. |

## Fronteira: quem é dono de quê

| Dado | Dono (fonte da verdade) | O outro sistema… |
|---|---|---|
| Pessoas, cadastro, CPF (hash), chave Pix (cifrada) | **Connect** | Financeiro **não copia**. Busca a chave Pix na hora de pagar, por rota com escopo próprio e auditada. |
| Projetos, valor por entrevista, prazo de pagamento, orçamento | **Connect** | Financeiro lê pela API. |
| Entrevistas lançadas (o que é devido) | **Connect** | Financeiro guarda só um **espelho mínimo por id** (id, pessoa, projeto, valor, data prevista) para conciliar e fazer relatórios. |
| Status "pago" da entrevista | **Connect** (campo da entrevista) | Financeiro **pede** a baixa pela API, com chave de idempotência. Quem grava é o Connect. |
| Lotes de comprovantes, comprovantes, conciliação, divergências | **Financeiro** | Connect não vê o detalhe; recebe só o resultado (baixa). |
| Planilhas exportadas, logs de exportação | **Financeiro** | — |
| Arquivos (comprovante, se um dia for guardado) | **Financeiro**, no cofre cifrado | — |

**Regra de ouro:** o Financeiro nunca escreve nem lê o banco do Connect. Tudo passa pela API ([07-integracao-com-o-connect.md](07-integracao-com-o-connect.md)).

## Decisões já tomadas

Não reabrir sem nova decisão do PO (João). Cada uma tem origem rastreável.

| # | Decisão | Origem |
|---|---|---|
| 1 | **Sistema separado**: repositório, deploy e banco próprios. | PO, out/2026 |
| 2 | **Banco separado**: outro database Postgres com usuário próprio e privilégio mínimo. Pode ser o mesmo servidor em dev; em produção, de preferência servidor separado. | PO, 20/10/2026 |
| 3 | **Integração só por API**, com conta de serviço (`client_credentials`), escopos mínimos e eventos assinados (HMAC). | PO, 20/10/2026 + `docs/architecture/integracao-entre-sistemas.md` |
| 4 | **Chave Pix não é copiada** para o Financeiro: é buscada sob demanda, e cada busca fica na auditoria. | PO, 20/10/2026 |
| 5 | **Mesmos padrões do Connect**: stack, camadas, banco, UI, segurança, testes, processo (skills e revisores). | PO, 20/10/2026 |
| 6 | **O comprovante dá baixa, não cria entrevista.** O supervisor lança no Connect; o comprovante prova o pagamento. | ADR 0001 |
| 7 | **Valor exato**: o Pix é igual à soma das entrevistas. Se não fecha, é divergência e vai para revisão humana. | Reunião 09/10/2026 |
| 8 | **Orçamento é teto duro** e cobre só entrevistas. Quem controla é o Connect. | ADR 0006 |
| 9 | **Nada é pago sem confirmação humana** ("Confirmar baixa"). | Plano dos comprovantes |
| 10 | **PDF do comprovante não é guardado** hoje. Se o novo sistema passar a guardar, só no cofre cifrado e depois de o DPO definir a retenção. | ADR 0002 |
| 11 | **Quem recebeu sem estar no projeto** gera alerta e aviso à equipe; nunca é pago automaticamente. | Reunião 09/10/2026 |
| 12 | **Chave Pix mascarada** em toda tela; completa só na planilha de pagamento, que é auditada. | Reunião 09/10/2026 |
| 13 | **CPF nunca aparece**: só existe como hash. A planilha não tem CPF. | Reunião 09/10/2026, ADR 0003 |
| 14 | **Arquivos no MinIO**, em bucket e usuário próprios, com criptografia em duas camadas (servidor + envelope no backend). | PO, 20/10/2026 |
| 15 | **Casamento da chave Pix é feito pelo Connect** (rota `pix-key-matches`): o Financeiro manda a chave lida no comprovante e recebe de quem é. Nenhum segredo de hash é compartilhado entre os sistemas. | Técnico, 20/10/2026 (validar com o PO) |

## Fora do escopo (por enquanto)

- Pagar direto pelo banco (API Pix ou Open Finance). Hoje o pagamento é feito no internet banking com a planilha.
- Nota fiscal ou RPA do entrevistador.
- Folha, impostos, outros custos do projeto (o orçamento cobre só entrevistas).
- App mobile.

## Perguntas em aberto

Não decida sozinho. Registre em `docs/planning/perguntas-abertas.md` do novo repositório e implemente o comportamento "hoje" da tabela.

| Pergunta | Quem decide | Comportamento até decidir |
|---|---|---|
| Supervisor acessa o Financeiro (por exemplo, para ver os arquivos)? | Vivi | Não acessa. Vê pagamentos e exporta pelo Connect. |
| Entrevistador vê ou baixa o próprio comprovante? | Vivi + jurídico | Não. Vê só "Pago em dd/mm". |
| Retenção dos dados de comprovantes e logs | DPO | Nada é apagado automaticamente; o PDF não é guardado. |
| Login único entre Connect e Financeiro | PO | Contas separadas. Desenhar pensando em OIDC depois. |
| Outros bancos além do Itaú | PO | Só o parser do Itaú/Sispag; o parser fica atrás de uma interface para trocar. |

## Checklist

- [ ] Nenhuma tabela do Financeiro duplica pessoas, projetos ou chave Pix do Connect.
- [ ] Nenhuma conexão do Financeiro aponta para o banco do Connect.
- [ ] Toda baixa é pedida ao Connect pela API, com chave de idempotência.
- [ ] As 15 decisões acima estão refletidas no spec do novo repositório.
- [ ] As perguntas em aberto estão em `perguntas-abertas.md` com o comportamento atual.
