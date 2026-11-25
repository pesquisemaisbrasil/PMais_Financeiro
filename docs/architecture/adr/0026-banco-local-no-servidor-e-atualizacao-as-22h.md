# ADR 0026: Banco local levado ao servidor num pacote com as chaves, e atualização automática às 22h

**Status:** Aceito (provisório: o banco local vai uma vez, antes de a equipe lançar no servidor)
**Data:** 25/11/2026

## Contexto

Em 24/11/2026 o Bruno populou o banco da máquina dele com os cadastros e os relatórios do sistema antigo (SGE4B), com os scripts `importar_cadastros.py`, `importar_relatorio_antigo.py` e `importar_relatorio_receber_antigo.py`. Desde 23/11 o servidor do escritório começa com o banco vazio e recebe dado real (Q51). O Bruno pediu:

- um dump do banco local para o João subir no servidor: "Quero o dump do banco inteiro de tudo que subimos para o nosso local, leve senhas de usuários e usuários cadastrados e tudo mais";
- os backups numa pasta do servidor que não vai para o git;
- "uma rotina com cron que atualiza o projeto, no caso na branch de development, todo dia no final do dia", às 22h.

Copiar só o banco não basta:

- O banco guarda a chave do autenticador **cifrada** com a `ENCRYPTION_KEY`.
- Os anexos do cofre estão cifrados com a `FILES_MASTER_KEY`.
- A chave de repetição de cada linha importada dos relatórios é um HMAC com a `PIX_SECRET_KEY`.

O `make configurar` gera chaves novas no servidor. Com elas, os autenticadores e os anexos não abririam, e o mesmo relatório entraria de novo.

## Decisão

### O pacote do banco local

O `scripts/gerar-dump-local.sh` roda na máquina do desenvolvimento e gera em `backups/`, fora do git:

| Arquivo | O que leva |
|---|---|
| `local-<data>-banco.dump` | O `pg_dump -Fc` do banco inteiro: cadastros, lançamentos, histórico e as contas de acesso, com o hash das senhas, os autenticadores e os navegadores liberados |
| `local-<data>-arquivos.tgz` | O volume do MinIO, no mesmo formato do `make backup` do servidor. Os dois usam a mesma imagem do MinIO |
| `local-<data>-chaves.env` | Só a `ENCRYPTION_KEY`, a `PIX_SECRET_KEY` e a `FILES_MASTER_KEY` do `backend/.env` |

O `SECRET_KEY` não vai. Ele assina as sessões e o HMAC do e-mail nas tentativas de login. Com o do servidor, as sessões da máquina local não valem lá, e as tentativas antigas só deixam de contar para o limite.

### A restauração no servidor

O `make restaurar-local ARQUIVO=backups/local-<data>-banco.dump CONFIRMAR=sim` faz, em ordem:

1. **Confere o pacote.** Os três arquivos têm de estar presentes e as três chaves preenchidas. A versão do banco do pacote (`alembic_version`) tem de existir no código do servidor; se não existir, recusa e pede `make atualizar` antes.
2. **Faz o `make backup`** do que está no servidor.
3. **Troca as três chaves no `deploy/.env`.** Guarda antes o arquivo de antes em `backups/env-antes-do-local-<data>.env`.
4. **Restaura o banco e os arquivos** com o `restaurar-banco` e o `restaurar-arquivos` que já existiam.
5. **Sobe tudo** com o `make subir`, que termina conferindo pelo HTTPS.

### Tudo de uma vez na primeira instalação

O `make subir-projeto HOST=<IP> CONFIRMAR=sim` junta tudo, para a primeira instalação com o pacote em `backups/` (pedido do Bruno, 25/11: "Ligue tudo isso a um make subir projeto"):

1. confere o pacote (`make conferir-pacote`) antes de mexer em qualquer coisa. A versão do banco é lida por um Postgres de passagem, da mesma imagem do banco;
2. roda o `make configurar`, se o `deploy/.env` ainda não existe;
3. roda o `make subir`;
4. roda o `make restaurar-local`;
5. roda o `make agendar` e o `make certificado`.

Sem `PACOTE=`, usa o pacote mais novo de `backups/`.

### A atualização automática

O `make agendar` põe no `crontab` do usuário uma linha para rodar o `deploy/atualizar-agendado.sh` todo dia às 22h (`HORA=` muda a hora). A linha leva o caminho do repositório, e o `make desagendar` tira só ela.

O script:

- **Sem versão nova na `development`:** só faz o `make backup`. Isso substitui a linha de backup diário da seção 4 do DEPLOY.md.
- **Com versão nova:** roda o `make atualizar`. Se a versão foi trocada e não subiu, roda o `make voltar` sozinho, com o backup que acabou de fazer.
- **Trava:** o `flock` impede duas atualizações ao mesmo tempo.
- **Credenciais do git:** com `GIT_TERMINAL_PROMPT=0`, o script falha em vez de esperar uma senha.
- **Log:** o de cada noite fica em `backups/logs/`.

O `make status` mostra se a atualização automática está ligada. O `make verificar` avisa quando o fuso da máquina não é `America/Sao_Paulo`.

## Consequências

- **Contas de acesso:**
  - no servidor, valem as contas da máquina do desenvolvimento, com as mesmas senhas e autenticadores;
  - a conta criada antes no servidor com `make admin` some com a restauração e é criada de novo;
  - essas contas já têm navegadores liberados (os da máquina local), então o primeiro computador de cada uma no servidor vira pedido em **Acessos** (ADR 0022). O super admin não passa por isso e libera os outros.
- **Uma vez só.** Depois que a equipe lançar no servidor, um pacote novo apagaria o que ela lançou. Os relatórios do sistema antigo que vierem depois entram pelos scripts no próprio servidor, com o arquivo lido pela entrada padrão. A pasta `importar/` saiu do repositório em 25/11: o servidor recebe os dados pelo dump, e o `.gitignore` continua barrando a pasta e os .csv.
- **O pacote é segredo:** tem dado real, os hashes das senhas e as chaves. Vai por um meio seguro, nunca pelo git nem por e-mail aberto. O arquivo de chaves é apagado das duas máquinas depois da restauração, e o `deploy/.env` novo vai para o cofre (Q51).
- **A volta automática só não perde nada porque às 22h ninguém está lançando.** Ela restaura o banco do backup feito minutos antes. Na noite seguinte, a atualização tenta a mesma versão de novo, até a correção chegar à `development`. Se a volta também falhar, o sistema pode ficar fora do ar até alguém olhar: o log diz o que aconteceu.
- **Os backups crescem um por dia.** Nada apaga os antigos: para onde vão e por quanto tempo, o DPO responde (Q51). O log de cada noite é pequeno e não tem dado pessoal.
- **Os arquivos de teste do cofre vão junto:** dois anexos de exemplo, sem lançamento que aponte para eles.
- **Alternativas descartadas:**
  - **Só os dados, sem as contas de acesso:** o Bruno pediu o banco inteiro.
  - **Rodar os scripts de importação no servidor:** os .csv e os relatórios teriam de ir para lá, e a rotina se repetiria passo a passo.
  - **Atualização automática sem a volta:** uma versão que não sobe deixaria o sistema fora do ar até de manhã.
  - **A cada push na `development`:** o Bruno escolheu uma vez por dia, no fim do dia.
