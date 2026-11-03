# 0006 — Gitleaks pela CLI na CI

- **Status:** aceito
- **Data:** 2026-11-03 (registro; a escolha vem do ADR 0007 do Connect)
- **Quem decidiu:** técnico, na implementação (PF-16)

## Contexto

O repositório lida com segredos, e um segredo commitado precisa ser barrado em todo o histórico. No Connect, a `gitleaks/gitleaks-action` exigiu licença paga em repositório de organização e falhava com 403.

## Decisão

Baixar a CLI do Gitleaks com versão fixa do release oficial e varrer o histórico inteiro, com `fetch-depth: 0`, `--redact` e `--exit-code 1`, em `.github/workflows/security.yml`.

## Alternativas consideradas

- `gitleaks/gitleaks-action`: o problema de licença e permissão acima.

## Consequências

- Não precisa de licença nem de token extra.
- Atualizar a versão é manual.
- Falsos positivos revisados vão no `.gitleaksignore`, com o motivo.
- Um segredo vazado precisa ser trocado, não só removido do commit.
