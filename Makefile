# Deploy do Financeiro no servidor local (branch development): banco, cofre de arquivos, API, telas
# e o Caddy. Dois jeitos de abrir (ADR 0027), escolhidos no make configurar:
#   IP=192.168.30.15                        pelo IP: o Caddy cuida do HTTPS com o certificado da
#                                           própria máquina, nas portas 8444 (telas) e 8443 (API)
#   DOMINIO=financeiro.pesquisemais.com.br  por nome, atrás do nginx do servidor, como o P+ Connect
# As portas 80 e 443 ficam com o nginx nos dois. Guia: DEPLOY.md
#
# Primeira vez, no servidor, dentro da pasta do repositório, com o pacote do banco local em backups/
# (scripts/gerar-dump-local.sh), tudo de uma vez:
#   make subir-projeto IP=192.168.30.15 CONFIRMAR=sim       (ou DOMINIO=<nome>)
# Ou por partes, sem o pacote:
#   make verificar IP=192.168.30.15     confere programas, Docker, portas, firewall e disco
#   make configurar IP=192.168.30.15    verifica de novo e gera deploy/.env com chaves novas
#   make subir                          sobe tudo (banco, cofre, API, telas e o Caddy)
#   make certificado                    pelo IP: para instalar nos computadores da equipe
#   make nginx                          por nome: o arquivo do nginx e como ligar o HTTPS (certbot)
#   make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"
# Depois: make atualizar (backup, baixa a development e sobe a versão nova), ou make agendar para isso
# rodar sozinho todo dia às 22h. Deu problema numa versão nova:
# make voltar ARQUIVO=backups/banco-<data>.dump CONFIRMAR=sim. Do IP para o nome (ou o contrário):
# make trocar-endereco DOMINIO=<nome>. `make` sozinho lista tudo.

SHELL := /bin/bash
.DEFAULT_GOAL := ajuda
BRANCH := development
ENV_FILE := deploy/.env
# junta o compose.yml com o do modo do deploy/.env (compose.ip.yml ou compose.nginx.yml)
COMPOSE := bash deploy/compose.sh
AGORA := $(shell date +%Y%m%d-%H%M%S)

ifeq ($(origin HOST),command line)
$(error HOST agora é IP: make configurar IP=192.168.30.15, ou DOMINIO=<nome> atrás do nginx - DEPLOY.md seção 2)
endif
# o endereço pedido na linha de comando, conferido pelo deploy/endereco.sh
ENDERECO_VARS = IP="$(IP)" PORTA_TELAS="$(PORTA_TELAS)" PORTA_API="$(PORTA_API)" \
	DOMINIO="$(DOMINIO)" DOMINIO_API="$(DOMINIO_API)" PORTA_LOCAL="$(PORTA_LOCAL)"

.PHONY: ajuda verificar configurar banco infra backend frontend proxy subir conferir parar status logs \
	atualizar voltar backup restaurar-banco restaurar-arquivos restaurar-local conferir-pacote subir-projeto \
	agendar desagendar admin conta \
	definir-nivel liberar-navegador redefinir-senha certificado nginx trocar-endereco

ajuda: ## Lista os comandos
	@echo "Financeiro no servidor local (branch $(BRANCH)). Guia: DEPLOY.md"
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN { FS = ":.*## " } { printf "  make %-20s %s\n", $$1, $$2 }'

verificar: ## Confere se o servidor está pronto: programas, Docker, portas, firewall, disco, endereço (IP=... ou DOMINIO=...)
	@if [ -n "$(IP)$(DOMINIO)" ]; then endereco=$$($(ENDERECO_VARS) bash deploy/endereco.sh) || exit 1; else endereco=; fi; \
	  env $$endereco bash deploy/verificar.sh

configurar: ## Primeira vez: verifica o servidor e gera deploy/.env com chaves novas (IP=<IP do servidor> ou DOMINIO=<nome>)
	@test ! -f $(ENV_FILE) || { echo "$(ENV_FILE) já existe, e as chaves dele são permanentes: não gero outras. Para trocar o endereço: make trocar-endereco"; exit 1; }
	@endereco=$$($(ENDERECO_VARS) bash deploy/endereco.sh) || exit 1; \
	  env $$endereco bash deploy/verificar.sh || exit 1; \
	  command -v openssl >/dev/null || { echo "Falta o openssl neste servidor."; exit 1; }; \
	  umask 077 && { \
	  echo "# Gerado por make configurar em $(AGORA). Fora do git. Guarde uma cópia num cofre, longe deste"; \
	  echo "# servidor: sem ENCRYPTION_KEY, PIX_SECRET_KEY e FILES_MASTER_KEY os dados guardados não abrem."; \
	  echo "# Endereço (make trocar-endereco troca): MODO=ip abre em https://IP:PORTA_TELAS (API em :PORTA_API);"; \
	  echo "# MODO=nginx abre em https://DOMINIO (API em https://DOMINIO_API), com o Caddy em 127.0.0.1:PORTA_LOCAL."; \
	  printf '%s\n' "$$endereco"; \
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
	@echo "Pronto: $(ENV_FILE) criado para $$($(MAKE) --no-print-directory -s enderecos). Guarde uma cópia dele num cofre. Agora: make subir"

$(ENV_FILE):
	@echo "Falta $(ENV_FILE). Rode primeiro: make configurar IP=<IP do servidor> (ou DOMINIO=<nome>, atrás do nginx)"; exit 1

# Os endereços que a equipe abre, pelo deploy/.env (uma linha, para as mensagens)
.PHONY: enderecos
enderecos:
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" = ip ]; then echo "https://$$IP:$$PORTA_TELAS (API em https://$$IP:$$PORTA_API)"; \
	  else echo "https://$$DOMINIO (API em https://$$DOMINIO_API)"; fi

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

proxy: $(ENV_FILE) ## Sobe o Caddy na frente das telas e da API (pelo IP, com o HTTPS; por nome, só em 127.0.0.1)
	$(COMPOSE) up -d --wait proxy

subir: verificar frontend proxy ## Verifica o servidor, sobe tudo (banco, cofre, API, telas e Caddy) e confere
	@$(MAKE) --no-print-directory conferir
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" = ip ]; then depois="make admin e make certificado"; else depois="make nginx e make admin"; fi && \
	  echo "Pronto: $$($(MAKE) --no-print-directory -s enderecos), versão $$(git rev-parse --short HEAD). Primeira vez? $$depois"

# O curl do Windows (Schannel) checa revogação, que a CA local não tem; no Ubuntu não precisa.
CURL_TLS := $(if $(findstring Schannel,$(shell curl -V 2>/dev/null)),--ssl-no-revoke,)

# Pelo IP: pelo HTTPS do Caddy, com o certificado raiz dele, como um computador da equipe.
# Por nome: primeiro pelo Caddy na porta local (o que o nginx alcança), que é o que barra o subir;
# depois pelo HTTPS do nginx, só com aviso, porque na primeira instalação o nginx é ligado depois.
conferir: $(ENV_FILE) ## Testa o sistema no ar (telas e API com o banco) como um computador da equipe
	@set -a && . ./$(ENV_FILE) && set +a && \
	if [ "$$MODO" = ip ]; then \
	  ca=$$(mktemp) && trap 'rm -f "$$ca"' EXIT && \
	  $(COMPOSE) cp proxy:/data/caddy/pki/authorities/local/root.crt "$$ca" >/dev/null 2>&1 || \
	    { echo "  [ERRO]  O HTTPS (proxy) não está no ar: make subir"; exit 1; }; \
	  for url in "https://$$IP:$$PORTA_TELAS/login" "https://$$IP:$$PORTA_API/readyz"; do \
	    if curl -fsS -o /dev/null --max-time 30 $(CURL_TLS) --cacert "$$ca" "$$url"; then echo "  [ok]    $$url"; \
	    else echo "  [ERRO]  $$url não respondeu: make status e make logs SERVICO=proxy"; exit 1; fi; \
	  done; \
	else \
	  porta=$${PORTA_LOCAL:-8089} && \
	  for alvo in "$$DOMINIO /login" "$$DOMINIO_API /readyz"; do \
	    set -- $$alvo; \
	    if curl -fsS -o /dev/null --max-time 30 -H "Host: $$1" "http://127.0.0.1:$$porta$$2"; then \
	      echo "  [ok]    $$1$$2 pelo Caddy (127.0.0.1:$$porta)"; \
	    else echo "  [ERRO]  $$1$$2 não respondeu no Caddy (127.0.0.1:$$porta): make status e make logs SERVICO=proxy"; exit 1; fi; \
	  done; \
	  for url in "https://$$DOMINIO/login" "https://$$DOMINIO_API/readyz"; do \
	    if curl -fsS -o /dev/null --max-time 15 "$$url" 2>/dev/null; then echo "  [ok]    $$url"; \
	    else echo "  [aviso] $$url ainda não abre pelo HTTPS: o nginx e o certificado estão ligados? (make nginx)"; fi; \
	  done; \
	fi

certificado: $(ENV_FILE) ## Pelo IP: copia o certificado raiz do HTTPS, para instalar nos computadores da equipe
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" != ip ]; then echo "Por nome, o certificado é do nginx (certbot): os computadores da equipe não instalam nada."; exit 0; fi && \
	  $(COMPOSE) cp proxy:/data/caddy/pki/authorities/local/root.crt financeiro-certificado-raiz.crt && \
	  echo "Instale financeiro-certificado-raiz.crt em cada computador (DEPLOY.md, seção 3)."

trocar-endereco: $(ENV_FILE) ## Troca o endereço (IP=... ou DOMINIO=...) sem mexer em chaves, banco e arquivos, e sobe de novo
	@endereco=$$($(ENDERECO_VARS) bash deploy/endereco.sh) || exit 1; \
	  env $$endereco bash deploy/verificar.sh || exit 1; \
	  mkdir -p backups && umask 077 && cp $(ENV_FILE) backups/env-antes-do-endereco-$(AGORA).env && \
	  { grep -vE '^(MODO|IP|PORTA_TELAS|PORTA_API|DOMINIO|DOMINIO_API|PORTA_LOCAL|SERVER_HOST)=' $(ENV_FILE); printf '%s\n' "$$endereco"; } \
	    > $(ENV_FILE).novo && mv $(ENV_FILE).novo $(ENV_FILE) && \
	  echo "Endereço trocado no $(ENV_FILE) (o de antes ficou em backups/env-antes-do-endereco-$(AGORA).env). Subindo de novo..."
	$(MAKE) --no-print-directory subir
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" = ip ]; then echo "Agora: make certificado e instale o arquivo nos computadores que ainda não têm (DEPLOY.md, seção 3)."; \
	  else echo "Agora: make nginx e os comandos dele, com o certbot (DEPLOY.md, seção 4). Os computadores não precisam mais do certificado."; fi

nginx: $(ENV_FILE) ## Por nome: gera financeiro.nginx.conf com os endereços do deploy/.env e mostra como ligá-lo no nginx com HTTPS
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" != nginx ]; then echo "Pelo IP o nginx não entra: o Caddy cuida do HTTPS. Para ir para trás do nginx: make trocar-endereco DOMINIO=<nome>"; exit 1; fi && \
	  sed -e "s/{{DOMINIO_API}}/$$DOMINIO_API/g" -e "s/{{DOMINIO}}/$$DOMINIO/g" -e "s/{{PORTA_LOCAL}}/$${PORTA_LOCAL:-8089}/g" \
	    deploy/nginx/financeiro.conf > financeiro.nginx.conf && \
	  echo "Gerado financeiro.nginx.conf: https://$$DOMINIO e https://$$DOMINIO_API -> 127.0.0.1:$${PORTA_LOCAL:-8089}." && \
	  echo "Para ligar (uma vez, com sudo; não mexe nos outros sistemas do nginx):" && \
	  echo "  sudo cp financeiro.nginx.conf /etc/nginx/sites-available/financeiro.conf" && \
	  echo "  sudo ln -sf /etc/nginx/sites-available/financeiro.conf /etc/nginx/sites-enabled/financeiro.conf" && \
	  echo "  sudo nginx -t && sudo systemctl reload nginx" && \
	  echo "  sudo certbot --nginx --redirect -d $$DOMINIO -d $$DOMINIO_API" && \
	  echo "Copiar de novo apaga o HTTPS que o certbot pôs no arquivo: depois de copiar, rode o certbot outra vez."

parar: $(ENV_FILE) ## Para tudo, sem apagar nada (make subir volta)
	$(COMPOSE) stop

status: $(ENV_FILE) ## Mostra a versão no ar, a atualização automática e cada parte, se está saudável
	@echo "Versão: $$(git log -1 --format='%h %s (%cd)' --date=format:'%d/%m/%Y %H:%M') na $$(git rev-parse --abbrev-ref HEAD)"
	@if crontab -l 2>/dev/null | grep -qF "# $(CRON_MARCA)"; then \
	  echo "Atualização automática: ligada, às $$(crontab -l | grep -F "# $(CRON_MARCA)" | awk '{ print $$2 }')h. Logs em backups/logs/"; \
	else echo "Atualização automática: desligada (make agendar)"; fi
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

# backups/local-<data>-banco.dump -> os outros dois arquivos do pacote do scripts/gerar-dump-local.sh
ARQUIVOS_DO_PACOTE = $(patsubst %-banco.dump,%-arquivos.tgz,$(ARQUIVO))
CHAVES_DO_PACOTE = $(patsubst %-banco.dump,%-chaves.env,$(ARQUIVO))
# as chaves que abrem o que está guardado: autenticadores, anexos e a chave de repetição dos relatórios
CHAVES_QUE_VIAJAM := ENCRYPTION_KEY PIX_SECRET_KEY FILES_MASTER_KEY

conferir-pacote: ## Confere o pacote do banco local sem mexer em nada: os 3 arquivos, as chaves e a versão do banco (ARQUIVO=backups/local-...-banco.dump)
	@case "$(ARQUIVO)" in backups/local-*-banco.dump) ;; *) echo "Use o pacote do scripts/gerar-dump-local.sh, na pasta backups/: ARQUIVO=backups/local-<data>-banco.dump"; exit 1;; esac
	@for arquivo in "$(ARQUIVO)" "$(ARQUIVOS_DO_PACOTE)" "$(CHAVES_DO_PACOTE)"; do \
	  test -f "$$arquivo" || { echo "Não achei $$arquivo: os 3 arquivos do pacote vão juntos para backups/."; exit 1; }; done
	@for chave in $(CHAVES_QUE_VIAJAM); do \
	  grep -Eq "^$$chave=.+" "$(CHAVES_DO_PACOTE)" || { echo "Falta $$chave em $(CHAVES_DO_PACOTE)."; exit 1; }; done
	@# o banco do pacote não pode estar numa versão que este código ainda não conhece. Lido por um
	@# Postgres de passagem (a mesma imagem do banco), para conferir antes de subir qualquer coisa
	@versao=$$(docker run --rm -i postgres:16 pg_restore -a -t alembic_version -f - < "$(ARQUIVO)" | awk '/^COPY /{ getline; print; exit }') && \
	  test -n "$$versao" || { echo "Não li a versão do banco em $(ARQUIVO): o arquivo veio inteiro?"; exit 1; }; \
	  grep -q -- "$$versao" backend/alembic/versions/*.py || \
	    { echo "O banco do pacote está na versão $$versao, que este código ainda não tem: make atualizar antes."; exit 1; }; \
	  echo "Pacote $(ARQUIVO) conferido: os 3 arquivos, as chaves e o banco na versão $$versao, que este código tem."

restaurar-local: $(ENV_FILE) ## APAGA o banco e os arquivos e põe os do pacote da máquina do desenvolvimento, com as chaves dele (ARQUIVO=backups/local-...-banco.dump CONFIRMAR=sim)
	@test "$(CONFIRMAR)" = sim || { echo "Isto APAGA o banco e os arquivos deste servidor e põe os do pacote, com as chaves dele. Rode com ARQUIVO=backups/local-<data>-banco.dump CONFIRMAR=sim"; exit 1; }
	@$(MAKE) --no-print-directory conferir-pacote ARQUIVO="$(ARQUIVO)"
	@$(MAKE) --no-print-directory banco
	$(MAKE) --no-print-directory backup AGORA=$(AGORA)
	@umask 077 && cp $(ENV_FILE) backups/env-antes-do-local-$(AGORA).env && \
	  awk -F= -v viajam="$(CHAVES_QUE_VIAJAM)" ' \
	    BEGIN { split(viajam, lista, " "); for (i in lista) viaja[lista[i]] = 1 } \
	    NR == FNR { if ($$1 in viaja) nova[$$1] = substr($$0, length($$1) + 2); next } \
	    ($$1 in nova) { print $$1 "=" nova[$$1]; feita[$$1] = 1; next } { print } \
	    END { for (c in nova) if (!(c in feita)) print c "=" nova[c] }' \
	    "$(CHAVES_DO_PACOTE)" $(ENV_FILE) > $(ENV_FILE).novo && mv $(ENV_FILE).novo $(ENV_FILE)
	@echo "Chaves do pacote no $(ENV_FILE). O de antes ficou em backups/env-antes-do-local-$(AGORA).env."
	$(MAKE) --no-print-directory restaurar-banco ARQUIVO="$(ARQUIVO)" CONFIRMAR=sim
	$(MAKE) --no-print-directory restaurar-arquivos ARQUIVO="$(ARQUIVOS_DO_PACOTE)" CONFIRMAR=sim
	$(MAKE) --no-print-directory subir
	@echo "Pronto: no ar o banco e os arquivos de $(ARQUIVO). As contas de acesso são as da máquina do desenvolvimento."
	@echo "Guarde o $(ENV_FILE) novo num cofre e apague $(CHAVES_DO_PACOTE) daqui."

# O pacote do subir-projeto: o mais novo de backups/ (os nomes levam a data), ou PACOTE=...
PACOTE ?= $(lastword $(sort $(wildcard backups/local-*-banco.dump)))

subir-projeto: ## Primeira instalação de uma vez: configura, sobe, põe o banco do pacote de backups/, liga as 22h e gera o certificado ou o arquivo do nginx (IP=... ou DOMINIO=..., CONFIRMAR=sim)
	@test "$(CONFIRMAR)" = sim || { echo "Isto instala o Financeiro e põe nele o banco do pacote de backups/, APAGANDO o banco que este servidor tiver. Rode com IP=<IP do servidor> (ou DOMINIO=<nome>) CONFIRMAR=sim"; exit 1; }
	@test -f $(ENV_FILE) || test -n "$(IP)$(DOMINIO)" || { echo 'Diga o endereço: make subir-projeto IP=192.168.30.15 CONFIRMAR=sim (ou DOMINIO=<nome>, atrás do nginx)'; exit 1; }
	@test -n "$(PACOTE)" || { echo "Não achei o pacote do banco em backups/ (local-<data>-banco.dump, -arquivos.tgz e -chaves.env, do scripts/gerar-dump-local.sh)."; \
	  echo "Copie os 3 arquivos para backups/ e rode de novo. Sem banco para trazer: make configurar, make subir e make admin (DEPLOY.md)."; exit 1; }
	@echo "== 1/5 O pacote: $(PACOTE)"
	@$(MAKE) --no-print-directory conferir-pacote ARQUIVO="$(PACOTE)"
	@echo "== 2/5 A configuração do servidor"
	@if [ -f $(ENV_FILE) ]; then echo "$(ENV_FILE) já existe: sigo com ele (as chaves do pacote entram no passo 4)."; \
	  else $(MAKE) --no-print-directory configurar $(ENDERECO_VARS); fi
	@echo "== 3/5 Tudo no ar (banco, cofre, API, telas e o Caddy)"
	$(MAKE) --no-print-directory subir
	@echo "== 4/5 O banco, os arquivos e as chaves do pacote"
	$(MAKE) --no-print-directory restaurar-local ARQUIVO="$(PACOTE)" CONFIRMAR=sim
	@echo "== 5/5 A atualização automática e o certificado (pelo IP) ou o arquivo do nginx (por nome)"
	$(MAKE) --no-print-directory agendar
	@set -a && . ./$(ENV_FILE) && set +a && \
	  if [ "$$MODO" = ip ]; then $(MAKE) --no-print-directory certificado; else $(MAKE) --no-print-directory nginx; fi
	@set -a && . ./$(ENV_FILE) && set +a && echo && \
	  if [ "$$MODO" = ip ]; then falta="Instale financeiro-certificado-raiz.crt em cada computador da equipe (DEPLOY.md, seção 3)."; \
	  else falta="Ligue o nginx e o HTTPS com os comandos acima (DEPLOY.md, seção 4), se ainda não ligou."; fi && \
	  echo "Financeiro no ar: $$($(MAKE) --no-print-directory -s enderecos), com o banco de $(PACOTE)." && \
	  echo "  - $$falta" && \
	  echo "  - Entre com as contas da máquina do desenvolvimento: mesma senha e mesmo autenticador." && \
	  echo "  - O primeiro computador de cada conta vira pedido em Acessos; o super admin entra direto e libera." && \
	  echo "  - Atualização automática ligada: todo dia às $(HORA)h (make status mostra)." && \
	  echo "  - Guarde o $(ENV_FILE) num cofre e apague $(patsubst %-banco.dump,%-chaves.env,$(PACOTE))."

# A linha do cron leva o caminho do repositório: dá para ligar e desligar sem mexer nas outras.
HORA ?= 22
CRON_MARCA = financeiro-atualizar $(CURDIR)

agendar: ## Liga a atualização automática: todo dia às 22h, backup e versão nova da development (HORA=22)
	@command -v crontab >/dev/null || { echo "Falta o cron: sudo apt install -y cron"; exit 1; }
	@case "$(HORA)" in [0-9]|1[0-9]|2[0-3]) ;; *) echo "HORA vai de 0 a 23: $(HORA)"; exit 1;; esac
	@{ crontab -l 2>/dev/null | grep -vF "# $(CRON_MARCA)"; \
	  echo '0 $(HORA) * * * cd "$(CURDIR)" && bash deploy/atualizar-agendado.sh # $(CRON_MARCA)'; } | crontab -
	@echo "Agendado: todo dia às $(HORA)h, a versão nova da $(BRANCH) (ou só o backup, se não houver). Logs em backups/logs/. Para desligar: make desagendar"

desagendar: ## Desliga a atualização automática (tira a linha do cron)
	@command -v crontab >/dev/null || { echo "Falta o cron: sudo apt install -y cron"; exit 1; }
	@crontab -l 2>/dev/null | grep -vF "# $(CRON_MARCA)" | crontab -
	@echo "Atualização automática desligada. O backup diário que vinha dela também parou: make backup, ou make agendar de novo."

admin: $(ENV_FILE) ## Cria um administrador e pede a senha no terminal (EMAIL=... NOME="...")
	@test -n "$(EMAIL)" && test -n "$(NOME)" || { echo 'Use: make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"'; exit 1; }
	$(COMPOSE) exec api python scripts/create_user.py --email "$(EMAIL)" --name "$(NOME)" --role admin

conta: $(ENV_FILE) ## Cria uma conta da equipe com senha inicial, que a pessoa troca no primeiro acesso; pede a senha inicial no terminal (EMAIL=... NOME="..." NIVEL=financeiro|admin)
	@test -n "$(EMAIL)" && test -n "$(NOME)" || { echo 'Use: make conta EMAIL=pessoa@pesquisemais.com.br NOME="Nome da pessoa" NIVEL=financeiro'; exit 1; }
	@case "$(or $(NIVEL),financeiro)" in financeiro|admin) ;; *) echo "NIVEL é financeiro (usuário) ou admin: $(NIVEL)"; exit 1;; esac
	$(COMPOSE) exec api python scripts/create_user.py --email "$(EMAIL)" --name "$(NOME)" --role "$(or $(NIVEL),financeiro)" --primeiro-acesso

definir-nivel: $(ENV_FILE) ## Troca o nível de uma conta: financeiro, admin ou superadmin (EMAIL=... NIVEL=...)
	@test -n "$(EMAIL)" && test -n "$(NIVEL)" || { echo 'Use: make definir-nivel EMAIL=voce@pesquisemais.com.br NIVEL=superadmin'; exit 1; }
	$(COMPOSE) exec api python scripts/definir_nivel.py --email "$(EMAIL)" --nivel "$(NIVEL)"

liberar-navegador: $(ENV_FILE) ## Libera o computador que a pessoa pediu por último, sem outro admin (EMAIL=...)
	@test -n "$(EMAIL)" || { echo 'Use: make liberar-navegador EMAIL=pessoa@pesquisemais.com.br'; exit 1; }
	$(COMPOSE) exec api python scripts/liberar_navegador.py --email "$(EMAIL)"

redefinir-senha: $(ENV_FILE) ## Esqueceu a senha: pede uma senha provisória no terminal, que a pessoa troca no próximo login (EMAIL=...)
	@test -n "$(EMAIL)" || { echo 'Use: make redefinir-senha EMAIL=pessoa@pesquisemais.com.br'; exit 1; }
	$(COMPOSE) exec api python scripts/redefinir_senha.py --email "$(EMAIL)"
