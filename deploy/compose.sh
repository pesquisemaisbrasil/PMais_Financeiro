#!/usr/bin/env bash
# `docker compose` do servidor no modo do deploy/.env (ADR 0027). O Makefile usa este script em
# todo comando; à mão: bash deploy/compose.sh ps
#
# - MODO=ip:    compose.yml + compose.ip.yml; telas em https://IP:PORTA_TELAS, API em https://IP:PORTA_API
# - MODO=nginx: compose.yml + compose.nginx.yml; telas em https://DOMINIO, API em https://DOMINIO_API
# Calcula URL_TELAS e URL_API, que a API e o build das telas usam.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=deploy/.env
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE. Rode primeiro: make configurar IP=<IP do servidor> (ou DOMINIO=<nome>)" >&2; exit 1; }

# lê uma variável do deploy/.env sem executar o arquivo
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'; }

modo=$(env_get MODO)
case "$modo" in
  ip)
    ip=$(env_get IP)
    export URL_TELAS="https://$ip:$(env_get PORTA_TELAS)" URL_API="https://$ip:$(env_get PORTA_API)"
    arquivo_do_modo=deploy/compose.ip.yml
    ;;
  nginx)
    export URL_TELAS="https://$(env_get DOMINIO)" URL_API="https://$(env_get DOMINIO_API)"
    arquivo_do_modo=deploy/compose.nginx.yml
    ;;
  *)
    echo "MODO no $ENV_FILE tem de ser ip ou nginx (está: ${modo:-vazio}). Veja o DEPLOY.md, \"Trocar o endereço\"." >&2
    exit 1
    ;;
esac

exec docker compose --env-file "$ENV_FILE" -f deploy/compose.yml -f "$arquivo_do_modo" "$@"
