# 0001 — Stack do sistema real: a do handoff, igual à do Connect

- **Status:** aceito
- **Data:** 2026-11-03
- **Quem decidiu:** Bruno Conrado, ao iniciar o login funcional (PF-17)

## Contexto

Havia duas stacks documentadas para o sistema real. O protótipo Manus roda em React + Vite + Express + tRPC + Drizzle + MySQL, mas é um mockup com dados no navegador, e o ADR-004 dos docs dele deixava a stack real como "A CONFIRMAR". O handoff manda FastAPI + Next.js 16 + Postgres 16 + MinIO, nos mesmos padrões do Connect (decisão 5 do handoff/01). A PF-12 a PF-16 esperavam essa definição.

## Decisão

O sistema real usa a stack do handoff: **FastAPI, SQLAlchemy 1.4, Postgres 16 e Next.js 16**, nas versões de [handoff/02](../../handoff/02-arquitetura-e-stack.md), em `backend/` e `frontend/` na raiz do repositório. O protótipo Manus continua em `prototipo/` só como referência de telas, campos e fluxos.

## Alternativas consideradas

- Evoluir o protótipo Manus: o login teria de nascer do zero, porque o doc 05 dele proíbe reutilizar o acesso demo. O parser de comprovantes, o `core/pix.py` e os testes do Connect, em Python, teriam de ser reescritos, e os docs de segurança e integração foram escritos para o outro stack.

## Consequências

- Autenticação, camadas, componentes de tela e testes vêm do Connect por cópia, e o que falta nele (MFA, cookie HttpOnly, detecção de reuso) nasce aqui.
- O código do protótipo não é reaproveitado no sistema real.
- A PF-12 a PF-16 seguem esta stack. A decisão 5 do handoff/01 continua valendo, e o ADR-004 dos docs Manus recebeu a anotação.
