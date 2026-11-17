#!/usr/bin/env bash
# Confere se o servidor está pronto para o Financeiro: programas, Docker, portas, firewall, disco,
# endereço e branch. Roda com `make verificar`, e também antes do `make configurar` (primeira
# instalação) e do `make subir`. Sai com erro se algo impede o deploy; aviso não impede.
# Guia: docs/operations/servidor-local.md
set -u

PORTAS="80 443 8443"
erros=0
avisos=0

ok() { printf '  [ok]    %s\n' "$1"; }
aviso() { printf '  [aviso] %s\n' "$1"; avisos=$((avisos + 1)); }
erro() { printf '  [ERRO]  %s\n' "$1"; erros=$((erros + 1)); }

echo "Verificando o servidor para o Financeiro..."

# ---- Programas ----
for programa in git make openssl curl; do
  if command -v "$programa" >/dev/null 2>&1; then ok "$programa instalado"
  else erro "Falta o $programa: sudo apt install -y $programa"; fi
done

# ---- Docker ----
docker_ok=0
if ! command -v docker >/dev/null 2>&1; then
  erro "Falta o Docker: instale pelo repositório oficial (docs/operations/servidor-local.md)"
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

# ---- Portas ----
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

ocupadas=""
for porta in $PORTAS; do
  if porta_ocupada "$porta"; then ocupadas="$ocupadas $porta"; fi
done
if [ -z "$ocupadas" ]; then
  ok "Portas $PORTAS livres"
elif [ -n "$nosso_proxy" ]; then
  ok "Portas $PORTAS em uso pelo próprio Financeiro (já instalado)"
else
  erro "Porta(s)$ocupadas em uso por outro programa. Veja quem: sudo ss -ltnp | grep -E ':(80|443|8443) '"
  printf '          Se não precisa dele, desligue (ex.: sudo systemctl disable --now apache2). Se precisa, fale com o desenvolvimento.\n'
fi

# ---- Firewall (ufw) ----
if command -v ufw >/dev/null 2>&1; then
  if estado=$(sudo -n ufw status 2>/dev/null); then
    if printf '%s' "$estado" | grep -q "Status: active"; then
      liberadas=$(printf '%s\n' "$estado" | awk '/ALLOW/ {print $1}' | sed 's#/tcp##; s#/udp##' | tr ',' '\n')
      faltam=""
      for porta in $PORTAS; do
        printf '%s\n' "$liberadas" | grep -qx "$porta" || faltam="$faltam $porta"
      done
      if [ -z "$faltam" ]; then ok "Firewall (ufw) libera as portas $PORTAS"
      else aviso "O firewall (ufw) não libera a(s) porta(s)$faltam: a equipe não vai alcançar. sudo ufw allow 80,443,8443/tcp"; fi
    else
      ok "Firewall (ufw) desligado: não bloqueia as portas"
    fi
  else
    aviso "Não deu para ler o firewall sem senha: confira com sudo ufw status (precisa liberar $PORTAS)"
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
host=${HOST:-}
if [ -z "$host" ] && [ -f deploy/.env ]; then
  host=$(sed -n 's/^SERVER_HOST=//p' deploy/.env | head -n 1)
fi
if [ -z "$host" ]; then
  aviso "Endereço ainda não definido (make configurar HOST=<IP ou nome do servidor>)"
elif printf '%s' "$host" | grep -Eq '^[0-9]+(\.[0-9]+){3}$'; then
  if ips=$(hostname -I 2>/dev/null) && [ -n "$ips" ]; then
    if printf ' %s ' "$ips" | grep -q " $host "; then ok "Endereço $host é desta máquina"
    else aviso "O IP $host não é desta máquina (os IPs dela: $ips). Confira o HOST"; fi
  fi
elif [ "$host" != localhost ] && command -v getent >/dev/null 2>&1; then
  if getent hosts "$host" >/dev/null; then ok "O nome $host é encontrado na rede"
  else aviso "O nome $host não é encontrado; os computadores da equipe também precisam achá-lo"; fi
fi

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
