# Deploy do Financeiro no servidor local

Como instalar e manter o Financeiro inteiro numa máquina do escritório (**Ubuntu**), aberto pela rede com HTTPS, a partir da branch `development`. Tudo é feito pelo `Makefile` da raiz, com os arquivos de `deploy/`. Decisões do Bruno em 17/11/2026: acesso pela rede, HTTPS e banco vazio para dados reais ([ADR 0020](docs/architecture/adr/0020-servidor-local-com-docker-compose-e-caddy.md)).

## Dois jeitos de abrir

As portas 80 e 443 do servidor são do **nginx**, que atende outros sistemas da máquina. O Financeiro não usa essas portas, e abre de um destes dois jeitos ([ADR 0027](docs/architecture/adr/0027-nginx-do-servidor-na-frente-do-caddy.md)). Ele é escolhido no `make configurar` e pode ser trocado depois sem perder nada (seção 5).

| | **Pelo IP** (`IP=192.168.30.15`) | **Por nome, atrás do nginx** (`DOMINIO=financeiro.pesquisemais.com.br`) |
|---|---|---|
| Quando | agora, enquanto não há nome no DNS | quando a TI criar os dois nomes |
| Telas | `https://192.168.30.15:8444` | `https://financeiro.pesquisemais.com.br` |
| API | `https://192.168.30.15:8443` | `https://api.financeiro.pesquisemais.com.br` |
| HTTPS | o Caddy do Financeiro, com o certificado da própria máquina | o nginx do servidor, com o certificado do certbot, como o P+ Connect |
| Computadores da equipe | instalam o certificado raiz uma vez (seção 3) | não instalam nada |
| nginx | não entra | recebe o arquivo `financeiro.conf` (seção 4) |

```
Pelo IP                                        Por nome
rede → :8444 telas, :8443 API                  rede → nginx (80 e 443, HTTPS, outros sistemas)
        │                                                │  127.0.0.1:8089
      Caddy (HTTPS, certificado da máquina)            Caddy (só na própria máquina, escolhe pelo nome)
        │                                                │
   telas e API                                      telas e API
   (banco, cofre e feriados: só na rede interna do Docker, nos dois)
```

`make atualizar`, `make agendar` e `make voltar` funcionam igual nos dois.

> **Dado real:** o servidor recebe os dados reais pelo **dump do banco da máquina do desenvolvimento** (seção 10), na primeira instalação (`make subir-projeto`, seção 2). O dump traz os cadastros e os relatórios do sistema antigo e as contas da equipe, e daí em diante a equipe lança no próprio servidor (decisões do Bruno, 23/11 e 25/11/2026). Sem o dump, o servidor sobe com o banco vazio. O inventário de dados vale para este servidor. **Antes do primeiro lançamento real:** guarde uma cópia do `deploy/.env` num cofre fora da máquina (sem ela, anexos, chaves Pix e autenticadores não abrem mais) e leve as cópias de backup para fora do servidor. Para onde e por quanto tempo, o DPO responde (Q51 em [perguntas-abertas](docs/planning/perguntas-abertas.md)).

## O que sobe

| Parte | O que é | Onde a equipe acessa |
|---|---|---|
| Banco | Postgres 16 | não é exposto |
| Cofre de arquivos | MinIO (anexos cifrados), com TLS | não é exposto |
| API | o backend, em modo produção; as migrations rodam quando ela sobe | pelo IP: `https://<IP>:8443`; por nome: `https://<DOMINIO_API>` |
| Telas | o frontend | pelo IP: `https://<IP>:8444`; por nome: `https://<DOMINIO>` |
| Caddy | escolhe telas ou API | pelo IP: portas 8444 e 8443, com o HTTPS; por nome: só `127.0.0.1:8089`, onde o nginx chega |
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
```

Firewall (`ufw`), se estiver ligado:

```bash
sudo ufw allow 8444/tcp && sudo ufw allow 8443/tcp   # pelo IP: telas e API
sudo ufw allow 'Nginx Full'                          # por nome: as portas 80 e 443 do nginx
```

- **Pelo IP:** um **IP fixo** na rede (reservado no roteador) e as portas 8444 e 8443 livres. Trocar o IP depois é o `make trocar-endereco` (seção 5).
- **Por nome:** o nginx e o certbot (`sudo apt install -y nginx certbot python3-certbot-nginx`, se o servidor ainda não tem) e **dois nomes no DNS**, pedidos à TI, apontando para o servidor: um para as telas e um para a API. Para o certbot, os nomes precisam ser públicos e a porta 80 alcançar o servidor pela internet, como no Connect; se forem só da rede interna, o certificado é outro, da empresa (seção 4). Só a rede do escritório abre; abrir pela internet fica com a Q64 ([perguntas-abertas](docs/planning/perguntas-abertas.md)).
- **A pasta do repositório é do seu usuário,** não do root: o `make` grava o `deploy/.env` e os `backups/` nela, e o cron das 22h roda com o seu usuário. Clonou com `sudo`? `sudo chown -R "$USER": <pasta>`.
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

**Com o pacote do banco da máquina do desenvolvimento** (seção 10), tudo de uma vez: copie os 3 arquivos do pacote para `backups/` e rode

```bash
make subir-projeto IP=192.168.30.15 CONFIRMAR=sim
# ou, com nome: make subir-projeto DOMINIO=financeiro.pesquisemais.com.br CONFIRMAR=sim
```

Ele faz, em ordem, e para no primeiro erro:

1. confere o pacote (`make conferir-pacote`): os 3 arquivos, as chaves e a versão do banco;
2. gera o `deploy/.env` (`make configurar`), se ainda não existe;
3. sobe tudo e confere (`make subir`);
4. põe o banco, os arquivos e as chaves do pacote (`make restaurar-local`);
5. liga a atualização automática às 22h (`make agendar`) e, pelo IP, gera o certificado da equipe (`make certificado`); por nome, gera o arquivo do nginx (`make nginx`), com os comandos para ligá-lo.

Sem `PACOTE=`, ele usa o pacote mais novo de `backups/`. As contas de acesso são as do pacote, com as senhas e os autenticadores de lá: não precisa do `make admin`. Depois, siga a lista "Depois", abaixo; a atualização automática já fica ligada.

**Sem o pacote**, por partes:

```bash
make verificar IP=192.168.30.15     # confere se o servidor está pronto; não muda nada
make configurar IP=192.168.30.15    # gera deploy/.env com chaves novas (só se a verificação passar)
make subir                          # sobe tudo e termina conferindo (o primeiro build leva alguns minutos)
make certificado                    # pelo IP: gera financeiro-certificado-raiz.crt para os computadores
make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"    # primeiro administrador; pede a senha no terminal
make definir-nivel EMAIL=voce@pesquisemais.com.br NIVEL=superadmin   # quem desenvolve vira super admin (vê Demandas)
```

Por nome, troque `IP=192.168.30.15` por `DOMINIO=financeiro.pesquisemais.com.br` e o `make certificado` pelo `make nginx` (seção 4).

O endereço vai sem `https://` nem porta. Opções:

- **pelo IP:** `PORTA_TELAS=` e `PORTA_API=` mudam as portas (padrão 8444 e 8443; a 80 e a 443 são recusadas, porque são do nginx);
- **por nome:** a API fica em `api.` do mesmo nome, ou em `DOMINIO_API=...`; `PORTA_LOCAL=` muda a porta local onde o nginx chega (padrão 8089).

O `HOST=` de antes é recusado: agora é `IP=`.

O que cada passo faz:

- **`make verificar`** (`deploy/verificar.sh`) confere, sem mudar nada. **Erros** impedem o deploy: falta git, make, openssl ou curl; Docker parado ou só com `sudo`; Compose antes da 2.20; uma porta do Financeiro em uso por outro programa (pelo IP, a 8444 e a 8443; por nome, a 8089); por nome, falta o nginx. **Avisos** não impedem: o `ufw` sem as portas, menos de 10 GB livres, o IP não ser desta máquina ou um nome ainda não encontrado na rede, por nome sem o certbot, não estar na branch `development`. As portas 80 e 443 não são conferidas: são do nginx. Cada linha com problema traz o comando para resolver. O `make configurar` roda a verificação antes e não gera nada se houver erro; o `make subir` também roda, e aceita as portas quando quem as usa é o próprio Financeiro.
- **`make configurar`** cria o `deploy/.env` (fora do git) com o endereço (`MODO`, e `IP`, `PORTA_TELAS` e `PORTA_API`, ou `DOMINIO`, `DOMINIO_API` e `PORTA_LOCAL`) e **chaves novas e aleatórias**: senhas do banco e do MinIO, `SECRET_KEY`, `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`. Ele se recusa a gerar de novo se o arquivo já existe; para mudar só o endereço, é o `make trocar-endereco`.
- **`make admin`** cria um administrador. As outras contas são criadas por um administrador na tela, ou também com `make admin`.
- **`make definir-nivel`** troca o nível de uma conta que já existe: `financeiro` (usuário), `admin` ou `superadmin` ([ADR 0023](docs/architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)). Vale no próximo clique da pessoa.

Depois:

1. **Guarde o `deploy/.env` num cofre, fora do servidor.** Sem `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`, os dados guardados não abrem. Ele nunca vai para o git.
2. **Pelo IP:** instale o certificado em cada computador da equipe (seção 3). **Por nome:** ligue o nginx e o HTTPS (seção 4).
3. **Abra as telas** (`https://<IP>:8444` ou `https://<DOMINIO>`) num computador da rede e entre com o administrador. O primeiro acesso de cada pessoa cadastra o autenticador (MFA). O primeiro computador de cada pessoa fica liberado sozinho; os outros viram pedido na tela **Acessos** para um administrador liberar (o super admin não passa por isso).
4. **Ligue a atualização automática** (`make agendar`, seção 9). Ela faz o backup diário às 22h.
5. Para ligar o **P+ Connect**: preencha `CONNECT_BASE_URL` (só `https`), `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `deploy/.env` e rode `make subir`.

## 3. Pelo IP: certificado nos computadores da equipe

O HTTPS pelo IP usa uma autoridade de certificação **da própria máquina** (a CA local do Caddy). Cada computador precisa confiar nela **uma vez**; sem isso o navegador avisa que a conexão não é segura e as telas não falam com a API. O `make certificado` gera o arquivo `financeiro-certificado-raiz.crt`.

- **Windows:** copie o arquivo para o computador → clique duas vezes → **Instalar Certificado** → **Máquina Local** (ou Usuário Atual) → **Colocar todos os certificados no repositório a seguir** → **Autoridades de Certificação Raiz Confiáveis** → Concluir. Feche e abra o navegador.
- **macOS:** clique duas vezes; ele vai para o Acesso às Chaves. Abra o certificado e marque **Confiar sempre**.
- **Linux:** `sudo cp financeiro-certificado-raiz.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`. O Firefox tem a lista própria: Configurações → Certificados → Importar.

O certificado raiz fica no volume `financeiro_caddydata`. Se esse volume for apagado, nasce outro, e todos os computadores precisam instalar de novo. Trocar o IP ou as portas (seção 5) não troca o certificado raiz.

## 4. Por nome: nginx e HTTPS (uma vez)

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

## 5. Trocar o endereço (do IP para o nome, ou outro IP)

```bash
make trocar-endereco DOMINIO=financeiro.pesquisemais.com.br   # do IP para o nome, atrás do nginx
make trocar-endereco IP=192.168.30.20                         # outro IP (ou de volta do nome para o IP)
```

Ele confere o servidor para o endereço novo (`make verificar`), guarda o `deploy/.env` de antes em `backups/env-antes-do-endereco-<data>.env`, troca **só** as linhas do endereço e sobe de novo (`make subir`, que refaz o build das telas com o endereço novo da API). Chaves, banco, arquivos e contas ficam como estão.

Depois:

- **foi para o nome:** `make nginx` e os comandos dele (seção 4). Os computadores não precisam mais do certificado;
- **foi para o IP:** `make certificado` e instale o arquivo nos computadores que ainda não têm (seção 3). Quem já instalou não precisa de novo: o certificado raiz é o mesmo.

Os navegadores liberados (tela **Acessos**) são por endereço: no endereço novo, cada computador vira pedido de novo, e um administrador libera.

## 6. Backup

O `make backup` copia o banco (`backups/banco-<data>.dump`) e os arquivos (`backups/arquivos-<data>.tgz`) e anota a versão do código (`backups/versao-<data>.txt`). O `make atualizar` faz um antes de cada versão nova.

Para um por dia, ligue a atualização automática (`make agendar`, seção 9): às 22h ela faz o backup, e também a versão nova, quando houver. Para só o backup, sem atualizar, ponha no `crontab -e` do usuário que roda o Financeiro:

```
0 22 * * * cd /caminho/do/financeiro && make backup >> backups/backup.log 2>&1
```

Não use as duas coisas juntas: seriam dois backups por noite.

As cópias ficam em `backups/` no próprio servidor: **leve-as para fora dele** (outro disco ou cofre), longe do `deploy/.env`, e apague as antigas. Para onde vão e por quanto tempo, o DPO responde (Q51).

## 7. Versão nova

Quando a `development` tiver uma versão nova:

```bash
make atualizar
```

Ele faz backup, baixa a `development` (`git merge --ff-only`), gera as imagens novas, aplica as migrations (quando a API sobe) e confere. O endereço não muda, e o nginx (por nome) não é tocado. Recusa se alguém tiver mudado arquivos do repositório no servidor. Se a versão nova não subir, ele mostra o `make voltar` pronto para copiar.

## 8. Se a versão nova der problema

```bash
make voltar ARQUIVO=backups/banco-<data do atualizar>.dump CONFIRMAR=sim
```

Ele volta o código para a versão desse backup, **apaga o banco atual e põe o do backup** (o que foi lançado depois do backup se perde), gera a API e as telas dessa versão e confere. Os arquivos anexados ficam como estão. O servidor fica numa versão "solta" (fora da `development`) até a correção sair; aí o `make atualizar` volta para a `development`.

Se o problema não for no banco (a versão nova só tem um defeito de tela, por exemplo), prefira esperar a correção e rodar `make atualizar` de novo: assim nada lançado se perde.

## 9. Atualização automática, todo dia às 22h

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

## 10. Levar o banco local para o servidor

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
   - **primeira instalação:** `make subir-projeto IP=<IP> CONFIRMAR=sim` (ou `DOMINIO=<nome>`, seção 2), que faz tudo, inclusive o passo abaixo;
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
| `make verificar IP=...` (ou `DOMINIO=...`) | Confere programas, Docker, portas, firewall, disco, endereço e branch, sem mudar nada. Sem endereço, usa o do `deploy/.env` |
| `make subir-projeto IP=... CONFIRMAR=sim` | Primeira vez, com o pacote do banco local em `backups/`: configura, sobe, põe o banco do pacote, liga as 22h e gera o certificado (pelo IP) ou o arquivo do nginx (por nome) (seção 2) |
| `make configurar IP=...` (ou `DOMINIO=...`) | Primeira vez: verifica e gera o `deploy/.env` com o endereço e chaves novas |
| `make trocar-endereco IP=...` (ou `DOMINIO=...`) | Troca só o endereço, sem mexer em chaves, banco e arquivos, e sobe de novo (seção 5) |
| `make subir` | Verifica o servidor, sobe tudo (e refaz o build do que mudou) e termina com o `make conferir`. Por partes: `make banco`, `make infra` (banco + cofre), `make backend`, `make frontend`, `make proxy` (o Caddy) |
| `make conferir` | Abre as telas e a API (que só responde com o banco no ar) como um computador da equipe. Pelo IP, pelo HTTPS com o certificado raiz; por nome, pelo Caddy local e depois pelo HTTPS do nginx, que só avisa |
| `make certificado` | Pelo IP: copia o certificado raiz do HTTPS, para instalar nos computadores da equipe (seção 3) |
| `make nginx` | Por nome: gera o `financeiro.nginx.conf` com os endereços do `deploy/.env` e mostra como ligá-lo no nginx, com o certbot (seção 4) |
| `make status` | A versão no ar (commit, data e branch), se a atualização automática está ligada e cada parte, se está saudável |
| `make logs` / `make logs SERVICO=api` | Acompanha os logs (nunca têm dado pessoal: veja o inventário de dados) |
| `make parar` | Para tudo sem apagar nada; `make subir` volta |
| `make atualizar` | Backup, baixa a `development` e sobe a versão nova (seção 7) |
| `make voltar ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | Volta à versão do código desse backup **e ao banco dele** (seção 8) |
| `make backup` | Backup na hora, em `backups/` (seção 6) |
| `make restaurar-banco ARQUIVO=backups/banco-....dump CONFIRMAR=sim` | **Apaga** o banco e põe o do backup; a API sobe e aplica as migrations que faltarem |
| `make restaurar-arquivos ARQUIVO=backups/arquivos-....tgz CONFIRMAR=sim` | **Apaga** os arquivos do cofre e põe os do backup |
| `make conferir-pacote ARQUIVO=backups/local-...-banco.dump` | Confere o pacote do banco local sem mexer em nada: os 3 arquivos, as chaves e se o código tem a versão do banco |
| `make restaurar-local ARQUIVO=backups/local-...-banco.dump CONFIRMAR=sim` | **Apaga** o banco e os arquivos e põe os do pacote da máquina do desenvolvimento, com as chaves dele (seção 10) |
| `make agendar` / `make desagendar` | Liga ou desliga a atualização automática, todo dia às 22h (seção 9) |
| `make admin EMAIL=... NOME="..."` | Cria um administrador (pede a senha) |
| `make conta EMAIL=... NOME="..." NIVEL=financeiro` | Cria uma conta da equipe (`financeiro`, o Usuário, ou `admin`) com senha inicial: pede a senha inicial no terminal, e a pessoa troca por uma só dela no primeiro acesso, antes do autenticador |
| `make definir-nivel EMAIL=... NIVEL=...` | Troca o nível de uma conta: `financeiro` (usuário), `admin` ou `superadmin` |
| `make liberar-navegador EMAIL=...` | Libera o computador que a pessoa pediu por último, quando não há outro administrador para liberar na tela Acessos |

Os containers voltam sozinhos quando o servidor reinicia (`restart: unless-stopped`), desde que o Docker suba com a máquina. Os logs têm tamanho limitado (5 arquivos de 10 MB por parte), então não enchem o disco.

Para um comando do Docker Compose à mão, use `bash deploy/compose.sh <comando>` (ex.: `bash deploy/compose.sh ps`): ele junta os arquivos do modo e os endereços do `deploy/.env`.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `make verificar` mostra `[ERRO]` | Cada linha traz o comando para resolver; rode `make verificar` de novo depois |
| `make` diz "HOST agora é IP" | Use `IP=192.168.30.15` no lugar do `HOST=` (ou `DOMINIO=<nome>`, atrás do nginx) |
| Uma porta do Financeiro está em uso (8444, 8443 ou 8089) | Outro programa usa a porta: `sudo ss -ltnp \| grep ':8444 '` mostra quem. Use outra: `PORTA_TELAS=`, `PORTA_API=` ou `PORTA_LOCAL=` no `make configurar` (já configurado: `make trocar-endereco` com as portas novas) |
| `permission denied ... docker.sock` | O usuário não está no grupo `docker`: `sudo usermod -aG docker "$USER"` e entre de novo |
| `Permissão negada` no `deploy/.env`, nos `backups/` ou no `.git` | A pasta do repositório é do root: `sudo chown -R "$USER": <pasta>` e rode sem `sudo` |
| `make subir` para com uma parte "unhealthy" | `make logs SERVICO=api` (ou `db`, `proxy`). Senha do banco: rode `make banco` (acerta as senhas das roles pelo `deploy/.env`) |
| O navegador avisa que a conexão não é segura | Pelo IP: o certificado raiz não está instalado nesse computador (seção 3), ou o endereço é outro. Por nome: o certificado não foi tirado para esse nome; rode o `certbot` da seção 4 (depois de cada cópia do arquivo) |
| A tela abre, mas o login diz "Sem conexão com o servidor" | Pelo IP: a porta da API (8443) está fechada no firewall, ou o certificado não foi instalado e o navegador bloqueia a API. Por nome: o nome da API não está no DNS, ou ficou fora do certificado (o `certbot` leva os dois `-d`) |
| "Os anexos não estão disponíveis agora" | O MinIO não subiu ou o certificado dele sumiu: `make status`; apagar `deploy/certs/` e rodar `make infra` gera outro |
| Por nome, `make conferir` dá `[aviso]` no HTTPS | O nginx ainda não foi ligado ou não tem o certificado (seção 4), ou o nome não chega nesta máquina (`make verificar` mostra) |
| Por nome, 403 Forbidden do nginx | O computador não está na rede do escritório. Se está, o DNS leva o nome ao IP público e o roteador não devolve o IP interno: peça à TI que o DNS interno aponte os dois nomes para o IP do servidor na rede |
| Por nome, erro 413 ao enviar um arquivo | O nginx barra envios maiores que o `client_max_body_size` do `financeiro.conf` (30 MB). O arquivo veio de outro modelo? Rode `make nginx` e copie de novo (seção 4) |
| Troquei o IP do servidor, ou ganhamos um nome no DNS | `make trocar-endereco IP=<novo>` ou `make trocar-endereco DOMINIO=<nome>` (seção 5) |
| `MODO no deploy/.env tem de ser ip ou nginx` | O `deploy/.env` é de antes dos dois modos ou foi editado à mão: rode `make trocar-endereco IP=...` (ou `DOMINIO=...`), que acerta as linhas do endereço |
| Alguém vê "Computador ainda não liberado" depois da senha e do código | É um computador (ou navegador) novo, ou a pessoa limpou os dados do navegador. Outro admin libera em **Acessos**. Sem outro admin: `make liberar-navegador EMAIL=pessoa@pesquisemais.com.br` libera o pedido mais recente dela ([ADR 0022](docs/architecture/adr/0022-navegador-liberado-por-cookie.md)) |
| A atualização das 22h não rodou | `crontab -l` mostra a linha do Financeiro? Se não, `make agendar`. Se mostra, o log da noite em `backups/logs/` diz o motivo: sem acesso ao GitHub, mudança local nos arquivos ou outra atualização rodando |
| O log da noite diz "A versão nova não subiu. Voltando..." | No ar ficou a versão de antes, com o banco do backup daquela noite. O erro está no log, acima dessa linha. Corrija na `development`: a próxima noite tenta de novo, ou rode `make atualizar` à mão |
| `make restaurar-local` diz "que este código ainda não tem" | O banco do pacote é de uma versão mais nova que o código do servidor: envie o código para a `development` e rode `make atualizar` antes |
| `curl` no Windows falha com `CERT_TRUST_REVOCATION_STATUS_UNKNOWN` | O `curl` do Windows checa revogação, que a CA local não tem: use `--ssl-no-revoke`. Os navegadores não exigem isso |

## Como está montado

- **Os dois modos** vêm do `MODO` do `deploy/.env`. O `deploy/compose.sh` junta o `deploy/compose.yml` com o `compose.ip.yml` ou o `compose.nginx.yml` e calcula os endereços que a API e o build das telas usam. O Makefile passa por ele em todo comando.
- **Pelo IP:** o Caddy (`deploy/Caddyfile.ip`) publica as portas 8444 e 8443 com o HTTPS da CA local dele (`local_certs`), sem o redirecionamento de http, porque a porta 80 é do nginx.
- **Por nome:** o **nginx do servidor** (fora do Docker) tem as portas 80 e 443, o HTTPS e o arquivo `financeiro.conf` (modelo em `deploy/nginx/`). Ele repassa ao Caddy (`deploy/Caddyfile.nginx`) pelo HTTP em `127.0.0.1:8089`, com o `X-Forwarded-For` e o `X-Forwarded-Proto`, e o Caddy e a API confiam neles.
- Projeto `financeiro` no Docker. Só o Caddy publica porta; banco, MinIO, API, telas e feriados ficam na rede interna do Docker. Volumes: `financeiro_pgdata`, `financeiro_miniodata`, `financeiro_caddydata`, `financeiro_caddyconfig` e `financeiro_feriadosdata`.
- A API roda em **modo produção** (`ENVIRONMENT=production`): sem `/docs`, cookie de sessão seguro, Connect só por `https`, sem dados de exemplo nem Connect simulado. O MinIO fala `https` com um certificado gerado pelo `make configurar` em `deploy/certs/` (fora do git), e a API confia nele por `AWS_CA_BUNDLE`.
- O banco nasce com as roles do `docker/postgres/roles.sql`; o `make banco` troca as senhas delas pelas do `deploy/.env` a cada subida. As migrations rodam com a role `financeiro_migrator`, e a API usa a `financeiro_app`.
- **Feriados das capitais:** os containers `feriados` (o feriados.dev, construído do GitHub numa versão fixa) e `feriados-db` (o banco dele) ficam na rede interna. O primeiro build precisa de internet e leva alguns minutos. A API busca os feriados sozinha a cada 6 horas (`HOLIDAYS_SYNC_HOURS`). Para usar outras cidades, ponha os códigos do feriados.dev em `HOLIDAYS_LOCATIONS` no `deploy/.env` (ex.: `SP-sao-paulo,SP-campinas`) e rode `make subir`. O volume do feriados.dev não entra no backup: tudo nele é recarregado na subida. Os dados dele vão até 2027; para os anos seguintes, troque o commit do `feriados` no `deploy/compose.yml` por uma versão nova.
- O `docker-compose.yml` da raiz continua sendo só o do desenvolvimento.
- A CI testa este deploy num Ubuntu, nos dois modos, sempre que algo dele muda (`.github/workflows/deploy.yml`): verificar, configurar, subir com a conferência, o nginx na frente com o arquivo do `make nginx` (por nome), administrador e login, backup, voltar, restaurar os arquivos, subir o projeto com um pacote como o da máquina do desenvolvimento (`make subir-projeto`, com chaves novas, que também liga a atualização automática), trocar para o outro modo e voltar (`make trocar-endereco`) e desligar a atualização automática.

## Onde está cada coisa

| Arquivo | O que é |
|---|---|
| `Makefile` (raiz) | Todos os comandos acima |
| `deploy/compose.yml` | As partes e como se ligam |
| `deploy/compose.ip.yml`, `deploy/compose.nginx.yml` | O que muda em cada modo: portas e Caddyfile |
| `deploy/compose.sh` | O `docker compose` no modo do `deploy/.env` |
| `deploy/Caddyfile.ip`, `deploy/Caddyfile.nginx` | O Caddy de cada modo |
| `deploy/nginx/financeiro.conf` | Por nome: o modelo do arquivo do nginx (o `make nginx` preenche) |
| `deploy/endereco.sh` | Confere o `IP=` ou o `DOMINIO=` do make |
| `deploy/verificar.sh` | A verificação do `make verificar` |
| `deploy/atualizar-agendado.sh` | A atualização das 22h (`make agendar`) |
| `scripts/gerar-dump-local.sh` | Na máquina do desenvolvimento: o pacote do banco local para o `make restaurar-local` |
| `deploy/feriados/` | O preparo do banco do feriados.dev |
| `deploy/.env` | Chaves e endereço, gerado pelo `make configurar` (**fora do git**) |
| `financeiro-certificado-raiz.crt`, `financeiro.nginx.conf` | O certificado do `make certificado` e o arquivo do `make nginx` (**fora do git**) |
| `deploy/certs/`, `backups/` | Certificado interno do cofre, backups, logs da atualização automática (`backups/logs/`) e o pacote do banco local (**fora do git**) |
| `.github/workflows/deploy.yml` | A CI roda este deploy inteiro num Ubuntu, nos dois modos, sempre que algo dele muda |
