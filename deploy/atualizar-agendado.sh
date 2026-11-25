#!/usr/bin/env bash
# Atualização automática do servidor, todo dia às 22h (cron; ligue com `make agendar`, tire com
# `make desagendar`). Guia: DEPLOY.md, "Atualização automática".
#
# - Sem versão nova na development: só o backup do dia (make backup).
# - Com versão nova: make atualizar (backup, baixa a development e sobe). Se a versão nova não
#   subir, volta sozinho à versão de antes com o banco do backup que acabou de fazer (make voltar):
#   às 22h ninguém está lançando, então nada se perde. Na noite seguinte tenta de novo.
# - Log de cada noite em backups/logs/atualizar-<data>.log (fora do git; sem dado pessoal).
set -u
cd "$(dirname "$0")/.."
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH" # o cron vem quase sem PATH
export GIT_TERMINAL_PROMPT=0 # sem senha guardada para o GitHub, falha em vez de ficar esperando

agora=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/logs
exec >>"backups/logs/atualizar-$agora.log" 2>&1
echo "== $(date '+%d/%m/%Y %H:%M') atualização automática (branch development)"

# duas ao mesmo tempo (o cron e alguém rodando à mão) não
exec 9>backups/logs/.atualizar.trava
flock -n 9 || { echo "Outra atualização está rodando: nada feito."; exit 1; }

antes=$(git rev-parse HEAD)
if ! git fetch -q origin development; then
  echo "Não consegui baixar a development (rede ou acesso ao GitHub). Faço só o backup."
  make --no-print-directory backup AGORA="$agora"
  exit 1
fi

if [ "$(git rev-parse origin/development)" = "$antes" ]; then
  echo "Sem versão nova ($(git rev-parse --short HEAD)). Só o backup do dia."
  make --no-print-directory backup AGORA="$agora"
  exit $?
fi

if make --no-print-directory atualizar AGORA="$agora"; then
  echo "== Pronto: versão $(git rev-parse --short HEAD) no ar."
  exit 0
fi

# o make atualizar falhou: se chegou a trocar a versão, volta à de antes com o banco do backup
if [ "$(git rev-parse HEAD)" != "$antes" ] && [ -f "backups/banco-$agora.dump" ]; then
  echo
  echo "== A versão nova não subiu. Voltando à $(git rev-parse --short "$antes") com o banco de antes."
  if make --no-print-directory voltar ARQUIVO="backups/banco-$agora.dump" CONFIRMAR=sim; then
    echo "== Voltou: no ar a versão de antes. Veja o erro acima e corrija na development."
  else
    echo "== A volta também falhou: o Financeiro pode estar fora do ar. Rode make status e veja este log."
  fi
else
  echo "== A atualização parou antes de trocar a versão: o sistema continua como estava."
fi
exit 1
