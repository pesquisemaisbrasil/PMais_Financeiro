# Deploy do Financeiro no servidor local

Como instalar e manter o Financeiro inteiro numa máquina do escritório (**Ubuntu**), aberto pela rede com HTTPS, a partir da branch `development`. Tudo é feito pelo `Makefile` da raiz, com os arquivos de `deploy/`. Decisões do Bruno em 17/11/2026: acesso pela rede, HTTPS com certificado da própria máquina, banco vazio para dados reais. Por que é assim: [ADR 0020](docs/architecture/adr/0020-servidor-local-com-docker-compose-e-caddy.md).

> **Dado real:** o servidor sobe com o banco vazio e passa a receber os dados reais da equipe a partir daí (decisão do Bruno, 23/11/2026). O inventário de dados vale para este servidor. **Antes do primeiro lançamento real:** guarde uma cópia do `deploy/.env` num cofre fora da máquina (sem ela, anexos, chaves Pix e autenticadores não abrem mais) e leve as cópias de backup para fora do servidor. Para onde e por quanto tempo, o DPO responde (Q51 em [perguntas-abertas](docs/planning/perguntas-abertas.md)).

## O que sobe

| Parte | O que é | Onde a equipe acessa |
|---|---|---|
| Banco | Postgres 16 | não é exposto |
| Cofre de arquivos | MinIO (anexos cifrados), com TLS | não é exposto |
| API | o backend, em modo produção; as migrations rodam quando ela sobe | `https://<IP do servidor>:8443` |
| Telas | o frontend | `https://<IP do servidor>` |
| HTTPS | Caddy, com certificado da própria máquina | portas 80 (redireciona), 443 e 8443 |
| Feriados | feriados.dev com o banco dele: os feriados estaduais e municipais das 27 capitais, buscados pela API a cada 6 horas ([ADR 0024](docs/architecture/adr/0024-feriados-das-capitais-pelo-feriados-dev.md)) | não é exposto |

## 1. Preparar o servidor (uma vez)

Com um usuário que tenha `sudo`:

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

- **Endereço fixo** na rede: IP reservado no roteador, ou um nome que os computadores achem. Trocar o endereço depois pede `make configurar` de novo (veja "Troquei o IP" em [Solução de problemas](#solução-de-problemas)).
- **Portas:** 80 (só redireciona para o https), 443 (telas) e 8443 (API). Nada mais do Financeiro fica exposto: banco e MinIO não publicam porta.
- **Compose** 2.20 ou mais novo: confira com `docker compose version`.
- **Internet** só para baixar as imagens, o `npm ci` e o `pip` no build, e para a consulta de CNPJ e de feriados (BrasilAPI). O Connect, se configurado, também.
- **Disco:** pelo menos 10 GB livres.

## 2. Primeira instalação

No servidor, com o seu usuário (não o root):

```bash
git clone https://github.com/pesquisemaisbrasil/PMais_Financeiro.git financeiro
cd financeiro
git checkout development

make verificar HOST=192.168.0.50     # confere se o servidor está pronto; não muda nada
make configurar HOST=192.168.0.50    # gera deploy/.env com chaves novas (só se a verificação passar)
make subir                           # sobe tudo e termina testando pelo HTTPS (o primeiro build leva alguns minutos)
make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"    # primeiro administrador; pede a senha no terminal
make definir-nivel EMAIL=voce@pesquisemais.com.br NIVEL=superadmin   # quem desenvolve vira super admin (vê Demandas)
make certificado                     # gera financeiro-certificado-raiz.crt para os computadores
```

Troque `192.168.0.50` pelo IP (ou nome) do servidor, sem `http://` nem porta.

O que cada passo faz:

- **`make verificar`** (`deploy/verificar.sh`) confere, sem mudar nada. **Erros** impedem o deploy: falta git, make ou openssl; Docker parado ou só com `sudo`; Compose antes da 2.20; portas 80, 443 ou 8443 ocupadas. **Avisos** não impedem: o `ufw` sem as portas, menos de 10 GB livres, o `HOST` não ser um IP desta máquina (ou um nome que a rede acha), não estar na branch `development`. Cada linha com problema traz o comando para resolver. O `make configurar` roda a verificação antes e não gera nada se houver erro; o `make subir` também roda, e aceita as portas quando quem as usa é o próprio Financeiro.
- **`make configurar`** cria o `deploy/.env` (fora do git) com **chaves novas e aleatórias**: senhas do banco e do MinIO, `SECRET_KEY`, `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`. Ele se recusa a gerar de novo se o arquivo já existe.
- **`make admin`** cria um administrador. As outras contas são criadas por um administrador na tela, ou também com `make admin`.
- **`make definir-nivel`** troca o nível de uma conta que já existe: `financeiro` (usuário), `admin` ou `superadmin` ([ADR 0023](docs/architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)). Vale no próximo clique da pessoa.

Depois:

1. **Guarde o `deploy/.env` num cofre, fora do servidor.** Sem `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`, os dados guardados não abrem. Ele nunca vai para o git.
2. **Instale o certificado em cada computador da equipe** (seção 3).
3. **Abra `https://<IP do servidor>`** num computador da rede e entre com o administrador. O primeiro acesso de cada pessoa cadastra o autenticador (MFA). O primeiro computador de cada pessoa fica liberado sozinho; os outros viram pedido na tela **Acessos** para um administrador liberar (o super admin não passa por isso).
4. **Agende o backup diário** (seção 4).
5. Para ligar o **P+ Connect**: preencha `CONNECT_BASE_URL` (só `https`), `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `deploy/.env` e rode `make subir`.

## 3. Certificado nos computadores da equipe

O HTTPS usa uma autoridade de certificação **da própria máquina** (a CA local do Caddy). Cada computador precisa confiar nela **uma vez**; sem isso o navegador avisa que a conexão não é segura e as telas não falam com a API. O `make certificado` gera o arquivo `financeiro-certificado-raiz.crt`.

- **Windows:** copie o arquivo para o computador → clique duas vezes → **Instalar Certificado** → **Máquina Local** (ou Usuário Atual) → **Colocar todos os certificados no repositório a seguir** → **Autoridades de Certificação Raiz Confiáveis** → Concluir. Feche e abra o navegador.
- **macOS:** clique duas vezes; ele vai para o Acesso às Chaves. Abra o certificado e marque **Confiar sempre**.
- **Linux:** `sudo cp financeiro-certificado-raiz.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`. O Firefox tem a lista própria: Configurações → Certificados → Importar.

O certificado raiz fica no volume `financeiro_caddydata`. Se esse volume for apagado, nasce outro, e todos os computadores precisam instalar de novo.

## 4. Backup

O `make backup` copia o banco (`backups/banco-<data>.dump`) e os arquivos (`backups/arquivos-<data>.tgz`) e anota a versão do código (`backups/versao-<data>.txt`). O `make atualizar` faz um antes de cada versão nova.

Para um por dia, às 22h, no `crontab -e` do usuário que roda o Financeiro:

```
0 22 * * * cd /caminho/do/financeiro && make backup >> backups/backup.log 2>&1
```

As cópias ficam em `backups/` no próprio servidor: **leve-as para fora dele** (outro disco ou cofre), longe do `deploy/.env`, e apague as antigas. Para onde vão e por quanto tempo, o DPO responde (Q51).

## 5. Versão nova

Quando a `development` tiver uma versão nova:

```bash
make atualizar
```

Ele faz backup, baixa a `development` (`git merge --ff-only`), gera as imagens novas, aplica as migrations (quando a API sobe) e confere pelo HTTPS. Recusa se alguém tiver mudado arquivos do repositório no servidor. Se a versão nova não subir, ele mostra o `make voltar` pronto para copiar.

## 6. Se a versão nova der problema

```bash
make voltar ARQUIVO=backups/banco-<data do atualizar>.dump CONFIRMAR=sim
```

Ele volta o código para a versão desse backup, **apaga o banco atual e põe o do backup** (o que foi lançado depois do backup se perde), gera a API e as telas dessa versão e confere pelo HTTPS. Os arquivos anexados ficam como estão. O servidor fica numa versão "solta" (fora da `development`) até a correção sair; aí o `make atualizar` volta para a `development`.

Se o problema não for no banco (a versão nova só tem um defeito de tela, por exemplo), prefira esperar a correção e rodar `make atualizar` de novo: assim nada lançado se perde.

## Comandos

| Comando | O que faz |
|---|---|
| `make` | Lista os comandos |
| `make verificar` | Confere programas, Docker, portas, firewall, disco, endereço e branch, sem mudar nada |
| `make configurar HOST=...` | Primeira vez: verifica e gera o `deploy/.env` com chaves novas |
| `make subir` | Verifica o servidor, sobe tudo (e refaz o build do que mudou) e termina com o `make conferir`. Por partes: `make banco`, `make infra` (banco + cofre), `make backend`, `make frontend`, `make proxy` |
| `make conferir` | Abre as telas e a API pelo HTTPS, com o certificado raiz, como um computador da equipe faria; a API só responde se o banco estiver no ar |
| `make status` | A versão no ar (commit, data e branch) e cada parte, se está saudável |
| `make logs` / `make logs SERVICO=api` | Acompanha os logs (nunca têm dado pessoal: veja o inventário de dados) |
| `make parar` | Para tudo sem apagar nada; `make subir` volta |
| `make atualizar` | Backup, baixa a `development` e sobe a versão nova (seção 5) |
| `make voltar ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | Volta à versão do código desse backup **e ao banco dele** (seção 6) |
| `make backup` | Backup na hora, em `backups/` (seção 4) |
| `make restaurar-banco ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | **Apaga** o banco e põe o do backup; a API sobe e aplica as migrations que faltarem |
| `make restaurar-arquivos ARQUIVO=backups/arquivos-....tgz CONFIRMAR=sim` | **Apaga** os arquivos do cofre e põe os do backup |
| `make admin EMAIL=... NOME="..."` | Cria um administrador (pede a senha) |
| `make definir-nivel EMAIL=... NIVEL=...` | Troca o nível de uma conta: `financeiro` (usuário), `admin` ou `superadmin` |
| `make liberar-navegador EMAIL=...` | Libera o computador que a pessoa pediu por último, quando não há outro administrador para liberar na tela Acessos |
| `make certificado` | Copia o certificado raiz do HTTPS, para instalar nos computadores da equipe |

Os containers voltam sozinhos quando o servidor reinicia (`restart: unless-stopped`), desde que o Docker suba com a máquina. Os logs têm tamanho limitado (5 arquivos de 10 MB por parte), então não enchem o disco.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `make verificar` mostra `[ERRO]` | Cada linha traz o comando para resolver; rode `make verificar` de novo depois |
| Porta 80, 443 ou 8443 em uso | Outro programa usa a porta (Apache, nginx): `sudo ss -ltnp \| grep -E ':(80\|443\|8443) '` mostra quem. Se ninguém precisa dele, `sudo systemctl disable --now <nome>`; se precisa continuar, as portas do Financeiro ainda são fixas: fale com o desenvolvimento |
| `permission denied ... docker.sock` | O usuário não está no grupo `docker`: `sudo usermod -aG docker "$USER"` e entre de novo |
| `make subir` para com uma parte "unhealthy" | `make logs SERVICO=api` (ou `db`, `proxy`). Senha do banco: rode `make banco` (acerta as senhas das roles pelo `deploy/.env`) |
| O navegador avisa que a conexão não é segura | O certificado raiz não está instalado nesse computador (seção 3), ou o `HOST` é outro endereço |
| A tela abre, mas o login diz "Sem conexão com o servidor" | A porta 8443 está fechada no firewall do servidor, ou o certificado não foi instalado e o navegador bloqueia a API |
| "Os anexos não estão disponíveis agora" | O MinIO não subiu ou o certificado dele sumiu: `make status`; apagar `deploy/certs/` e rodar `make infra` gera outro |
| `make conferir` falha, mas `make status` mostra tudo saudável | O `SERVER_HOST` não chega até esta máquina (IP errado ou nome que não resolve): `make verificar` mostra o aviso |
| Troquei o IP do servidor | No `deploy/.env`, mude o `SERVER_HOST` e rode `make subir` (refaz o build das telas e gera o certificado do endereço novo). O certificado raiz continua o mesmo, então os computadores não precisam reinstalar |
| Alguém vê "Computador ainda não liberado" depois da senha e do código | É um computador (ou navegador) novo, ou a pessoa limpou os dados do navegador. Outro admin libera em **Acessos**. Sem outro admin: `make liberar-navegador EMAIL=pessoa@pesquisemais.com.br` libera o pedido mais recente dela ([ADR 0022](docs/architecture/adr/0022-navegador-liberado-por-cookie.md)) |
| `curl` no Windows falha com `CERT_TRUST_REVOCATION_STATUS_UNKNOWN` | O `curl` do Windows checa revogação, que a CA local não tem: use `--ssl-no-revoke`. Os navegadores não exigem isso |

## Como está montado

- `deploy/compose.yml`, projeto `financeiro`. Só o Caddy publica portas; banco, MinIO, API, telas e feriados ficam na rede interna do Docker. Volumes: `financeiro_pgdata`, `financeiro_miniodata`, `financeiro_caddydata`, `financeiro_caddyconfig` e `financeiro_feriadosdata`.
- A API roda em **modo produção** (`ENVIRONMENT=production`): sem `/docs`, cookie de sessão seguro, Connect só por `https`, sem dados de exemplo nem Connect simulado. O MinIO fala `https` com um certificado gerado pelo `make configurar` em `deploy/certs/` (fora do git), e a API confia nele por `AWS_CA_BUNDLE`.
- O banco nasce com as roles do `docker/postgres/roles.sql`; o `make banco` troca as senhas delas pelas do `deploy/.env` a cada subida. As migrations rodam com a role `financeiro_migrator`, e a API usa a `financeiro_app`.
- **Feriados das capitais:** os containers `feriados` (o feriados.dev, construído do GitHub numa versão fixa) e `feriados-db` (o banco dele) ficam na rede interna. O primeiro build precisa de internet e leva alguns minutos. A API busca os feriados sozinha a cada 6 horas (`HOLIDAYS_SYNC_HOURS`). Para usar outras cidades, ponha os códigos do feriados.dev em `HOLIDAYS_LOCATIONS` no `deploy/.env` (ex.: `SP-sao-paulo,SP-campinas`) e rode `make subir`. O volume do feriados.dev não entra no backup: tudo nele é recarregado na subida. Os dados dele vão até 2027; para os anos seguintes, troque o commit do `feriados` no `deploy/compose.yml` por uma versão nova.
- O `docker-compose.yml` da raiz continua sendo só o do desenvolvimento.
- A CI testa este deploy num Ubuntu sempre que algo dele muda (`.github/workflows/deploy.yml`): verificar, configurar, subir com a conferência, administrador e login, backup, voltar e restaurar os arquivos.

## Onde está cada coisa

| Arquivo | O que é |
|---|---|
| `Makefile` (raiz) | Todos os comandos acima |
| `deploy/compose.yml` | As partes e como se ligam |
| `deploy/Caddyfile` | O HTTPS |
| `deploy/verificar.sh` | A verificação do `make verificar` |
| `deploy/feriados/` | O preparo do banco do feriados.dev |
| `deploy/.env` | Chaves e endereço, gerado pelo `make configurar` (**fora do git**) |
| `deploy/certs/`, `backups/` | Certificado interno do cofre e backups (**fora do git**) |
| `.github/workflows/deploy.yml` | A CI roda este deploy inteiro num Ubuntu sempre que algo dele muda |
