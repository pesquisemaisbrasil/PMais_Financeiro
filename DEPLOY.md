# Deploy do Financeiro no servidor local

Como instalar e manter o Financeiro inteiro numa máquina do escritório (**Ubuntu**), aberto pela rede com HTTPS, a partir da branch `development`. Tudo é feito pelo `Makefile` da raiz, com os arquivos de `deploy/`. Decisões do Bruno em 17/11/2026: acesso pela rede, HTTPS e banco vazio para dados reais ([ADR 0020](docs/architecture/adr/0020-servidor-local-com-docker-compose-e-caddy.md)). Desde 26/11/2026, o Financeiro fica **atrás do nginx do servidor**, como o P+ Connect: o nginx tem as portas 80 e 443 e o HTTPS, e atende também os outros sistemas da máquina ([ADR 0027](docs/architecture/adr/0027-nginx-do-servidor-na-frente-do-caddy.md)).

```
rede do escritório (portas 80 e 443)
        │
      nginx  ← já existe no servidor; cuida do HTTPS (certbot) e atende os outros sistemas
        │    127.0.0.1:8089
      Caddy  ← do Financeiro; só escuta na própria máquina; escolhe telas ou API pelo nome
        │
   https://financeiro...      → telas
   https://api.financeiro...  → API     (banco, cofre e feriados: só na rede interna do Docker)
```

> **Dado real:** o servidor recebe os dados reais pelo **dump do banco da máquina do desenvolvimento** (seção 8), na primeira instalação (`make subir-projeto`, seção 2). O dump traz os cadastros e os relatórios do sistema antigo e as contas da equipe, e daí em diante a equipe lança no próprio servidor (decisões do Bruno, 23/11 e 25/11/2026). Sem o dump, o servidor sobe com o banco vazio. O inventário de dados vale para este servidor. **Antes do primeiro lançamento real:** guarde uma cópia do `deploy/.env` num cofre fora da máquina (sem ela, anexos, chaves Pix e autenticadores não abrem mais) e leve as cópias de backup para fora do servidor. Para onde e por quanto tempo, o DPO responde (Q51 em [perguntas-abertas](docs/planning/perguntas-abertas.md)).

## O que sobe

| Parte | O que é | Onde a equipe acessa |
|---|---|---|
| Banco | Postgres 16 | não é exposto |
| Cofre de arquivos | MinIO (anexos cifrados), com TLS | não é exposto |
| API | o backend, em modo produção; as migrations rodam quando ela sobe | `https://<DOMINIO_API>` (padrão: `api.<DOMINIO>`) |
| Telas | o frontend | `https://<DOMINIO>` |
| Caddy | escolhe telas ou API pelo nome | só em `127.0.0.1:8089`, onde o nginx chega |
| HTTPS | o **nginx do servidor** (fora do Docker, não é do Financeiro), com o certificado do certbot | portas 80 (redireciona) e 443 |
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
# nginx e certbot: se o servidor já tem (como o do Connect), não instala de novo
sudo apt install -y nginx certbot python3-certbot-nginx
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

- **Dois nomes no DNS**, pedidos à TI, apontando para o servidor: um para as telas (ex.: `financeiro.pesquisemais.com.br`) e um para a API (ex.: `api.financeiro.pesquisemais.com.br`). O nginx separa os sistemas da máquina pelo nome, por isso não dá para usar o IP. Para o certbot, os nomes precisam ser públicos e a porta 80 alcançar o servidor pela internet, como no Connect; se forem só da rede interna, o certificado é outro, da empresa (seção 3).
- **Portas:** 80 (só redireciona para o https) e 443, do nginx. O Financeiro só abre a `127.0.0.1:8089` (`PORTA_LOCAL`), na própria máquina, onde o nginx chega. Banco, MinIO, API e telas não publicam porta.
- **Quem abre:** só a rede do escritório (faixas privadas, como `192.168.x.x`). O resto recebe 403 do nginx. Abrir pela internet fica com a Q64 ([perguntas-abertas](docs/planning/perguntas-abertas.md)).
- **Compose** 2.20 ou mais novo: confira com `docker compose version`.
- **Internet** só para baixar as imagens, o `npm ci` e o `pip` no build, e para a consulta de CNPJ e de feriados (BrasilAPI). O Connect, se configurado, também.
- **Disco:** pelo menos 10 GB livres.

## 2. Primeira instalação

No servidor, com o seu usuário (não o root):

```bash
git clone https://github.com/pesquisemaisbrasil/PMais_Financeiro.git financeiro
cd financeiro
git checkout development
```

**Com o pacote do banco da máquina do desenvolvimento** (seção 8), tudo de uma vez: copie os 3 arquivos do pacote para `backups/` e rode

```bash
make subir-projeto DOMINIO=financeiro.pesquisemais.com.br CONFIRMAR=sim
```

Ele faz, em ordem, e para no primeiro erro:

1. confere o pacote (`make conferir-pacote`): os 3 arquivos, as chaves e a versão do banco;
2. gera o `deploy/.env` (`make configurar`), se ainda não existe;
3. sobe tudo e confere pelo Caddy local (`make subir`);
4. põe o banco, os arquivos e as chaves do pacote (`make restaurar-local`);
5. liga a atualização automática às 22h (`make agendar`) e gera o arquivo do nginx (`make nginx`), com os comandos para ligá-lo.

Sem `PACOTE=`, ele usa o pacote mais novo de `backups/`. As contas de acesso são as do pacote, com as senhas e os autenticadores de lá: não precisa do `make admin`. Depois, ligue o nginx e o HTTPS (seção 3) e siga a lista "Depois", abaixo; a atualização automática já fica ligada.

**Sem o pacote**, por partes:

```bash
make verificar DOMINIO=financeiro.pesquisemais.com.br    # confere se o servidor está pronto; não muda nada
make configurar DOMINIO=financeiro.pesquisemais.com.br   # gera deploy/.env com chaves novas (só se a verificação passar)
make subir     # sobe tudo e termina testando pelo Caddy local (o primeiro build leva alguns minutos)
make nginx     # gera o arquivo do nginx e mostra como ligá-lo com HTTPS (seção 3)
make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"    # primeiro administrador; pede a senha no terminal
make definir-nivel EMAIL=voce@pesquisemais.com.br NIVEL=superadmin   # quem desenvolve vira super admin (vê Demandas)
```

Troque `financeiro.pesquisemais.com.br` pelo nome das telas, sem `https://` nem porta. A API fica em `api.` do mesmo nome; para outro, acrescente `DOMINIO_API=...`. Se a porta 8089 já estiver em uso na máquina, acrescente `PORTA_LOCAL=8090` (ou outra livre). O `HOST=<IP>` de antes é recusado.

O que cada passo faz:

- **`make verificar`** (`deploy/verificar.sh`) confere, sem mudar nada. **Erros** impedem o deploy: falta git, make, openssl ou nginx; Docker parado ou só com `sudo`; Compose antes da 2.20; a porta local (8089) em uso por outro programa; um IP no lugar do nome. **Avisos** não impedem: falta o certbot, o `ufw` sem as portas 80 e 443, menos de 10 GB livres, um dos dois nomes ainda não encontrado na rede, não estar na branch `development`. As portas 80 e 443 não são conferidas: são do nginx. Cada linha com problema traz o comando para resolver. O `make configurar` roda a verificação antes e não gera nada se houver erro; o `make subir` também roda, e aceita a porta local quando quem a usa é o próprio Financeiro.
- **`make configurar`** cria o `deploy/.env` (fora do git) com os endereços (`DOMINIO`, `DOMINIO_API` e `PORTA_LOCAL`) e **chaves novas e aleatórias**: senhas do banco e do MinIO, `SECRET_KEY`, `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`. Ele se recusa a gerar de novo se o arquivo já existe.
- **`make admin`** cria um administrador. As outras contas são criadas por um administrador na tela, ou também com `make admin`.
- **`make definir-nivel`** troca o nível de uma conta que já existe: `financeiro` (usuário), `admin` ou `superadmin` ([ADR 0023](docs/architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)). Vale no próximo clique da pessoa.

Depois:

1. **Guarde o `deploy/.env` num cofre, fora do servidor.** Sem `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`, os dados guardados não abrem. Ele nunca vai para o git.
2. **Ligue o nginx e o HTTPS** (seção 3).
3. **Abra `https://<DOMINIO>`** num computador da rede e entre com o administrador. O primeiro acesso de cada pessoa cadastra o autenticador (MFA). O primeiro computador de cada pessoa fica liberado sozinho; os outros viram pedido na tela **Acessos** para um administrador liberar (o super admin não passa por isso).
4. **Ligue a atualização automática** (`make agendar`, seção 7). Ela faz o backup diário às 22h.
5. Para ligar o **P+ Connect**: preencha `CONNECT_BASE_URL` (só `https`), `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `deploy/.env` e rode `make subir`.

## 3. nginx e HTTPS (uma vez)

O nginx do servidor recebe os dois nomes do Financeiro, cuida do HTTPS e repassa ao Caddy em `127.0.0.1:8089`. O Financeiro entra nele como um **arquivo separado**, `financeiro.conf`: os outros sistemas do nginx não mudam. É o mesmo jeito do Connect.

```bash
make nginx
```

Ele gera o `financeiro.nginx.conf` na raiz do repositório (fora do git), a partir do modelo `deploy/nginx/financeiro.conf`, com os nomes e a porta do `deploy/.env`, e mostra os comandos para ligar, que pedem `sudo`:

```bash
sudo cp financeiro.nginx.conf /etc/nginx/sites-available/financeiro.conf
sudo ln -sf /etc/nginx/sites-available/financeiro.conf /etc/nginx/sites-enabled/financeiro.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --redirect -d financeiro.pesquisemais.com.br -d api.financeiro.pesquisemais.com.br
```

- O `nginx -t` confere tudo antes: se der erro, o `reload` não roda e nada muda. O `reload` não derruba quem está conectado nos outros sistemas.
- O **certbot** pega o certificado dos dois nomes, acrescenta o HTTPS só no `financeiro.conf` e renova sozinho. Os computadores da equipe não instalam nada.
- **Nomes só da rede interna** (o certbot não alcança): no lugar do `certbot`, ponha no `/etc/nginx/sites-available/financeiro.conf` um bloco `listen 443 ssl` com o certificado da empresa para os dois nomes, como os outros sistemas do nginx fazem.
- **Copiar o arquivo de novo** (o modelo mudou, ou outro nome) apaga o HTTPS que o certbot tinha acrescentado: depois de copiar, rode o `certbot` outra vez.
- O arquivo só deixa entrar a **rede do escritório** (faixas privadas) e não grava log de acesso (IP é dado pessoal). Envio de até 30 MB, para os PDFs de comprovantes.

Depois, `make conferir` mostra `[ok]` também em `https://<DOMINIO>/login` e `https://<DOMINIO_API>/readyz`.

## 4. Backup

O `make backup` copia o banco (`backups/banco-<data>.dump`) e os arquivos (`backups/arquivos-<data>.tgz`) e anota a versão do código (`backups/versao-<data>.txt`). O `make atualizar` faz um antes de cada versão nova.

Para um por dia, ligue a atualização automática (`make agendar`, seção 7): às 22h ela faz o backup, e também a versão nova, quando houver. Para só o backup, sem atualizar, ponha no `crontab -e` do usuário que roda o Financeiro:

```
0 22 * * * cd /caminho/do/financeiro && make backup >> backups/backup.log 2>&1
```

Não use as duas coisas juntas: seriam dois backups por noite.

As cópias ficam em `backups/` no próprio servidor: **leve-as para fora dele** (outro disco ou cofre), longe do `deploy/.env`, e apague as antigas. Para onde vão e por quanto tempo, o DPO responde (Q51).

## 5. Versão nova

Quando a `development` tiver uma versão nova:

```bash
make atualizar
```

Ele faz backup, baixa a `development` (`git merge --ff-only`), gera as imagens novas, aplica as migrations (quando a API sobe) e confere. O nginx não é tocado: ele continua repassando para a mesma porta local. Recusa se alguém tiver mudado arquivos do repositório no servidor. Se a versão nova não subir, ele mostra o `make voltar` pronto para copiar.

## 6. Se a versão nova der problema

```bash
make voltar ARQUIVO=backups/banco-<data do atualizar>.dump CONFIRMAR=sim
```

Ele volta o código para a versão desse backup, **apaga o banco atual e põe o do backup** (o que foi lançado depois do backup se perde), gera a API e as telas dessa versão e confere. Os arquivos anexados ficam como estão. O servidor fica numa versão "solta" (fora da `development`) até a correção sair; aí o `make atualizar` volta para a `development`.

Se o problema não for no banco (a versão nova só tem um defeito de tela, por exemplo), prefira esperar a correção e rodar `make atualizar` de novo: assim nada lançado se perde.

## 7. Atualização automática, todo dia às 22h

```bash
make agendar          # liga: todo dia às 22h (outra hora: make agendar HORA=21)
make status           # mostra "Atualização automática: ligada, às 22h"
make desagendar       # desliga
```

O `make agendar` põe uma linha no `crontab` do seu usuário, que roda o `deploy/atualizar-agendado.sh` ([ADR 0026](docs/architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md)). Toda noite:

- **sem versão nova na `development`:** só o backup do dia;
- **com versão nova:** o `make atualizar` (backup, baixa a `development` e sobe);
- **se a versão nova não subir:** volta sozinho à versão de antes, com o banco do backup daquela noite (o `make voltar`). Às 22h ninguém está lançando, então nada se perde. Na noite seguinte ele tenta de novo.

O log de cada noite fica em `backups/logs/atualizar-<data>.log`. Para achar o mais recente: `ls -t backups/logs/ | head -n 1`.

Antes de ligar:

1. **Fuso de São Paulo:** o cron usa a hora da máquina. O `make verificar` avisa se o fuso for outro. Para acertar: `sudo timedatectl set-timezone America/Sao_Paulo`.
2. **O git baixa sem pedir senha:** às 22h ninguém digita a senha do GitHub. Rode `git fetch origin development`. Se ele pedir usuário e senha, configure uma chave de acesso (deploy key do repositório, só leitura) antes de ligar. Sem ela, a atualização só faz o backup e o log diz "Não consegui baixar a development".
3. **Ninguém muda arquivo do repositório no servidor.** Se alguém mudar, o `make atualizar` recusa e o log diz "Há mudança local".

## 8. Levar o banco local para o servidor

É assim que os dados do sistema antigo (SGE4B) chegam ao servidor:

- os .csv dos cadastros e os relatórios "Lançamentos a Pagar" e "Lançamentos a Receber" foram importados **só na máquina do desenvolvimento**, com os scripts `backend/scripts/importar_*.py`;
- o servidor recebe o **banco pronto**, num dump.

No servidor não há .csv, relatório nem pasta `importar/`: ela saiu do repositório em 25/11, e o `.gitignore` continua barrando a pasta e qualquer .csv.

O dump leva **tudo**:

- os lançamentos e os cadastros;
- as contas de acesso, com as senhas e os autenticadores. As contas da equipe nascem com a senha inicial, que cada pessoa troca no primeiro acesso ([acesso-e-auditoria](docs/specs/acesso-e-auditoria.md));
- os arquivos anexados.

**Só antes de a equipe lançar no servidor:** o pacote **apaga** o banco do servidor. Depois disso, o servidor é o banco de verdade: não se leva outro dump para ele. Uma conta nova é criada lá mesmo, com `make conta`.

1. **Na máquina do desenvolvimento**, na raiz do repositório e com o `docker compose` no ar:

   ```bash
   bash scripts/gerar-dump-local.sh
   ```

   Ele gera 3 arquivos em `backups/`, fora do git:

   - `local-<data>-banco.dump`: o banco inteiro;
   - `local-<data>-arquivos.tgz`: os anexos;
   - `local-<data>-chaves.env`: as três chaves que abrem os autenticadores, os anexos e a chave de repetição dos relatórios.

   Ele avisa se o banco está numa versão que ainda não foi para a `development`: nesse caso, envie o código antes.
2. **Leve os 3 arquivos para a pasta `backups/` do servidor** por um meio seguro: pendrive ou pasta protegida, nunca pelo git nem por e-mail aberto. Eles têm dado real, o hash das senhas e as chaves.
3. **No servidor:**
   - **primeira instalação:** `make subir-projeto DOMINIO=<nome> CONFIRMAR=sim` (seção 2), que faz tudo, inclusive o passo abaixo;
   - **servidor já instalado:**

     ```bash
     make atualizar        # o código na versão do banco do pacote
     make conferir-pacote ARQUIVO=backups/local-<data>-banco.dump   # opcional: só confere
     make restaurar-local ARQUIVO=backups/local-<data>-banco.dump CONFIRMAR=sim
     ```

   O `make restaurar-local` faz, em ordem:

   1. confere o pacote, e recusa sem mexer em nada se faltar um arquivo ou se o banco for de uma versão que o código não tem;
   2. faz o backup do que está no servidor;
   3. troca as três chaves no `deploy/.env` e guarda o de antes em `backups/env-antes-do-local-<data>.env`;
   4. restaura o banco e os arquivos;
   5. sobe tudo e confere.
4. **Entre com uma conta da máquina do desenvolvimento.** A conta criada antes no servidor (`make admin`) some: crie de novo se precisar. As contas já têm navegadores liberados, então o primeiro computador de cada uma no servidor vira pedido em **Acessos**, e o super admin libera.
5. **Guarde o `deploy/.env` novo num cofre** (as chaves dele mudaram) e **apague o `local-<data>-chaves.env`** das duas máquinas.

## Comandos

| Comando | O que faz |
|---|---|
| `make` | Lista os comandos |
| `make verificar` | Confere programas, Docker, nginx, porta local, firewall, disco, endereços e branch, sem mudar nada |
| `make subir-projeto DOMINIO=... CONFIRMAR=sim` | Primeira vez, com o pacote do banco local em `backups/`: configura, sobe, põe o banco do pacote, liga as 22h e gera o arquivo do nginx (seção 2) |
| `make configurar DOMINIO=...` | Primeira vez: verifica e gera o `deploy/.env` com os endereços e chaves novas (`DOMINIO_API=` e `PORTA_LOCAL=` opcionais) |
| `make subir` | Verifica o servidor, sobe tudo (e refaz o build do que mudou) e termina com o `make conferir`. Por partes: `make banco`, `make infra` (banco + cofre), `make backend`, `make frontend`, `make proxy` (o Caddy) |
| `make conferir` | Abre as telas e a API (que só responde com o banco no ar) pelo Caddy local, e depois pelo HTTPS do nginx, como um computador da equipe; o HTTPS só avisa |
| `make status` | A versão no ar (commit, data e branch), se a atualização automática está ligada e cada parte, se está saudável |
| `make logs` / `make logs SERVICO=api` | Acompanha os logs (nunca têm dado pessoal: veja o inventário de dados) |
| `make parar` | Para tudo sem apagar nada; `make subir` volta |
| `make atualizar` | Backup, baixa a `development` e sobe a versão nova (seção 5) |
| `make voltar ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | Volta à versão do código desse backup **e ao banco dele** (seção 6) |
| `make backup` | Backup na hora, em `backups/` (seção 4) |
| `make restaurar-banco ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | **Apaga** o banco e põe o do backup; a API sobe e aplica as migrations que faltarem |
| `make restaurar-arquivos ARQUIVO=backups/arquivos-....tgz CONFIRMAR=sim` | **Apaga** os arquivos do cofre e põe os do backup |
| `make conferir-pacote ARQUIVO=backups/local-...-banco.dump` | Confere o pacote do banco local sem mexer em nada: os 3 arquivos, as chaves e se o código tem a versão do banco |
| `make restaurar-local ARQUIVO=backups/local-...-banco.dump CONFIRMAR=sim` | **Apaga** o banco e os arquivos e põe os do pacote da máquina do desenvolvimento, com as chaves dele (seção 8) |
| `make agendar` / `make desagendar` | Liga ou desliga a atualização automática, todo dia às 22h (seção 7) |
| `make admin EMAIL=... NOME="..."` | Cria um administrador (pede a senha) |
| `make conta EMAIL=... NOME="..." NIVEL=financeiro` | Cria uma conta da equipe (`financeiro`, o Usuário, ou `admin`) com senha inicial: pede a senha inicial no terminal, e a pessoa troca por uma só dela no primeiro acesso, antes do autenticador |
| `make definir-nivel EMAIL=... NIVEL=...` | Troca o nível de uma conta: `financeiro` (usuário), `admin` ou `superadmin` |
| `make liberar-navegador EMAIL=...` | Libera o computador que a pessoa pediu por último, quando não há outro administrador para liberar na tela Acessos |
| `make nginx` | Gera o `financeiro.nginx.conf` com os endereços do `deploy/.env` e mostra como ligá-lo no nginx, com o certbot (seção 3) |

Os containers voltam sozinhos quando o servidor reinicia (`restart: unless-stopped`), desde que o Docker suba com a máquina. Os logs têm tamanho limitado (5 arquivos de 10 MB por parte), então não enchem o disco.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `make verificar` mostra `[ERRO]` | Cada linha traz o comando para resolver; rode `make verificar` de novo depois |
| `make verificar` diz que a porta local 8089 está em uso | Outro programa usa a porta: `sudo ss -ltnp \| grep ':8089 '` mostra quem. Use outra: `PORTA_LOCAL=8090` no `make configurar` (já configurado: mude no `deploy/.env`, rode `make subir` e `make nginx`, e copie e rode o certbot de novo, seção 3) |
| `permission denied ... docker.sock` | O usuário não está no grupo `docker`: `sudo usermod -aG docker "$USER"` e entre de novo |
| `make subir` para com uma parte "unhealthy" | `make logs SERVICO=api` (ou `db`, `proxy`). Senha do banco: rode `make banco` (acerta as senhas das roles pelo `deploy/.env`) |
| O navegador avisa que a conexão não é segura | O certificado não foi tirado para esse nome: rode o `certbot` da seção 3 (depois de cada cópia do arquivo) |
| A tela abre, mas o login diz "Sem conexão com o servidor" | O nome da API (`DOMINIO_API`) não está no DNS, ou ficou fora do certificado: o `certbot` leva os dois `-d` |
| "Os anexos não estão disponíveis agora" | O MinIO não subiu ou o certificado dele sumiu: `make status`; apagar `deploy/certs/` e rodar `make infra` gera outro |
| `make conferir` dá `[aviso]` no HTTPS | O nginx ainda não foi ligado ou não tem o certificado (seção 3), ou o nome não chega nesta máquina (`make verificar` mostra) |
| 403 Forbidden do nginx | O computador não está na rede do escritório. Se está, o DNS leva o nome ao IP público e o roteador não devolve o IP interno: peça à TI que o DNS interno aponte os dois nomes para o IP do servidor na rede |
| `make` diz "HOST não é mais usado" | O Financeiro fica atrás do nginx, que separa os sistemas pelo nome: use `DOMINIO=financeiro.pesquisemais.com.br` |
| Troquei o nome do Financeiro | No `deploy/.env`, mude o `DOMINIO` (e o `DOMINIO_API`), rode `make subir` (refaz o build das telas) e `make nginx`, e copie e rode o certbot de novo (seção 3). Trocar só o IP do servidor não mexe no Financeiro: basta a TI atualizar o DNS |
| Alguém vê "Computador ainda não liberado" depois da senha e do código | É um computador (ou navegador) novo, ou a pessoa limpou os dados do navegador. Outro admin libera em **Acessos**. Sem outro admin: `make liberar-navegador EMAIL=pessoa@pesquisemais.com.br` libera o pedido mais recente dela ([ADR 0022](docs/architecture/adr/0022-navegador-liberado-por-cookie.md)) |
| A atualização das 22h não rodou | `crontab -l` mostra a linha do Financeiro? Se não, `make agendar`. Se mostra, o log da noite em `backups/logs/` diz o motivo: sem acesso ao GitHub, mudança local nos arquivos ou outra atualização rodando |
| O log da noite diz "A versão nova não subiu. Voltando..." | No ar ficou a versão de antes, com o banco do backup daquela noite. O erro está no log, acima dessa linha. Corrija na `development`: a próxima noite tenta de novo, ou rode `make atualizar` à mão |
| `make restaurar-local` diz "que este código ainda não tem" | O banco do pacote é de uma versão mais nova que o código do servidor: envie o código para a `development` e rode `make atualizar` antes |
| Erro 413 ao enviar um arquivo | O nginx barra envios maiores que o `client_max_body_size` do `financeiro.conf` (30 MB). O arquivo veio de outro modelo? Rode `make nginx` e copie de novo (seção 3) |

## Como está montado

- **nginx do servidor** (fora do Docker): portas 80 e 443, o HTTPS e o arquivo `financeiro.conf` (modelo em `deploy/nginx/`). Ele repassa ao Caddy pelo HTTP em `127.0.0.1:8089`, com o `X-Forwarded-For` e o `X-Forwarded-Proto`, e o Caddy e a API confiam neles.
- `deploy/compose.yml`, projeto `financeiro`. Só o Caddy publica porta, e só na própria máquina; banco, MinIO, API, telas e feriados ficam na rede interna do Docker. Volumes: `financeiro_pgdata`, `financeiro_miniodata`, `financeiro_caddydata`, `financeiro_caddyconfig` e `financeiro_feriadosdata`.
- A API roda em **modo produção** (`ENVIRONMENT=production`): sem `/docs`, cookie de sessão seguro, Connect só por `https`, sem dados de exemplo nem Connect simulado. O MinIO fala `https` com um certificado gerado pelo `make configurar` em `deploy/certs/` (fora do git), e a API confia nele por `AWS_CA_BUNDLE`.
- O banco nasce com as roles do `docker/postgres/roles.sql`; o `make banco` troca as senhas delas pelas do `deploy/.env` a cada subida. As migrations rodam com a role `financeiro_migrator`, e a API usa a `financeiro_app`.
- **Feriados das capitais:** os containers `feriados` (o feriados.dev, construído do GitHub numa versão fixa) e `feriados-db` (o banco dele) ficam na rede interna. O primeiro build precisa de internet e leva alguns minutos. A API busca os feriados sozinha a cada 6 horas (`HOLIDAYS_SYNC_HOURS`). Para usar outras cidades, ponha os códigos do feriados.dev em `HOLIDAYS_LOCATIONS` no `deploy/.env` (ex.: `SP-sao-paulo,SP-campinas`) e rode `make subir`. O volume do feriados.dev não entra no backup: tudo nele é recarregado na subida. Os dados dele vão até 2027; para os anos seguintes, troque o commit do `feriados` no `deploy/compose.yml` por uma versão nova.
- O `docker-compose.yml` da raiz continua sendo só o do desenvolvimento.
- A CI testa este deploy num Ubuntu sempre que algo dele muda (`.github/workflows/deploy.yml`): verificar, configurar, subir com a conferência, o nginx na frente com o arquivo do `make nginx`, administrador e login pelo nginx, backup, voltar, restaurar os arquivos, subir o projeto com um pacote como o da máquina do desenvolvimento (`make subir-projeto`, com chaves novas, que também liga a atualização automática) e desligar a atualização automática.

## Onde está cada coisa

| Arquivo | O que é |
|---|---|
| `Makefile` (raiz) | Todos os comandos acima |
| `deploy/compose.yml` | As partes e como se ligam |
| `deploy/Caddyfile` | O Caddy: qual nome vai para as telas e qual vai para a API |
| `deploy/nginx/financeiro.conf` | O modelo do arquivo do nginx (o `make nginx` preenche) |
| `deploy/verificar.sh` | A verificação do `make verificar` |
| `deploy/atualizar-agendado.sh` | A atualização das 22h (`make agendar`) |
| `scripts/gerar-dump-local.sh` | Na máquina do desenvolvimento: o pacote do banco local para o `make restaurar-local` |
| `deploy/feriados/` | O preparo do banco do feriados.dev |
| `deploy/.env` | Chaves e endereços, gerado pelo `make configurar` (**fora do git**) |
| `financeiro.nginx.conf` | O arquivo do nginx preenchido pelo `make nginx` (**fora do git**) |
| `deploy/certs/`, `backups/` | Certificado interno do cofre, backups, logs da atualização automática (`backups/logs/`) e o pacote do banco local (**fora do git**) |
| `.github/workflows/deploy.yml` | A CI roda este deploy inteiro num Ubuntu sempre que algo dele muda |
