# Próximos passos

**Posição em 05/11/2026**, ao fim da primeira semana de construção. Todo o trabalho está na `homolog`, sem push. A fonte do que está aberto é o Jira (projeto PF); este documento explica a ordem e o porquê. Decisões de produto continuam em [perguntas-abertas](perguntas-abertas.md).

## Onde estamos

| Área | Estado |
|---|---|
| Login por senha com MFA, Google e Microsoft | Entregue. Google funcionando; Microsoft configurada, falta o João liberar o teste (autenticador dele) |
| Identificador fixo do SSO (PF-49) | Entregue |
| Inventário de dados e ROPA do login (PF-55) | Escritos; falta o DPO definir o prazo de guarda (Q26) |
| Corpo grande em `/auth` (PF-52) | Mitigado com limite de 16 KB; falta subir o FastAPI para fechar o alerta do `pip-audit` |
| Início e Contas a pagar | Entregue: lista, filtros, importar planilha, detalhes por pessoa, menu lateral em 4 seções |
| Comprovantes e baixa (PF-56) | **Entregue** com o Connect simulado ([spec](../specs/comprovantes-e-baixa.md), [como testar](roadmap.md)) |
| Cadastros | Entregue |

## O que depende de outra pessoa

Nada disto anda sem uma resposta. A ordem é a de quem destrava mais coisa.

| # | O que | Quem | Destrava | Jira |
|---|---|---|---|---|
| 1 | **Datas e responsáveis das entregas 1 a 8 da API do Connect** ([entregas-do-connect](../specs/entregas-do-connect.md)) | João e o dev do Connect | A baixa de verdade, a planilha de pagamento, a sincronização do espelho | PF-58, PF-6 |
| 2 | Q4 (cancelar baixa), Q18 a Q25 | João, DPO, financeiro | Cancelamento de baixa, onde guardar arquivos, regras de data e fornecedor | PF-58 |
| 3 | **Q19 e Q5**: guardar ou não o PDF de comprovantes, e por quanto tempo | DPO | Hoje o PDF é só lido e descartado; se mudar, entra o armazenamento no MinIO | — |
| 4 | **Q20**: a baixa exige reautenticação para quem entra por SSO? | João | Fecha a regra de MFA da confirmação | — |
| 5 | **Q26**: prazo de guarda de `login_events` e `refresh_tokens` | DPO | Escrever a rotina de limpeza e fechar o PF-55 | PF-55 |
| 6 | **Regra do bloqueio de login** (10 falhas por hora por e-mail deixa qualquer um travar a conta de outra pessoa) | João e Vivi | PF-53 e PF-54 (teste de concorrência no CI) | PF-53, PF-54 |
| 7 | Teste do SSO Microsoft com a conta da empresa e a verificação em duas etapas obrigatória nas contas | João (autenticador) | Fecha o login para produção | PF-50, PF-51 |

## O que dá para fazer sem esperar ninguém

Em ordem sugerida:

1. **Fechar a `homolog` para enviar.** Antes do push: simulação de CI em containers Linux (com Postgres, que cobre a trava `with_for_update` e o índice único do Pix, hoje só conferidos na migration) e auditoria de segredos. `.github/workflows/tests.yml` mudou (`PIX_SECRET_KEY`): pede revisão. O PR `homolog` → `main` só com o João pedindo ou autorizando.
2. **PF-57: recorrência em Contas a pagar** ([baixas-recorrencia-e-anexos](../specs/baixas-recorrencia-e-anexos.md)). É a próxima funcionalidade grande que não depende do Connect.
3. **Fechar as pontas do PF-56 que não dependem do Connect:**
   - **Despachante em segundo plano** para reenviar baixas que esperam o Connect. Hoje o reenvio é manual (`python scripts/dispatch_payments.py`) ou na próxima confirmação.
   - **Sino de avisos** na barra (a API `/notifications` já existe) e uma **tela de Divergências** (a rota `/divergences` já existe).
   - **Baixa por pessoa dentro do lançamento:** exige guardar o id do Connect em cada pessoa do lançamento de origem `connect`.
4. **Importar projetos e itens do Connect** de verdade, quando a entrega 1 existir: trocar o `UnavailableConnect` por um cliente HTTP em `services/connect_gateway.py`, com token de serviço, timeout e HTTPS. A interface, o espelho (`project_refs`, `connect_payable_items`) e os testes já estão prontos.
5. **Planilha de pagamento ao banco** ([pagamentos-a-pagar](../specs/pagamentos-a-pagar.md)): depende da entrega 1 do Connect (`payment-data`), com cada acesso à chave completa auditado.
6. **Próximos módulos do [roadmap](roadmap.md):** Contas a receber, Notas e RPA e Conferência bancária (hoje "Em breve" no menu), depois Relatórios.
7. **Débitos pequenos:**
   - corrigir o handoff/07 §7, que diz que os itens do orçamento "entram quando existirem" (a API já os entrega);
   - cache `.next` separado para o E2E (rodar o E2E hoje contamina o servidor de dev);
   - subir o FastAPI em PR próprio, combinado com o Connect (PF-52);
   - mover as subtarefas PF-31/32 e PF-34/35 no quadro, e arrastar PF-25/26/27 ao backlog.

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
