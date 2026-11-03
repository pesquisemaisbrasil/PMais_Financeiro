#!/usr/bin/env bash
# Verificação completa de uma entrega (a mesma barra da CI), usada pela skill
# /entregar. Para no primeiro erro e diz qual etapa falhou.
#
#   bash scripts/verify-delivery.sh          # backend + frontend
#   bash scripts/verify-delivery.sh --e2e    # + Playwright (tela ou fluxo mudou)
#   bash scripts/verify-delivery.sh --fast   # sem cobertura (iteração local)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E=0
FAST=0
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E=1 ;;
    --fast) FAST=1 ;;
    *) echo "uso: $0 [--e2e] [--fast]"; exit 2 ;;
  esac
done

if [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then
  PY="$ROOT/backend/.venv/Scripts/python.exe"
elif [ -x "$ROOT/backend/.venv/bin/python" ]; then
  PY="$ROOT/backend/.venv/bin/python"
else
  PY="${PYTHON:-python}"
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mFALHOU: %s\033[0m\n' "$1"; exit 1; }

cd "$ROOT/backend"
step "backend: ruff check"; "$PY" -m ruff check . || fail "ruff check"
step "backend: ruff format --check"; "$PY" -m ruff format --check . || fail "ruff format"
step "backend: mypy"; "$PY" -m mypy . || fail "mypy"
step "backend: alembic heads (uma só)"
HEADS=$("$PY" -m alembic heads 2>/dev/null | grep -c "(head)" || true)
[ "$HEADS" = "1" ] || fail "alembic tem $HEADS heads"
if [ "$FAST" = "1" ]; then
  step "backend: pytest"; "$PY" -m pytest -q -p no:cacheprovider -W ignore || fail "pytest"
else
  step "backend: pytest + cobertura >= 80%"
  "$PY" -m pytest -q -p no:cacheprovider -W ignore --cov=. --cov-fail-under=80 || fail "pytest/cobertura"
fi

cd "$ROOT/frontend"
step "frontend: next typegen"; npx next typegen >/dev/null || fail "next typegen"
step "frontend: tsc"; npx tsc --noEmit || fail "tsc"
step "frontend: lint"; npm run lint --silent || fail "lint"
step "frontend: check:ui"; npm run check:ui --silent || fail "check:ui"
step "frontend: vitest"; npm test --silent || fail "vitest"

if [ "$E2E" = "1" ]; then
  if grep -q '"e2e"' package.json; then
    step "frontend: e2e (Playwright)"; npm run e2e --silent || fail "e2e"
  else
    fail "script e2e não existe no frontend/package.json"
  fi
fi

printf '\n\033[32mTudo verde.\033[0m\n'
