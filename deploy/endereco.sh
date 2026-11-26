#!/usr/bin/env bash
# Confere o endereço pedido ao make (IP=... ou DOMINIO=...) e imprime as linhas dele para o
# deploy/.env. Usado pelo make configurar, verificar e trocar-endereco (ADR 0027).
#
#   IP=192.168.30.15 [PORTA_TELAS=8444] [PORTA_API=8443]            -> MODO=ip
#   DOMINIO=financeiro.pesquisemais.com.br [DOMINIO_API=...] [PORTA_LOCAL=8089] -> MODO=nginx
set -u

IP=${IP:-}
DOMINIO=${DOMINIO:-}

falha() { echo "$1" >&2; exit 1; }

porta_valida() {
  case "$1" in '' | *[!0-9]*) return 1 ;; esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

if [ -n "$IP" ] && [ -n "$DOMINIO" ]; then
  falha "Use IP=... ou DOMINIO=..., não os dois (DEPLOY.md, seção 2)."
fi

if [ -n "$IP" ]; then
  printf '%s' "$IP" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || falha "IP inválido: $IP. Só o IP, sem https:// nem porta (ex.: 192.168.30.15)"
  for parte in ${IP//./ }; do
    [ "$parte" -le 255 ] || falha "IP inválido: $IP"
  done
  telas=${PORTA_TELAS:-8444}
  api=${PORTA_API:-8443}
  for porta in "$telas" "$api"; do
    porta_valida "$porta" || falha "Porta inválida: $porta"
    case "$porta" in 80 | 443) falha "As portas 80 e 443 são do nginx do servidor: use outras (padrão: PORTA_TELAS=8444 e PORTA_API=8443)" ;; esac
  done
  [ "$telas" != "$api" ] || falha "PORTA_TELAS e PORTA_API precisam ser diferentes: as telas e a API têm endereços próprios"
  printf 'MODO=ip\nIP=%s\nPORTA_TELAS=%s\nPORTA_API=%s\n' "$IP" "$telas" "$api"
elif [ -n "$DOMINIO" ]; then
  api=${DOMINIO_API:-api.$DOMINIO}
  for nome in "$DOMINIO" "$api"; do
    if printf '%s' "$nome" | grep -Eq '^[0-9.]+$'; then
      falha "DOMINIO é um nome, não um IP ($nome). Pelo IP, use IP=$nome (DEPLOY.md, seção 2)"
    fi
    printf '%s' "$nome" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' ||
      falha "Endereço inválido: $nome. Só o nome, em minúsculas, sem https:// nem porta (ex.: financeiro.pesquisemais.com.br)"
  done
  local_=${PORTA_LOCAL:-8089}
  porta_valida "$local_" || falha "Porta inválida: $local_"
  printf 'MODO=nginx\nDOMINIO=%s\nDOMINIO_API=%s\nPORTA_LOCAL=%s\n' "$DOMINIO" "$api" "$local_"
else
  falha "Diga o endereço: IP=192.168.30.15 (pelo IP, com o certificado da própria máquina) ou DOMINIO=financeiro.pesquisemais.com.br (por nome, atrás do nginx). DEPLOY.md, seção 2"
fi
