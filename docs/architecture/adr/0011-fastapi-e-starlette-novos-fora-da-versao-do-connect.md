# 0011 — FastAPI 0.162.0 e Starlette 1.10.0, fora da versão do Connect

- **Status:** aceito
- **Data:** 2026-11-06
- **Quem decidiu:** técnico, na implementação do PF-52. O João ainda não revisou a mudança no `.github/`.

## Contexto

O [ADR 0001](0001-stack-do-sistema-real.md) manda usar a stack do Connect, e o [handoff/02](../../handoff/02-arquitetura-e-stack.md) manda copiar as versões dele. O Connect está no `fastapi==0.118.3`, que trava o `starlette` em 0.48.0.

Esse Starlette tem 6 avisos no `pip-audit`. Um deles afeta o Financeiro hoje: `PYSEC-2026-249`, formulário urlencoded sem limite de tamanho, em `POST /auth/token`, que não exige login. Medido em 03/11/2026: um envio de 150 MB subiu a memória da API de 43 MB para 217 MB em 1,6 s. Desde 05/11 o corpo de `/auth/*` é cortado em 16 KB (`core/body_limit.py`), mas os 6 avisos seguiam ignorados no `security.yml`.

## Decisão

Subir para `fastapi==0.162.0` e `starlette==1.10.0` e tirar todos os `--ignore-vuln` do `pip-audit`. A versão foi a que o `pip` resolveu ao pedir um FastAPI que aceite Starlette 1.3.1 ou maior, que é onde o `PYSEC-2026-249` está corrigido.

O limite de 16 KB em `/auth/*` continua, como segunda camada: custa uma checagem por pedido e protege também se alguém voltar a um Starlette sem a correção.

## Alternativas consideradas

- **Ficar na 0.118.3 do Connect e manter as exceções:** deixa o `PYSEC-2026-249` aberto num endpoint sem login, e cada aviso novo do Starlette vira mais uma exceção para explicar.
- **Limitar o corpo no proxy:** depende de uma infraestrutura que ainda não existe. A mitigação em código já cobre o caso, mas não elimina os outros 5 avisos.

## Consequências

- O `pip-audit` passa **sem nenhuma exceção**. Na mesma conferência apareceu outro problema, que não era do Starlette: o `pypdf` 6.21.2 tinha 7 avisos, corrigidos subindo para a 6.21.4 (commit à parte).
- O Financeiro passa a ter versões diferentes das do Connect. Código copiado do Connect (`core/`, leitor de comprovante) deve ser conferido ao copiar. O Connect segue com os 6 avisos ignorados até subir a versão dele, e o time dele deve ser avisado.
- Verificação com as versões novas: 477 testes do backend (2 pulados, os de Postgres) com 96,37% de cobertura, `ruff`, `mypy`, Vitest, `tsc`, lint, `check:ui` e as 16 jornadas de E2E, tudo verde.
- Não foi rodada a simulação de CI em Linux com Python 3.11 (o CI usa 3.11 e a máquina local usa outra versão do Python). Rodar antes de qualquer push.
- Onde aparece: `backend/requirements.txt`, `.github/workflows/security.yml`.
