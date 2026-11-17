# Deploy do Financeiro no servidor local

O passo a passo para instalar e manter o Financeiro no servidor do escritório (Ubuntu), a partir da branch `development`. Tudo é feito pelo `Makefile` da raiz. Os detalhes, a explicação de cada parte e a solução de problemas estão no guia completo: [operations/servidor-local.md](../operations/servidor-local.md). O porquê das escolhas está no [ADR 0020](../architecture/adr/0020-servidor-local-com-docker-compose-e-caddy.md).

## O que sobe

| Parte | O que é | Onde a equipe acessa |
|---|---|---|
| Banco | Postgres 16 | não é exposto |
| Cofre de arquivos | MinIO (anexos cifrados), com TLS | não é exposto |
| API | o backend, em modo produção; as migrations rodam quando ela sobe | `https://<IP do servidor>:8443` |
| Telas | o frontend | `https://<IP do servidor>` |
| HTTPS | Caddy, com certificado da própria máquina | portas 80 (redireciona), 443 e 8443 |

## Antes de começar

- [ ] Servidor **Ubuntu** com IP fixo na rede (reservado no roteador).
- [ ] Docker, Compose, make, git, openssl e curl instalados, e as portas 80, 443 e 8443 liberadas no `ufw`. Os comandos estão em [O que precisa ter no servidor](../operations/servidor-local.md#o-que-precisa-ter-no-servidor-ubuntu).
- [ ] **Dado real:** o DPO aprovou onde ficam o banco, os backups e as chaves (pergunta Q51 em [perguntas-abertas](../planning/perguntas-abertas.md)). Sem isso, o servidor pode subir, mas não recebe dado de verdade.

## Primeira instalação

No servidor, com o seu usuário (não o root):

```bash
git clone https://github.com/pesquisemaisbrasil/PMais_Financeiro.git financeiro
cd financeiro
git checkout development

make verificar HOST=192.168.0.50     # confere se o servidor está pronto; não muda nada
make configurar HOST=192.168.0.50    # gera deploy/.env com chaves novas (só se a verificação passar)
make subir                           # sobe tudo e termina testando pelo HTTPS (o primeiro build leva alguns minutos)
make admin EMAIL=voce@pesquisemais.com.br NOME="Seu nome"    # primeiro administrador; pede a senha
make certificado                     # gera financeiro-certificado-raiz.crt para os computadores
```

Troque `192.168.0.50` pelo IP (ou nome) do servidor, sem `http://` nem porta.

Depois:

1. **Guarde o `deploy/.env` num cofre, fora do servidor.** Ele tem as chaves que abrem os dados; sem elas, banco e arquivos não abrem. Ele nunca vai para o git.
2. **Instale o `financeiro-certificado-raiz.crt` em cada computador da equipe** (no Windows: clique duas vezes → Instalar Certificado → Autoridades de Certificação Raiz Confiáveis). O passo a passo para Windows, macOS e Linux está no [guia](../operations/servidor-local.md#certificado-nos-computadores-da-equipe).
3. Abra `https://<IP do servidor>` num computador da rede e entre com o administrador; o primeiro acesso cadastra o autenticador (MFA).
4. Para ligar o **P+ Connect**, preencha `CONNECT_BASE_URL` (só `https`), `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `deploy/.env` e rode `make subir`.
5. Agende o **backup diário** no `crontab -e` (a linha está no [guia](../operations/servidor-local.md#backup-automático-recomendado)) e leve as cópias para fora do servidor.

## Versão nova

Quando a `development` tiver uma versão nova:

```bash
make atualizar
```

Ele faz backup (banco, arquivos e a versão do código em `backups/`), baixa a `development`, gera as imagens novas, aplica as migrations e confere pelo HTTPS. Recusa se alguém tiver mudado arquivos do repositório no servidor.

## Se a versão nova der problema

O `make atualizar` mostra o comando pronto. Ele é assim:

```bash
make voltar ARQUIVO=backups/banco-<data>.dump CONFIRMAR=sim
```

Volta o código para a versão desse backup e **troca o banco pelo do backup**: o que foi lançado depois dele se perde. Se o problema for só de tela, é melhor esperar a correção e rodar `make atualizar` de novo. Quando a correção sair, `make atualizar` volta para a `development`.

## Comandos do dia a dia

| Comando | Para quê |
|---|---|
| `make` | Lista todos os comandos |
| `make status` | Versão no ar e a saúde de cada parte |
| `make conferir` | Testa as telas e a API pelo HTTPS |
| `make logs` / `make logs SERVICO=api` | Acompanha os logs |
| `make parar` / `make subir` | Para tudo (sem apagar nada) e sobe de novo |
| `make backup` | Backup na hora, em `backups/` |
| `make restaurar-banco ARQUIVO=... CONFIRMAR=sim` | **Apaga** o banco e põe o de um backup |
| `make restaurar-arquivos ARQUIVO=... CONFIRMAR=sim` | **Apaga** os arquivos do cofre e põe os de um backup |

Os containers voltam sozinhos quando o servidor reinicia, e os logs têm tamanho limitado.

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| `make verificar` mostra `[ERRO]` | Cada linha traz o comando para resolver; rode `make verificar` de novo depois |
| Porta 80, 443 ou 8443 em uso | `sudo ss -ltnp \| grep -E ':(80\|443\|8443) '` mostra quem usa. Se ninguém precisa do programa, desligue; se precisa, fale com o desenvolvimento (as portas do Financeiro ainda são fixas) |
| O navegador diz que a conexão não é segura | Falta instalar o certificado raiz nesse computador |
| A tela abre, mas o login diz "Sem conexão com o servidor" | Porta 8443 fechada no firewall do servidor, ou certificado não instalado |
| `make subir` para com uma parte "unhealthy" | `make logs SERVICO=api` (ou `db`, `proxy`) |

A lista completa está no [guia](../operations/servidor-local.md#solução-de-problemas).

## Onde está cada coisa

| Arquivo | O que é |
|---|---|
| `Makefile` (raiz) | Todos os comandos acima |
| `deploy/compose.yml` | As cinco partes e como se ligam |
| `deploy/Caddyfile` | O HTTPS |
| `deploy/verificar.sh` | A verificação do `make verificar` |
| `deploy/.env` | Chaves e endereço, gerado pelo `make configurar` (**fora do git**) |
| `deploy/certs/`, `backups/` | Certificado interno do cofre e backups (**fora do git**) |
| `.github/workflows/deploy.yml` | A CI roda este deploy inteiro num Ubuntu sempre que algo dele muda |
