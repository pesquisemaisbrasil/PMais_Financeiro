# Próximos passos

**Posição em 05/11/2026**, ao fim da primeira semana de construção. Todo o trabalho está na `homolog`, sem push. A fonte do que está aberto é o Jira (projeto PF); este documento explica a ordem e o porquê. Decisões de produto continuam em [perguntas-abertas](perguntas-abertas.md).

## Onde estamos

| Área | Estado |
|---|---|
| Login por senha com MFA, Google e Microsoft | Entregue. Google funcionando; Microsoft configurada, falta o João liberar o teste (autenticador dele) |
| Identificador fixo do SSO (PF-49) | Entregue |
| Inventário de dados e ROPA do login (PF-55) | Escritos; falta o DPO definir o prazo de guarda (Q26) |
| Corpo grande em `/auth` (PF-52) | **Entregue** em 06/11/2026: FastAPI 0.162.0 e Starlette 1.10.0 ([ADR 0011](../architecture/adr/0011-fastapi-e-starlette-novos-fora-da-versao-do-connect.md)), `pip-audit` sem exceções; o `pypdf` também subiu (7 avisos). Falta avisar o Connect e rodar a simulação de CI em Linux antes do push |
| Pedidos simultâneos de login em Postgres (PF-54) | Teste escrito e provado localmente (falha sem o `FOR UPDATE`); falta rodar no CI, que passa a ter o passo novo em `tests.yml` |
| Início e Contas a pagar | Entregue: lista, filtros, importar planilha, detalhes por pessoa, menu lateral em 4 seções e recorrência (PF-57) |
| Comprovantes e baixa (PF-56) | **Entregue** com o Connect simulado ([spec](../specs/comprovantes-e-baixa.md), [como testar](roadmap.md)) |
| Cadastros | Entregue |

## O que depende de outra pessoa

Nada disto anda sem uma resposta. A ordem é a de quem destrava mais coisa.

| # | O que | Quem | Destrava | Jira |
|---|---|---|---|---|
| 1 | **Datas e responsáveis das entregas 1 a 8 da API do Connect** ([entregas-do-connect](../specs/entregas-do-connect.md)). A pauta pronta para levar ao João está em [pauta-para-o-joao](pauta-para-o-joao.md) | João e o dev do Connect | A baixa de verdade, a planilha de pagamento, a sincronização do espelho | PF-58, PF-6 |
| 2 | Q4 (cancelar baixa), Q18 a Q25 | João, DPO, financeiro | Cancelamento de baixa, onde guardar arquivos, regras de data e fornecedor | PF-58 |
| 3 | **Q19 e Q5**: guardar ou não o PDF de comprovantes, e por quanto tempo | DPO | Hoje o PDF é só lido e descartado; se mudar, entra o armazenamento no MinIO | — |
| 4 | **Q20**: a baixa exige reautenticação para quem entra por SSO? | João | Fecha a regra de MFA da confirmação | — |
| 5 | **Q26**: prazo de guarda de `login_events` e `refresh_tokens` | DPO | Escrever a rotina de limpeza e fechar o PF-55 | PF-55 |
| 6 | **Regra do bloqueio de login** (10 falhas por hora por e-mail deixa qualquer um travar a conta de outra pessoa) | João e Vivi | PF-53 e PF-54 (teste de concorrência no CI) | PF-53, PF-54 |
| 7 | Teste do SSO Microsoft com a conta da empresa e a verificação em duas etapas obrigatória nas contas | João (autenticador) | Fecha o login para produção | PF-50, PF-51 |

## O que dá para fazer sem esperar ninguém

Em ordem sugerida:

1. **Enviar a `homolog`.** A simulação de CI em containers Linux (Python 3.11, Postgres 16 com as migrations, build do front e E2E) e a auditoria de segredos passaram em 06/11/2026. Falta só a **revisão de `.github/workflows/tests.yml`** (só ganhou a `PIX_SECRET_KEY` de teste) e o seu pedido de push. O PR `homolog` → `main` só com o João pedindo ou autorizando.
2. ~~**PF-57: recorrência em Contas a pagar**~~ entregue em 06/11/2026 ([baixas-recorrencia-e-anexos](../specs/baixas-recorrencia-e-anexos.md)).
3. **Fechar as pontas do PF-56 que não dependem do Connect:**
   - ~~**Despachante em segundo plano**~~, ~~**sino de avisos**~~ e ~~**tela de Divergências**~~ entregues em 06/11/2026 (`PAYMENT_DISPATCH_SECONDS` liga o despachante).
   - ~~**Baixa por pessoa dentro do lançamento**~~ entregue em 06/11/2026.
4. **Cliente HTTP do Connect:** a parte de leitura (token, projetos, itens a pagar, entrevistadores) está feita e testada contra respostas no formato do Connect; falta **ligar numa conta de serviço real** (`CONNECT_BASE_URL`, `CONNECT_CLIENT_ID`, `CONNECT_CLIENT_SECRET`) e conferir contra o Connect no ar. Faltam as chamadas `pix-key-matches` e `payments`, que dependem das entregas 1 e 2 do Connect.
5. **Planilha de pagamento ao banco** ([pagamentos-a-pagar](../specs/pagamentos-a-pagar.md)): depende da entrega 1 do Connect (`payment-data`), com cada acesso à chave completa auditado.
6. **Contas a receber** ([contas-a-receber](../specs/contas-a-receber.md)): a **fatia 1** foi entregue em 06/11/2026 (cliente, título, recebimento parcial e estorno, filtros, inadimplência). **Fatia 2**, entregue também em 06/11/2026: parcelamento e recorrência da receita (a série do PF-57) e exportação em CSV; recebimento em lote não foi feito, porque a spec não pede (fica como pedido da Vivi). **Fatia 3:** as **faixas de vencimento** da inadimplência foram entregues em 06/11/2026 (1 a 30, 31 a 60, 61 a 90 e mais de 90 dias, limites a validar com a Vivi); faltam os anexos da nota (depende da Q18) e a receita da ficha do projeto (depende do módulo de projetos). Depois, Notas e RPA e Conferência bancária (hoje "Em breve" no menu) e os Relatórios.
7. **Débitos pequenos:**
   - ~~corrigir o handoff/07 §7~~ feito em 06/11/2026;
   - ~~cache `.next` separado para o E2E~~ feito em 06/11/2026 (`NEXT_DIST_DIR`);
   - ~~subir o FastAPI~~ feito em 06/11/2026 (PF-52); falta combinar com o time do Connect, que segue na 0.118.3;
   - ~~quadro do PF-1~~ arrumado em 06/11/2026: PF-20 a 23, 30 a 32 em Feito; PF-25 a 28 fechadas **sem execução** (escopo reduzido do PF-18) e PF-34/35 também **sem execução** (reunião das 11 bases e pedido de exportação ao fornecedor do SGE4B: a migração fica para mais adiante, e o pedido sai junto com ela); cada uma tem comentário dizendo isso. PF-19 e o épico PF-1 fechados;
   - épicos novos no Jira: PF-59 (Contas a receber, fatias 1 e 2 em Feito, fatia 3 em PF-65), PF-60 (Notas e RPA), PF-61 (Conferência bancária) e PF-62 (Relatórios e fluxo de caixa).

## Calendário

| Quando | O quê |
|---|---|
| Segunda 09/11 | Iniciar a **Sprint 2** no Jira (o João já deve ter as perguntas do PF-58) |
| Antes do push | Simulação de CI, auditoria de segredos e revisão do `.github/` |
| Quando o Connect entregar 1 e 2 | Cliente HTTP real, primeira baixa de ponta a ponta com os dois `docker compose` (teste de fumaça da spec) |

## Riscos e limites que precisam ficar à vista

- **Sem o Connect, ninguém é pago de verdade.** A tela de comprovantes funciona com o Connect simulado; em produção responde 503 ao classificar até a entrega 1.
- **`PIX_SECRET_KEY` é permanente.** Trocar invalida todos os hashes. Guardar com backup próprio, separado do banco.
- **Confirmação sem etapa extra para SSO sem TOTP** (Q20): decisão provisória.
- **Testes em SQLite** nos casos de concorrência: a prova real vem do CI com Postgres.
- **Dado pessoal:** nada de PDF, planilha ou `.env` reais no repositório; chave Pix nunca copiada do Connect; CPF nunca guardado. Inventário e ROPA já cobrem login e comprovantes.
