# Servidor local (deploy da branch `development`)

O Financeiro inteiro numa máquina do escritório, aberto pela rede: banco (Postgres), cofre de arquivos (MinIO), API, telas e HTTPS com certificado da própria máquina (Caddy). Tudo pelo `Makefile` da raiz, com o `deploy/compose.yml`. Decisões do Bruno em 17/11/2026: acesso pela rede, HTTPS com certificado local, banco vazio para dados reais. Por que é assim: [ADR 0020](../architecture/adr/0020-servidor-local-com-docker-compose-e-caddy.md).

> **Dado real:** o servidor sobe com o banco vazio para receber dados reais. Antes de lançar dado de verdade, o DPO aprova onde ficam o banco, os backups e as chaves (Q51), e o inventário de dados vale para este servidor.

## O que precisa ter no servidor (Ubuntu)

O servidor é **Ubuntu**. Uma vez, com um usuário que tenha `sudo`:

```bash
sudo apt update && sudo apt install -y ca-certificates curl git make openssl
# Docker Engine e Compose pelo repositório oficial do Docker (o do Ubuntu pode vir sem o `--wait` do Compose)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker          # o Docker (e o Financeiro) sobe sozinho quando a máquina liga
sudo usermod -aG docker "$USER"              # saia e entre de novo para valer
sudo ufw allow OpenSSH && sudo ufw allow 80,443,8443/tcp && sudo ufw enable
```

- **Portas** 80 (só redireciona para o https), 443 (telas) e 8443 (API), abertas na rede pelo `ufw` acima. Nada mais do Financeiro fica exposto: banco e MinIO não publicam porta.
- Confira com `docker compose version` (2.20 ou mais novo).
- Um **endereço fixo** na rede (IP reservado no roteador, ou um nome que os computadores achem). Trocar o endereço depois pede `make configurar` de novo e reinstalar o certificado nos computadores.
- Internet só para baixar as imagens, o `npm ci` e o `pip` no build, e para a consulta de CNPJ e feriados (BrasilAPI). O Connect, se configurado, também.

## Primeira instalação

```bash
git clone <repositório> financeiro && cd financeiro
git checkout development
make configurar HOST=192.168.0.50     # o IP ou o nome do servidor, sem http:// nem porta
make subir                            # banco, cofre, API, telas e HTTPS (o primeiro build leva alguns minutos)
make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"   # pede a senha no terminal
make certificado                      # gera financeiro-certificado-raiz.crt para os computadores
```

- `make configurar` cria `deploy/.env` (fora do git) com **chaves novas e aleatórias**: senhas do banco e do MinIO, `SECRET_KEY`, `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`. **Guarde uma cópia desse arquivo num cofre, fora do servidor:** sem `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY` os dados guardados não abrem. Ele se recusa a gerar de novo se o arquivo já existe.
- Para ligar o **Connect**, preencha `CONNECT_BASE_URL` (só `https`), `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `deploy/.env` e rode `make subir`.
- O primeiro acesso de cada pessoa cadastra o autenticador (MFA), como no sistema de sempre. As outras contas são criadas por um administrador, ou com `make admin` (só administrador).

Abra `https://<HOST>` num computador da rede. A API fica em `https://<HOST>:8443`.

## Certificado nos computadores da equipe

O HTTPS usa uma autoridade de certificação **da própria máquina** (a CA local do Caddy). Cada computador precisa confiar nela **uma vez**; sem isso o navegador avisa que a conexão não é segura e as telas não falam com a API.

- **Windows:** copie `financeiro-certificado-raiz.crt` para o computador → clique duas vezes → **Instalar Certificado** → **Máquina Local** (ou Usuário Atual) → **Colocar todos os certificados no repositório a seguir** → **Autoridades de Certificação Raiz Confiáveis** → Concluir. Feche e abra o navegador.
- **macOS:** clique duas vezes, ele vai para o Acesso às Chaves; abra o certificado e marque **Confiar sempre**.
- **Linux:** `sudo cp financeiro-certificado-raiz.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates` (o Firefox tem a lista própria: Configurações → Certificados → Importar).

O certificado raiz fica no volume `financeiro_caddydata`. Se esse volume for apagado, nasce outro e todos os computadores precisam instalar de novo.

## Dia a dia

| Comando | O que faz |
|---|---|
| `make` | Lista os comandos |
| `make subir` | Sobe tudo (e refaz o build do que mudou). Partes: `make banco`, `make infra` (banco + cofre), `make backend`, `make frontend`, `make proxy` |
| `make status` | Cada parte e se está saudável |
| `make logs` / `make logs SERVICO=api` | Acompanha os logs (nunca têm dado pessoal: ver o inventário) |
| `make parar` | Para tudo sem apagar nada; `make subir` volta |
| `make atualizar` | Faz backup, baixa a `development` (`git merge --ff-only`) e sobe a versão nova; as migrations rodam quando a API sobe. Recusa se houver mudança local nos arquivos do repositório |
| `make backup` | Copia o banco (`backups/banco-<data>.dump`) e os arquivos (`backups/arquivos-<data>.tgz`). **Leve uma cópia para fora do servidor**, longe do `deploy/.env` |
| `make restaurar-banco ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | **Apaga** o banco e põe o do backup; a API sobe e aplica as migrations que faltarem |
| `make restaurar-arquivos ARQUIVO=backups/arquivos-....tgz CONFIRMAR=sim` | **Apaga** os arquivos do cofre e põe os do backup |

Os containers voltam sozinhos quando o servidor reinicia (`restart: unless-stopped`), desde que o Docker suba com a máquina.

## Como está montado

- `deploy/compose.yml`, projeto `financeiro`. Só o Caddy publica portas; banco, MinIO, API e telas ficam na rede interna do Docker. Volumes: `financeiro_pgdata`, `financeiro_miniodata`, `financeiro_caddydata`, `financeiro_caddyconfig`.
- A API roda em **modo produção** (`ENVIRONMENT=production`): sem `/docs`, cookie de sessão seguro, Connect só por `https`, sem dados de exemplo nem Connect simulado. O MinIO fala `https` com um certificado gerado por `make configurar` em `deploy/certs/` (fora do git), e a API confia nele por `AWS_CA_BUNDLE`.
- O banco nasce com as roles do `docker/postgres/roles.sql`; o `make banco` troca as senhas delas pelas do `deploy/.env` a cada subida. As migrations rodam com a role `financeiro_migrator`, e a API usa a `financeiro_app`.
- O `docker-compose.yml` da raiz continua sendo só o do desenvolvimento.

## Backup automático (recomendado)

O `make backup` é manual, e o `make atualizar` faz um antes de cada versão nova. Para um por dia, às 22h, no `crontab -e` do usuário que roda o Financeiro:

```
0 22 * * * cd /caminho/do/financeiro && make backup >> backups/backup.log 2>&1
```

As cópias ficam em `backups/` no próprio servidor: leve-as para fora dele (outro disco ou cofre) e apague as antigas. Para onde vão e por quanto tempo, o DPO responde (Q51).

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| `make subir` para em `db` ou `api` "unhealthy" | `make logs SERVICO=api`. Senha do banco: rode `make banco` (acerta as senhas das roles pelo `deploy/.env`) |
| O navegador avisa que a conexão não é segura | O certificado raiz não está instalado nesse computador (veja acima), ou o `HOST` é outro endereço |
| A tela abre, mas o login diz "Sem conexão com o servidor" | A porta 8443 está fechada no firewall do servidor, ou o certificado não foi instalado e o navegador bloqueia a API |
| "Os anexos não estão disponíveis agora" | O MinIO não subiu ou o certificado dele sumiu: `make status`; apagar `deploy/certs/` e rodar `make infra` gera outro |
| Porta 80, 443 ou 8443 em uso | Outro programa no servidor usa a porta (Apache, nginx): `sudo ss -ltnp \| grep -E ':(80\|443\|8443) '`, pare-o ou use outra máquina |
| `permission denied ... docker.sock` | O usuário não está no grupo `docker`: `sudo usermod -aG docker "$USER"` e entre de novo |
| `curl` no Windows falha com `CERT_TRUST_REVOCATION_STATUS_UNKNOWN` | O `curl` do Windows checa revogação, que a CA local não tem: use `--ssl-no-revoke`. Os navegadores não exigem isso |
| Troquei o IP do servidor | `deploy/.env`: mude `SERVER_HOST`, rode `make subir` (refaz o build das telas) e reinstale o certificado nos computadores se o nome mudou |
