# AGENTS.md

Entrada para pessoas e agentes de IA que trabalham no **Financeiro** da Pesquise+ (pagamento dos entrevistadores de campo do P+ Connect: o que pagar, planilha para o banco, comprovantes Pix, conciliação e baixa). Regras de trabalho aqui; todo o resto está linkado.

## Regras de trabalho

1. **Leia antes de mudar.** O índice da documentação é [docs/README.md](docs/README.md). O contrato do domínio que você vai tocar está em [docs/specs/](docs/specs/README.md): o que o sistema faz, as regras, os casos negados e os critérios de aceite.
2. **Frontend:** leia [frontend/AGENTS.md](frontend/AGENTS.md) antes de escrever código. O Next.js deste projeto tem APIs diferentes do que modelos costumam saber.
3. **Sistema separado:** o Financeiro nunca lê nem escreve no banco do P+ Connect. Tudo passa pela API de integração ([docs/specs/integracao-com-o-connect.md](docs/specs/integracao-com-o-connect.md)). Nos testes, o Connect é sempre simulado.
4. **Regras de dinheiro:**
   - dinheiro é `Decimal`, nunca `float`; datas de negócio no fuso de São Paulo;
   - o comprovante dá baixa, não cria entrevista;
   - valor exato: não fecha, é divergência para revisão humana;
   - nada é pago sem "Confirmar baixa";
   - um Pix (ID da transação) só paga uma vez.
5. **Commits separados por assunto** (backend, frontend, testes e docs por funcionalidade), no padrão Conventional Commits, sem linha de atribuição.
6. **Durante a construção do MVP, o trabalho vai direto na `homolog`** (decisão do Bruno em 04/11/2026), com a verificação completa antes de cada envio. Nada vai direto para a `main`: depois de validada, a `homolog` vai para a `main` num PR `homolog` → `main`. **Merge na `main` só com o dono** (João) pedindo ou autorizando.
7. **Pronto = verde:** `bash scripts/verify-delivery.sh` (testes do backend com cobertura ≥ 80%, `ruff`, `ruff format --check`, `mypy`, um head do Alembic; no frontend, `next typegen`, `tsc`, `lint`, `check:ui` e `npm test`), mais `--e2e` quando a tela ou o fluxo mudou. Comandos em [docs/handoff/09-testes-qualidade-e-ci.md](docs/handoff/09-testes-qualidade-e-ci.md).
8. **Regra mudou, teste novo.** Bug conhecido sem correção fica com `xfail(strict=True, reason="BUG: ...")`.
9. **Dado pessoal:**
   - nunca no log;
   - nunca comprovante, PDF ou planilha real no repositório (fixtures são texto fictício ou PDF gerado no teste);
   - CPF nunca (no Connect ele só existe como hash);
   - chave Pix não é copiada do Connect: é buscada na hora, mascarada na tela e completa só na planilha de pagamentos, com cada acesso auditado.
   - Mudou o que se guarda: atualize o [inventário de dados](docs/architecture/seguranca/README.md) e o ROPA **no mesmo PR**.
10. **Mensagens ao usuário em pt-BR simples.** O público (equipe financeira) não é técnico: "comprovante", "baixa", "a pagar", nunca "batch" ou "reconcile".
11. **Decisão de produto não se toma no código.** Pergunta aberta vai para [docs/planning/perguntas-abertas.md](docs/planning/perguntas-abertas.md); decisão técnica relevante vira ADR em [docs/architecture/adr/](docs/architecture/adr/README.md).

## Skills do projeto (`.claude/`)

| Skill / agente | Para quê |
|---|---|
| `financeiro-mudanca` | Rotina de qualquer mudança: spec → código → decisões anotadas → testes (pytest, Vitest, E2E) → docs |
| `/entregar` | Fecha a entrega: `scripts/verify-delivery.sh` → 3 revisores em paralelo → corrige → PR para a `homolog` |
| `revisor-spec`, `revisor-codigo`, `revisor-interface` | Revisores somente leitura usados pela `/entregar` |

## Mapa rápido

| Preciso de… | Vá para |
|---|---|
| Entender o sistema em 1 página | [docs/handoff/02-arquitetura-e-stack.md](docs/handoff/02-arquitetura-e-stack.md) |
| Regras do domínio e invariantes | [docs/handoff/08-dominio-e-codigo-atual.md](docs/handoff/08-dominio-e-codigo-atual.md) |
| Contrato com o P+ Connect | [docs/specs/integracao-com-o-connect.md](docs/specs/integracao-com-o-connect.md) |
| O que mudou e como testar | [docs/planning/roadmap.md](docs/planning/roadmap.md) |
| Rodar local / seeds / deploy | [docs/operations/](docs/operations/README.md) |
| Padrões de código | [docs/development/](docs/development/README.md) |
| Segurança e LGPD | [docs/architecture/seguranca/](docs/architecture/seguranca/README.md) |
| Pacote de handoff do Connect | [docs/handoff/README.md](docs/handoff/README.md) |

## Quem decide

- **Produto (PO):** João Paulo
- **Operação financeira e regras de acesso:** Vivi
- **LGPD e retenção:** DPO
