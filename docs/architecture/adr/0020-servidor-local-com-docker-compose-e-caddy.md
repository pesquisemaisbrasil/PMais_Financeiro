# ADR 0020: Servidor local com Docker Compose, Makefile e Caddy com certificado da própria máquina

**Status:** Aceito, provisório (dado real depende do DPO: Q51)
**Data:** 17/11/2026

## Contexto

O Bruno quer o Financeiro rodando num **servidor local** do escritório, com a versão da nova branch `development`, por um `Makefile` que suba o banco, a infraestrutura, a API e as telas. Escolhas dele em 17/11/2026: a equipe abre **pela rede**, com **HTTPS de certificado local**, e o banco nasce **vazio, para dados reais**. O servidor é **Ubuntu**.

O `docker-compose.yml` da raiz é só do desenvolvimento: senhas fixas, portas abertas apenas para a própria máquina e as telas apontando para `http://localhost:8010`. E o backend tem duas travas que valem aqui:

- o cookie de sessão é `Secure`, e o navegador só o guarda via HTTPS (ou em `localhost`);
- em produção, o cofre de arquivos precisa de endereço `https`.

## Decisão

- **Um compose próprio** (`deploy/compose.yml`, projeto `financeiro`), sem mexer no de desenvolvimento. Segredos e endereço vêm de `deploy/.env`, fora do git, gerado por `make configurar HOST=...` com chaves aleatórias (`openssl rand`) e que se recusa a sobrescrever um arquivo existente, porque as chaves são permanentes.
- **Caddy 2.11.7** na frente, com a **CA local** dele (`local_certs`): telas em `https://HOST` (443), API em `https://HOST:8443` e a porta 80 só redireciona. A API fica num endereço próprio, sem prefixo, porque o cookie de sessão é do caminho `/auth`. Telas e API no mesmo host são o mesmo "site" para o cookie `SameSite=Strict`. Só o Caddy publica portas.
- A API roda em **modo produção** (`ENVIRONMENT=production`): sem `/docs`, Connect só por `https` e sem dados de exemplo. Para isso, o **MinIO fala TLS** com um certificado autoassinado gerado na configuração (`deploy/certs/`, nome `minio`), e a API confia nele por `AWS_CA_BUNDLE`, que o `boto3` lê. O `minio-init` cria o bucket com `--insecure`, numa chamada única entre containers.
- **Senhas das roles do banco**: o `roles.sql` cria as roles com a senha de desenvolvimento num volume novo; o `make banco` troca as senhas pelas do `deploy/.env` a cada subida, por `psql` pela entrada padrão (a senha não aparece na lista de processos).
- **Makefile** com os passos que o Bruno pediu (`banco`, `infra`, `backend`, `frontend`, `proxy`, `subir`) e a operação: `atualizar` (backup, `git merge --ff-only` da `development`, build), `backup` (pg_dump e tar do volume do MinIO em `backups/`), `restaurar-banco` e `restaurar-arquivos` (com `CONFIRMAR=sim`), `admin` (o `create_user.py`, com a senha pedida no terminal) e `certificado` (copia a CA raiz para instalar nos computadores). Feito para o Ubuntu (bash, GNU make, Docker Engine com o Compose 2.20 ou mais novo).
- **Verificação antes do deploy** (`make verificar`, `deploy/verificar.sh`): programas, Docker acessível sem `sudo`, versão do Compose e portas livres são erros que barram o `make configurar` e o `make subir`; firewall, disco, endereço e branch são avisos. As portas em uso pelo próprio Financeiro (o container `proxy` do projeto) não contam como ocupadas, para as atualizações seguirem funcionando.
- Testado em 17/11/2026 de ponta a ponta numa máquina com Docker: `make configurar` e `make subir` (as 35 migrations num Postgres novo, o bucket por TLS, gravar e ler um arquivo pelo `boto3` confiando no certificado do MinIO), HTTPS com a CA raiz (`/login` 200, `/readyz` 200, `/docs` 404, HTTP redireciona com 308, CORS e CSP liberando a API), `make admin` e o login, `make backup`, `make restaurar-banco` e `make restaurar-arquivos`.

## Consequências

- **Dado real** num servidor do escritório: banco, arquivos cifrados, backups e o `deploy/.env` ficam nessa máquina. O DPO aprova antes de lançar dado de verdade (Q51). O guia manda guardar o `deploy/.env` num cofre e as cópias de backup fora do servidor, longe dele.
- Cada computador da equipe instala o **certificado raiz** uma vez. Sem ele, o navegador bloqueia a API (o aviso não aparece para as chamadas da tela). Apagar o volume `financeiro_caddydata` gera outra CA.
- `shortcut`: a API usa o administrador do MinIO (como no desenvolvimento, ADR 0010), e o limite de requisições é em memória (uma instância só). Evoluir quando houver outro sistema no mesmo MinIO ou mais de uma instância da API.
- `shortcut`: o backup é manual (`make backup`, e `make atualizar` faz um antes de cada versão nova). Agendar (cron ou Agendador de Tarefas) e levar a cópia para fora do servidor ficam com quem cuida da máquina.
- Alternativas descartadas: HTTP pela rede (senha e sessão sem criptografia, e o cookie teria de perder o `Secure`); a API sob `/api` no mesmo endereço (o cookie de `/auth` não seria enviado sem mudar o backend); `ENVIRONMENT` fora de produção para aceitar o MinIO em `http` (abriria `/docs` e o Connect simulado num servidor com dado real).
