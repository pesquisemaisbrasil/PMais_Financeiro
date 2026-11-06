# Pauta para o João: datas do Connect e decisões abertas

**Posição em 06/11/2026.** É o PF-58: o que precisa de uma resposta do João para destravar o módulo de comprovantes e o que vem depois. Fica sem custo para ele responder: cada item diz o que o sistema faz hoje (se ninguém responder, é isso que vale), a proposta e o que ela destrava. Os textos completos das perguntas estão em [perguntas-abertas](perguntas-abertas.md).

## 1. Datas e responsáveis das entregas do Connect

O time do Connect preenche **data** e **responsável** de cada entrega em [entregas-do-connect](../specs/entregas-do-connect.md). Sem as entregas 1 e 2, o Financeiro mostra contas e lê comprovantes, mas **não paga de verdade**.

| # | Entrega | Prioridade | O que trava sem ela |
|---|---|---|---|
| 1 | Dados de pagamento e busca por chave Pix (`payment-data`, `pix-key-matches`) | Caminho crítico | Planilha de pagamento ao banco; achar a pessoa pelo comprovante em produção (hoje responde 503) |
| 2 | Baixa (`POST /payments`) com chave de idempotência | Caminho crítico | "Confirmar baixa" de verdade; hoje só funciona com o Connect simulado |
| 3 e 4 | Eventos assinados e feed `GET /events` | Junto, logo depois | Saber na hora o que mudou e conferir o dia |
| 5 | Modelo fiscal (NF ou RPA) e status da NF | Pode vir depois do primeiro pagamento | "NF pendente" e o líquido do RPA vindos do Connect |
| 6 | `FINANCE_EXTERNAL_ENABLED` | Antes de produção | Evitar o mesmo Pix baixado nos dois sistemas |
| 7 | Exemplos JSON em `contract/v1/` | Com a 1 | Testar o Financeiro contra o mesmo contrato |
| 8 | Cancelamento de baixa | Só depois da Q4 | — |

## 2. Decisões do João

| # | Pergunta | Hoje (vale se ninguém responder) | Proposta | Destrava |
|---|---|---|---|---|
| Q4 | Cancelar baixa existe? Com dupla aprovação? | Não existe | Manter fora até haver uso real; se vier, com dupla aprovação | Entrega 8 do Connect |
| Q18 | O que substitui o MinIO no armazenamento de arquivos (o projeto foi arquivado e as imagens oficiais saíram do ar)? | Compose usa o build da Chainguard fixo por digest ([ADR 0010](../architecture/adr/0010-minio-pelo-build-da-chainguard.md)) | Escolher o substituto antes de ir para produção | Anexos do Contas a pagar e do Contas a receber; Q19 |
| Q19 | O PDF de comprovantes fica guardado no lançamento? O kickoff pede, as regras do projeto dizem que é descartado | Descartado; sem anexos no Contas a pagar | Manter descartado até o DPO responder; se guardar, definir cofre e prazo (depende da Q18) | Anexos em Contas a pagar |
| Q20 | A baixa manual pede reautenticação para quem entra por Google ou Microsoft? | Não pede; só quem tem autenticador digita o código | Decidir antes de produção. Mais seguro: pedir sempre | Regra de MFA da baixa |
| Q22 e Q23 | Guardar chave Pix do respondente e CPF/chave do fornecedor pessoa física? | Não guarda: só nome e valor; fornecedor só com CNPJ | Manter assim até o DPO responder | Importação de planilha com chave; fornecedor pessoa física |
| — | **Regra do bloqueio de login** (PF-53): 10 falhas por hora no mesmo e-mail travam até a senha certa, então qualquer pessoa trava a conta de outra só sabendo o e-mail | Vale a regra atual | Contar falhas por e-mail **e** rede juntos. Muda a regra 9 de [acesso-e-auditoria](../specs/acesso-e-auditoria.md) | PF-53 |
| — | **Teste do SSO Microsoft** com a conta da empresa e verificação em duas etapas obrigatória nas contas (PF-50 e PF-51) | Google funciona; Microsoft configurada, sem teste | O João faz o login de teste com o autenticador dele | Fecha o login para produção |

## 3. Com outras pessoas (não com o João)

| # | Pergunta | Quem | Hoje |
|---|---|---|---|
| Q26 | Prazo de guarda de tentativas de login e sessões | DPO | Sem limite. Proposta: 6 meses (Marco Civil, art. 15) e 30 dias depois de a sessão expirar |
| Q21, Q24, Q25 | Provisão em Hoje e Vencidos; ordem das datas do lançamento; fornecedor com nome parecido | Vivi | Provisão conta; datas livres; só o mesmo CNPJ é barrado |
| Q27 | Existe receita sem projeto? | Vivi | Projeto obrigatório |
| Q28 | Aviso de inadimplência ao comercial: depois de quantos dias? | Vivi e comercial | Sem aviso: só lista por cliente |

## Como fechar o PF-58

Pronto quando cada entrega do Connect tem data e responsável, e cada pergunta da seção 2 tem resposta ou uma nova data para responder. A resposta entra no spec dono, vira transcrição em `docs/transcricoes/` e sai de [perguntas-abertas](perguntas-abertas.md).
