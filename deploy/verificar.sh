#!/usr/bin/env bash
# Confere se o servidor está pronto para o Financeiro: programas, Docker, portas, firewall, disco,
# endereço e branch. Roda com `make verificar`, e também antes do `make configurar` (primeira
# instalação), do `make trocar-endereco` e do `make subir`. Sai com erro se algo impede o deploy;
# aviso não impede. Guia: DEPLOY.md
#
# Dois modos (ADR 0027), pelo MODO (do make ou do deploy/.env):
# - ip: o Caddy do Financeiro publica PORTA_TELAS e PORTA_API (8444 e 8443), com o HTTPS dele;
# - nginx: o nginx do servidor tem as portas 80 e 443 e o HTTPS, e o Caddy escuta só em
#   127.0.0.1:PORTA_LOCAL (8089).
# As portas 80 e 443 não são conferidas: são do nginx do servidor nos dois modos.
set -u

# lê uma variável do deploy/.env sem executar o arquivo
env_get() { [ -f deploy/.env ] && sed -n "s/^$1=//p" deploy/.env | tail -n 1 | tr -d '\r'; }

# o que veio do make (o endereço novo) vale mais que o deploy/.env
MODO=${MODO:-$(env_get MODO)}
IP=${IP:-$(env_get IP)}
PORTA_TELAS=${PORTA_TELAS:-$(env_get PORTA_TELAS)}
PORTA_API=${PORTA_API:-$(env_get PORTA_API)}
DOMINIO=${DOMINIO:-$(env_get DOMINIO)}
DOMINIO_API=${DOMINIO_API:-$(env_get DOMINIO_API)}
PORTA_LOCAL=${PORTA_LOCAL:-$(env_get PORTA_LOCAL)}
erros=0
avisos=0

ok() { printf '  [ok]    %s\n' "$1"; }
aviso() { printf '  [aviso] %s\n' "$1"; avisos=$((avisos + 1)); }
erro() { printf '  [ERRO]  %s\n' "$1"; erros=$((erros + 1)); }

case "$MODO" in
  ip) echo "Verificando o servidor para o Financeiro, pelo IP ($IP)..." ;;
  nginx) echo "Verificando o servidor para o Financeiro, por nome atrás do nginx ($DOMINIO)..." ;;
  *) echo "Verificando o servidor para o Financeiro..." ;;
esac

# ---- Programas ----
for programa in git make openssl curl; do
  if command -v "$programa" >/dev/null 2>&1; then ok "$programa instalado"
  else erro "Falta o $programa: sudo apt install -y $programa"; fi
done

# ---- Docker ----
docker_ok=0
if ! command -v docker >/dev/null 2>&1; then
  erro "Falta o Docker: instale pelo repositório oficial (DEPLOY.md)"
elif saida=$(docker info 2>&1); then
  docker_ok=1
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) rodando e acessível por $(id -un)"
elif printf '%s' "$saida" | grep -qi "permission denied"; then
  erro "Seu usuário não pode usar o Docker: sudo usermod -aG docker \"\$USER\" e entre de novo"
else
  erro "O Docker não está rodando: sudo systemctl enable --now docker"
fi

if command -v docker >/dev/null 2>&1; then
  versao=$(docker compose version --short 2>/dev/null | sed 's/^v//')
  maior=${versao%%.*}
  resto=${versao#*.}
  menor=${resto%%.*}
  if [ -z "$versao" ]; then
    erro "Falta o Docker Compose 2 (docker compose): sudo apt install -y docker-compose-plugin"
  elif [ "$maior" -gt 2 ] 2>/dev/null || { [ "$maior" -eq 2 ] && [ "$menor" -ge 20 ]; } 2>/dev/null; then
    ok "Docker Compose $versao"
  else
    erro "Docker Compose $versao é antigo (precisa de 2.20 ou mais novo): instale pelo repositório oficial do Docker"
  fi
fi

# ---- nginx (só por nome: o servidor da frente, com as portas 80 e 443 e o HTTPS) ----
if [ "$MODO" = nginx ]; then
  if command -v nginx >/dev/null 2>&1 || [ -x /usr/sbin/nginx ]; then
    ok "nginx instalado (ele fica com as portas 80 e 443 e o HTTPS)"
  else
    erro "Falta o nginx, que fica na frente do Financeiro: sudo apt install -y nginx (ou use IP=..., sem o nginx)"
  fi
  if command -v certbot >/dev/null 2>&1; then
    ok "certbot instalado (certificado do HTTPS)"
  else
    aviso "Falta o certbot, que tira o certificado do HTTPS: sudo apt install -y certbot python3-certbot-nginx"
  fi
fi

# ---- Portas do Financeiro ----
nosso_proxy=""
if [ "$docker_ok" = 1 ]; then
  nosso_proxy=$(docker ps -q --filter label=com.docker.compose.project=financeiro --filter label=com.docker.compose.service=proxy 2>/dev/null)
fi

porta_ocupada() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn "sport = :$1" 2>/dev/null | grep -q .
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

conferir_porta() { # porta, o que ela é
  case "$1" in
    '' | *[!0-9]*) erro "Porta inválida para $2: ${1:-vazia}"; return ;;
  esac
  if ! porta_ocupada "$1"; then
    ok "Porta $1 livre ($2)"
  elif [ -n "$nosso_proxy" ]; then
    ok "Porta $1 em uso pelo próprio Financeiro ($2)"
  else
    erro "A porta $1 ($2) está em uso por outro programa. Veja quem: sudo ss -ltnp | grep ':$1 '"
    printf '          Escolha outra no make configurar (ou no make trocar-endereco): %s\n' "$3"
  fi
}

portas_abertas=""
case "$MODO" in
  ip)
    conferir_porta "$PORTA_TELAS" "telas" "PORTA_TELAS=8445"
    conferir_porta "$PORTA_API" "API" "PORTA_API=8442"
    portas_abertas="$PORTA_TELAS $PORTA_API"
    ;;
  nginx)
    conferir_porta "$PORTA_LOCAL" "local, onde o nginx repassa" "PORTA_LOCAL=8090"
    portas_abertas="80 443"
    ;;
esac

# ---- Firewall (ufw) ----
if [ -n "$portas_abertas" ] && command -v ufw >/dev/null 2>&1; then
  if estado=$(sudo -n ufw status 2>/dev/null); then
    if printf '%s' "$estado" | grep -q "Status: active"; then
      faltam=""
      for porta in $portas_abertas; do
        printf '%s\n' "$estado" | grep -E "ALLOW" | grep -qE "(^|[ ,])$porta(/tcp)?([ ,]|$)|Nginx (Full|HTTP|HTTPS)" || faltam="$faltam $porta"
      done
      if [ -z "$faltam" ]; then ok "Firewall (ufw) libera as portas $portas_abertas"
      else aviso "O firewall (ufw) pode não liberar a(s) porta(s)$faltam: a equipe não vai alcançar. sudo ufw allow <porta>/tcp, para cada uma"; fi
    else
      ok "Firewall (ufw) desligado: não bloqueia as portas"
    fi
  else
    aviso "Não deu para ler o firewall sem senha: confira com sudo ufw status (precisa liberar $portas_abertas)"
  fi
fi

# ---- Disco ----
raiz=$( [ "$docker_ok" = 1 ] && docker info -f '{{.DockerRootDir}}' 2>/dev/null )
livre=$(df -Pk "${raiz:-.}" 2>/dev/null | awk 'NR == 2 {print int($4 / 1048576)}')
[ -n "$livre" ] || livre=$(df -Pk . 2>/dev/null | awk 'NR == 2 {print int($4 / 1048576)}')
if [ -z "$livre" ]; then aviso "Não deu para medir o espaço em disco"
elif [ "$livre" -ge 10 ]; then ok "Disco: ${livre} GB livres"
else aviso "Disco com só ${livre} GB livres: as imagens, o banco, os arquivos e os backups pedem pelo menos 10 GB"; fi

# ---- Endereço ----
case "$MODO" in
  ip)
    if ips=$(hostname -I 2>/dev/null) && [ -n "$ips" ]; then
      if printf ' %s ' "$ips" | grep -q " $IP "; then ok "Endereço $IP é desta máquina"
      else aviso "O IP $IP não é desta máquina (os IPs dela: $ips). Confira o IP"; fi
    fi
    ;;
  nginx)
    # telas em https://DOMINIO e API em https://DOMINIO_API: o nginx separa os sistemas pelo nome
    if command -v getent >/dev/null 2>&1; then
      for nome in "$DOMINIO" "$DOMINIO_API"; do
        if getent hosts "$nome" >/dev/null; then ok "O nome $nome é encontrado na rede"
        else aviso "O nome $nome ainda não é encontrado: peça à TI o registro no DNS, apontando para esta máquina"; fi
      done
    fi
    ;;
  *) aviso "Endereço ainda não definido (make configurar IP=<IP do servidor>, ou DOMINIO=<nome> atrás do nginx)" ;;
esac


# ---- Fuso ----
# o cron da atualização automática (make agendar) e o nome dos backups usam a hora da máquina
fuso=$(timedatectl show -p Timezone --value 2>/dev/null || true)
if [ -z "$fuso" ]; then :
elif [ "$fuso" = America/Sao_Paulo ]; then ok "Fuso de São Paulo"
else aviso "O fuso desta máquina é $fuso: as 22h da atualização automática seriam em outra hora. sudo timedatectl set-timezone America/Sao_Paulo"; fi

# ---- Branch ----
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = development ]; then ok "Na branch development"
elif [ "$branch" = HEAD ]; then aviso "Numa versão solta, fora da development (como depois de um make voltar): make atualizar volta para ela"
else aviso "Na branch ${branch:-desconhecida}: o servidor segue a development (git checkout development)"; fi

echo
if [ "$erros" -gt 0 ]; then
  echo "Não dá para seguir: $erros erro(s) e $avisos aviso(s). Corrija os [ERRO] e rode make verificar de novo."
  exit 1
fi
echo "Servidor pronto ($avisos aviso(s))."
