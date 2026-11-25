#!/usr/bin/env bash
# Leva o banco local inteiro para o servidor: gera em backups/ (fora do git) o pacote que o
# `make subir-projeto` (primeira instalação) ou o `make restaurar-local` do servidor põe no ar
# (DEPLOY.md, seções 2 e 8).
#
#   local-<data>-banco.dump     o banco inteiro: cadastros, lançamentos, contas de acesso com as
#                               senhas (só o hash), autenticadores, histórico
#   local-<data>-arquivos.tgz   os arquivos do cofre (anexos), cifrados como estão
#   local-<data>-chaves.env     ENCRYPTION_KEY, PIX_SECRET_KEY e FILES_MASTER_KEY do backend/.env:
#                               sem elas o servidor não abre os autenticadores nem os anexos, e a
#                               chave de repetição dos relatórios muda (o mesmo relatório entraria de
#                               novo)
#
# Roda na raiz do repositório, com o docker compose do desenvolvimento no ar:
#   bash scripts/gerar-dump-local.sh
# O pacote tem dado real e as chaves: mande por um meio seguro, nunca pelo git nem por e-mail aberto.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1 # Git Bash no Windows: não trocar /data por um caminho do Windows

agora=$(date +%Y%m%d-%H%M%S)
base="backups/local-$agora"
CHAVES="ENCRYPTION_KEY PIX_SECRET_KEY FILES_MASTER_KEY"

no_ar=$(docker compose ps --status running --services 2>/dev/null || true)
for parte in db minio; do
  grep -qx "$parte" <<<"$no_ar" || { echo "O $parte local não está rodando: docker compose up -d"; exit 1; }
done
test -f backend/.env || { echo "Falta o backend/.env, de onde vêm as chaves."; exit 1; }
for chave in $CHAVES; do
  grep -Eq "^$chave=.+" backend/.env || { echo "Falta $chave no backend/.env."; exit 1; }
done

mkdir -p backups
umask 077 # só o seu usuário lê o pacote

docker compose exec -T db pg_dump -U postgres -d financeiro -Fc >"$base-banco.dump.parcial"
mv "$base-banco.dump.parcial" "$base-banco.dump"

# o MinIO local não tem tar: lê o volume dele por outro container, como o make backup do servidor
docker run --rm --volumes-from "$(docker compose ps -q minio):ro" postgres:16 \
  tar czf - -C /data . >"$base-arquivos.tgz.parcial"
mv "$base-arquivos.tgz.parcial" "$base-arquivos.tgz"

{
  echo "# Chaves do banco local de $agora, para o make restaurar-local do servidor. Segredo:"
  echo "# depois de restaurar, guarde num cofre e apague daqui e do servidor."
  for chave in $CHAVES; do grep -E "^$chave=" backend/.env | tr -d '\r'; done
} >"$base-chaves.env"

versao=$(docker compose exec -T db psql -U postgres -d financeiro -At -c "select version_num from alembic_version")
contar() { docker compose exec -T db psql -U postgres -d financeiro -At -c "select count(*) from $1"; }

echo "Pacote do banco local (versão do banco $versao):"
ls -lh "$base"-* | awk '{ print "  " $NF "  (" $5 ")" }'
echo "Dentro: $(contar users) contas de acesso, $(contar payables) contas a pagar, $(contar receivables) a receber, $(contar suppliers) fornecedores, $(contar projects) projetos."
if git status --porcelain -- backend/alembic/versions | grep -q .; then
  echo
  echo "Atenção: há migration que ainda não está no git (git status backend/alembic/versions)."
  echo "O servidor só restaura este banco depois que ela chegar à development e ele rodar make atualizar."
fi
echo
echo "No servidor: copie os 3 arquivos para a pasta backups/ do Financeiro e rode"
echo "  primeira instalação:    make subir-projeto HOST=<IP do servidor> CONFIRMAR=sim"
echo "  servidor já instalado:  make restaurar-local ARQUIVO=$base-banco.dump CONFIRMAR=sim"
echo "Mande por um meio seguro (pendrive, pasta protegida): tem dado real, senhas (hash) e as chaves."
