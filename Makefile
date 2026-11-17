# Deploy do Financeiro no servidor local (branch development): banco, cofre de arquivos, API, telas
# e HTTPS com certificado da própria máquina. Guia: docs/operations/servidor-local.md
#
# Primeira vez, no servidor, dentro da pasta do repositório:
#   make verificar HOST=<IP ou nome do servidor>    confere programas, Docker, portas, firewall e disco
#   make configurar HOST=<IP ou nome do servidor>   verifica de novo e gera deploy/.env com chaves novas
#   make subir                                      sobe tudo (banco, cofre, API, telas e HTTPS)
#   make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"
#   make certificado                                para instalar nos computadores da equipe
# Depois: make atualizar (backup, baixa a development e sobe a versão nova). Deu problema numa versão
# nova: make voltar ARQUIVO=backups/banco-<data>.dump CONFIRMAR=sim. `make` sozinho lista tudo.

SHELL := /bin/bash
.DEFAULT_GOAL := ajuda
BRANCH := development
ENV_FILE := deploy/.env
COMPOSE := docker compose --env-file $(ENV_FILE) -f deploy/compose.yml
AGORA := $(shell date +%Y%m%d-%H%M%S)

.PHONY: ajuda verificar configurar banco infra backend frontend proxy subir conferir parar status logs \
	atualizar voltar backup restaurar-banco restaurar-arquivos admin certificado

ajuda: ## Lista os comandos
	@echo "Financeiro no servidor local (branch $(BRANCH)). Guia: docs/operations/servidor-local.md"
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN { FS = ":.*## " } { printf "  make %-20s %s\n", $$1, $$2 }'

verificar: ## Confere se o servidor está pronto: programas, Docker, portas, firewall, disco, endereço
	@HOST="$(HOST)" bash deploy/verificar.sh

configurar: ## Primeira vez: verifica o servidor e gera deploy/.env com chaves novas (HOST=<IP ou nome>)
	@test -n "$(HOST)" || { echo 'Diga o endereço do servidor: make configurar HOST=192.168.0.50'; exit 1; }
	@case "$(HOST)" in *[/:\ ]*) echo "HOST é só o IP ou o nome, sem http:// nem porta: $(HOST)"; exit 1;; esac
	@test ! -f $(ENV_FILE) || { echo "$(ENV_FILE) já existe, e as chaves dele são permanentes: não gero outras."; exit 1; }
	@HOST="$(HOST)" bash deploy/verificar.sh
	@command -v openssl >/dev/null || { echo "Falta o openssl neste servidor."; exit 1; }
	@umask 077 && { \
	  echo "# Gerado por make configurar em $(AGORA). Fora do git. Guarde uma cópia num cofre, longe deste"; \
	  echo "# servidor: sem ENCRYPTION_KEY, PIX_SECRET_KEY e FILES_MASTER_KEY os dados guardados não abrem."; \
	  echo "SERVER_HOST=$(HOST)"; \
	  echo "POSTGRES_PASSWORD=$$(openssl rand -hex 24)"; \
	  echo "FINANCEIRO_MIGRATOR_PASSWORD=$$(openssl rand -hex 24)"; \
	  echo "FINANCEIRO_APP_PASSWORD=$$(openssl rand -hex 24)"; \
	  echo "MINIO_ROOT_USER=financeiro-admin"; \
	  echo "MINIO_ROOT_PASSWORD=$$(openssl rand -hex 24)"; \
	  echo "SECRET_KEY=$$(openssl rand -hex 32)"; \
	  echo "ENCRYPTION_KEY=$$(openssl rand -base64 32)"; \
	  echo "PIX_SECRET_KEY=$$(openssl rand -hex 32)"; \
	  echo "FILES_MASTER_KEY=$$(openssl rand -base64 32)"; \
	  echo "# P+ Connect (opcional): sem os três, o Connect fica fora do ar para o Financeiro. Só https."; \
	  echo "CONNECT_BASE_URL="; \
	  echo "CONNECT_CLIENT_ID="; \
	  echo "CONNECT_CLIENT_SECRET="; \
	  echo "PAYMENT_DISPATCH_SECONDS=0"; \
	} > $(ENV_FILE)
	@echo "Pronto: $(ENV_FILE) criado para https://$(HOST). Guarde uma cópia dele num cofre. Agora: make subir"

$(ENV_FILE):
	@echo "Falta $(ENV_FILE). Rode primeiro: make configurar HOST=<IP ou nome do servidor>"; exit 1

# Certificado do MinIO (só dentro do servidor): em produção a API só fala https com o cofre.
deploy/certs/public.crt:
	@mkdir -p deploy/certs
	@MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=minio" \
	  -addext "subjectAltName=DNS:minio" -keyout deploy/certs/private.key -out $@ 2>/dev/null
	@# o MinIO roda com outro usuário dentro do container e precisa ler a chave
	@chmod 644 deploy/certs/private.key $@

banco: $(ENV_FILE) ## Sobe o banco (Postgres) e acerta as senhas das roles pelo deploy/.env
	$(COMPOSE) up -d --wait db
	@set -a && . ./$(ENV_FILE) && set +a && \
	  printf "ALTER ROLE financeiro_migrator PASSWORD '%s';\nALTER ROLE financeiro_app PASSWORD '%s';\n" \
	    "$$FINANCEIRO_MIGRATOR_PASSWORD" "$$FINANCEIRO_APP_PASSWORD" | \
	  $(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 -q -U postgres -d financeiro

infra: banco deploy/certs/public.crt ## Sobe o banco e o cofre de arquivos (MinIO, com TLS)
	$(COMPOSE) up -d --wait minio
	$(COMPOSE) run --rm minio-init

backend: infra ## Sobe a API (as migrations do banco rodam quando ela sobe)
	$(COMPOSE) up -d --build --wait api

frontend: backend ## Sobe as telas
	$(COMPOSE) up -d --build --wait frontend

proxy: $(ENV_FILE) ## Sobe o HTTPS (Caddy) na frente das telas e da API
	$(COMPOSE) up -d --wait proxy

subir: verificar frontend proxy ## Verifica o servidor, sobe tudo (banco, cofre, API, telas e HTTPS) e confere pelo HTTPS
	@$(MAKE) --no-print-directory conferir
	@set -a && . ./$(ENV_FILE) && set +a && \
	  echo "Pronto: https://$$SERVER_HOST (API em https://$$SERVER_HOST:8443), versão $$(git rev-parse --short HEAD). Primeira vez? make admin e make certificado"

# O curl do Windows (Schannel) checa revogação, que a CA local não tem; no Ubuntu não precisa.
CURL_TLS := $(if $(findstring Schannel,$(shell curl -V 2>/dev/null)),--ssl-no-revoke,)

conferir: $(ENV_FILE) ## Testa o sistema no ar pelo HTTPS, como um computador da equipe (telas e API com o banco)
	@set -a && . ./$(ENV_FILE) && set +a && ca=$$(mktemp) && trap 'rm -f "$$ca"' EXIT && \
	  $(COMPOSE) cp proxy:/data/caddy/pki/authorities/local/root.crt "$$ca" >/dev/null 2>&1 || \
	    { echo "  [ERRO]  O HTTPS (proxy) não está no ar: make subir"; exit 1; }; \
	  for url in "https://$$SERVER_HOST/login" "https://$$SERVER_HOST:8443/readyz"; do \
	    if curl -fsS -o /dev/null --max-time 30 $(CURL_TLS) --cacert "$$ca" "$$url"; then echo "  [ok]    $$url"; \
	    else echo "  [ERRO]  $$url não respondeu: make status e make logs SERVICO=proxy"; exit 1; fi; \
	  done

parar: $(ENV_FILE) ## Para tudo, sem apagar nada (make subir volta)
	$(COMPOSE) stop

status: $(ENV_FILE) ## Mostra a versão no ar e cada parte, se está saudável
	@echo "Versão: $$(git log -1 --format='%h %s (%cd)' --date=format:'%d/%m/%Y %H:%M') na $$(git rev-parse --abbrev-ref HEAD)"
	$(COMPOSE) ps --all

logs: $(ENV_FILE) ## Acompanha os logs (SERVICO=api para um só)
	$(COMPOSE) logs -f --tail=200 $(SERVICO)

atualizar: $(ENV_FILE) ## Faz backup, baixa a branch development e sobe a versão nova
	@test -z "$$(git status --porcelain --untracked-files=no)" || { echo "Há mudança local nos arquivos do repositório: resolva antes (git status)."; exit 1; }
	@antes=$$(git rev-parse --short HEAD) && \
	  $(MAKE) --no-print-directory backup AGORA=$(AGORA) && \
	  git fetch origin $(BRANCH) && git checkout -q $(BRANCH) && git merge --ff-only origin/$(BRANCH) && \
	  echo "Versão: $$antes -> $$(git rev-parse --short HEAD)" && \
	  { $(MAKE) --no-print-directory subir || { \
	    echo; echo "A versão nova não subiu. Para voltar à $$antes com o banco de antes:"; \
	    echo "  make voltar ARQUIVO=backups/banco-$(AGORA).dump CONFIRMAR=sim"; \
	    exit 1; }; }

voltar: $(ENV_FILE) ## Volta à versão de um backup, com o banco dela (ARQUIVO=backups/banco-....dump CONFIRMAR=sim)
	@test "$(CONFIRMAR)" = sim || { echo "Isto troca a versão no ar e APAGA o banco atual, pondo o do backup. Rode com ARQUIVO=... CONFIRMAR=sim"; exit 1; }
	@test -f "$(ARQUIVO)" || { echo "Não achei o arquivo: $(ARQUIVO)"; exit 1; }
	@test -f "$(VERSAO_DO_BACKUP)" || { echo "Não achei $(VERSAO_DO_BACKUP), a versão do código desse backup."; exit 1; }
	@test -z "$$(git status --porcelain --untracked-files=no)" || { echo "Há mudança local nos arquivos do repositório: resolva antes (git status)."; exit 1; }
	git checkout -q --detach "$$(cat $(VERSAO_DO_BACKUP))"
	$(MAKE) --no-print-directory restaurar-banco ARQUIVO="$(ARQUIVO)" CONFIRMAR=sim
	$(MAKE) --no-print-directory subir
	@echo "No ar a versão $$(git rev-parse --short HEAD), de antes. Quando a correção sair na $(BRANCH): make atualizar"

# backups/banco-<data>.dump -> backups/versao-<data>.txt (o commit que estava no ar)
VERSAO_DO_BACKUP = $(patsubst backups/banco-%.dump,backups/versao-%.txt,$(ARQUIVO))

backup: $(ENV_FILE) ## Copia o banco e os arquivos para backups/, com a versão do código (fora do git)
	@$(COMPOSE) ps --status running --services 2>/dev/null | grep -qx db || { echo "O banco não está rodando: make banco (ou make subir) antes do backup."; exit 1; }
	@mkdir -p backups
	$(COMPOSE) exec -T db pg_dump -U postgres -d financeiro -Fc > backups/banco-$(AGORA).dump.parcial
	@mv backups/banco-$(AGORA).dump.parcial backups/banco-$(AGORA).dump
	@git rev-parse HEAD > backups/versao-$(AGORA).txt
	$(COMPOSE) run --rm --no-deps -e DONO="$$(id -u):$$(id -g)" ferramentas \
	  sh -c 'tar czf /backup/arquivos-$(AGORA).tgz -C /dados . && chown "$$DONO" /backup/arquivos-$(AGORA).tgz'
	@echo "Backup da versão $$(git rev-parse --short HEAD): backups/banco-$(AGORA).dump e backups/arquivos-$(AGORA).tgz. Leve uma cópia para fora deste servidor."

restaurar-banco: $(ENV_FILE) ## APAGA o banco e põe o de um backup (ARQUIVO=backups/banco-....dump CONFIRMAR=sim)
	@test "$(CONFIRMAR)" = sim || { echo "Isto APAGA o banco atual e põe o do backup. Rode com ARQUIVO=... CONFIRMAR=sim"; exit 1; }
	@test -f "$(ARQUIVO)" || { echo "Não achei o arquivo: $(ARQUIVO)"; exit 1; }
	$(COMPOSE) stop api
	$(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres \
	  -c "DROP DATABASE IF EXISTS financeiro WITH (FORCE)" -c "CREATE DATABASE financeiro"
	$(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 -q -U postgres -d financeiro < docker/postgres/roles.sql
	$(COMPOSE) exec -T db pg_restore -U postgres -d financeiro --exit-on-error < "$(ARQUIVO)"
	@# a API da versão que está no repositório agora (não a imagem que estava rodando) aplica as migrations dela
	$(COMPOSE) up -d --build --wait api
	@echo "Banco restaurado de $(ARQUIVO). A API da versão $$(git rev-parse --short HEAD) já aplicou as migrations que faltavam."

restaurar-arquivos: $(ENV_FILE) ## APAGA os arquivos e põe os de um backup (ARQUIVO=backups/arquivos-....tgz CONFIRMAR=sim)
	@test "$(CONFIRMAR)" = sim || { echo "Isto APAGA os arquivos atuais e põe os do backup. Rode com ARQUIVO=... CONFIRMAR=sim"; exit 1; }
	@case "$(ARQUIVO)" in backups/*.tgz) ;; *) echo "Use um arquivo da pasta backups/: ARQUIVO=backups/arquivos-....tgz"; exit 1;; esac
	@test -f "$(ARQUIVO)" || { echo "Não achei o arquivo: $(ARQUIVO)"; exit 1; }
	$(COMPOSE) stop minio
	$(COMPOSE) run --rm --no-deps ferramentas sh -c 'find /dados -mindepth 1 -delete && tar xzf "/backup/$(notdir $(ARQUIVO))" -C /dados'
	$(COMPOSE) up -d --wait minio
	@echo "Arquivos restaurados de $(ARQUIVO)."

admin: $(ENV_FILE) ## Cria um administrador e pede a senha no terminal (EMAIL=... NOME="...")
	@test -n "$(EMAIL)" && test -n "$(NOME)" || { echo 'Use: make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"'; exit 1; }
	$(COMPOSE) exec api python scripts/create_user.py --email "$(EMAIL)" --name "$(NOME)" --role admin

certificado: $(ENV_FILE) ## Copia o certificado raiz do HTTPS, para instalar nos computadores da equipe
	$(COMPOSE) cp proxy:/data/caddy/pki/authorities/local/root.crt financeiro-certificado-raiz.crt
	@echo "Instale financeiro-certificado-raiz.crt em cada computador (guia: docs/operations/servidor-local.md)."
