# ADR 0027: Dois jeitos de abrir o servidor: pelo IP, com o certificado da máquina, ou por nome, atrás do nginx

**Status:** Aceito, provisório (por nome, abrir para a internet ou só para a rede do escritório: Q64)
**Data:** 26/11/2026
**Quem decidiu:** pedidos no primeiro deploy do servidor (26/11/2026): "faça igual ao connect" e, enquanto não há nome no DNS, "deixar sem domínio, só o IP por enquanto", com os dois jeitos possíveis

## Contexto

O deploy do [ADR 0020](0020-servidor-local-com-docker-compose-e-caddy.md) punha o Caddy do Financeiro nas portas 80, 443 e 8443 da máquina, com a CA local dele. No servidor de verdade (192.168.30.15), as portas 80 e 443 já são do **nginx**, que atende outros sistemas da empresa, e o `make verificar` parou com "Porta(s) 80 443 em uso por outro programa".

O P+ Connect já resolveu isso no mesmo tipo de servidor ([deploy do Connect](https://github.com/pesquisemaisbrasil/Entrevistadores-Connect/blob/main/docs/operations/deploy.md), ADR 0022 de lá): o nginx fica na frente, com o HTTPS do certbot, e repassa a um Caddy que só escuta na própria máquina. Esse modelo pede nomes no DNS, e o Financeiro ainda não tem. O HTTPS continua obrigatório sem nome, porque o cookie de sessão é `Secure`.

## Decisão

O Financeiro tem **dois modos**, escolhidos no `make configurar` (`IP=` ou `DOMINIO=`) e gravados no `MODO` do `deploy/.env`. Os dois deixam as portas 80 e 443 com o nginx.

**Pelo IP** (`MODO=ip`, para agora):

- O Caddy cuida do HTTPS com a **CA local** dele, como no ADR 0020, mas em outras portas: telas em `https://IP:8444` e API em `https://IP:8443` (`PORTA_TELAS` e `PORTA_API`; a 80 e a 443 são recusadas). Sem o redirecionamento de http (`auto_https disable_redirects`), porque a porta 80 é do nginx.
- Volta o `make certificado`: cada computador da equipe instala o certificado raiz uma vez.
- O nginx não entra.

**Por nome, atrás do nginx** (`MODO=nginx`, quando houver nome), como o Connect:

- **O nginx do servidor** fica com o HTTPS (certbot, que renova sozinho). O Financeiro entra nele como um arquivo separado, `financeiro.conf`, sem mexer nos outros sistemas. O modelo é o `deploy/nginx/financeiro.conf`; o `make nginx` preenche os nomes e a porta e mostra os comandos de instalação, que pedem `sudo` e ficam com quem cuida da máquina.
- **O Caddy** escuta só em `127.0.0.1:PORTA_LOCAL` (padrão 8089; o Connect usa a 8088), por HTTP (`auto_https off`), e escolhe telas ou API pelo nome. Ele confia no `X-Forwarded-For` e no `X-Forwarded-Proto` do nginx (`trusted_proxies private_ranges`); o nginx substitui o `X-Forwarded-For` do cliente pelo IP que recebeu.
- **Endereços:** telas em `https://DOMINIO` e API em `https://DOMINIO_API` (padrão `api.DOMINIO`), como `connect.` e `api.connect.`. Telas e API no mesmo domínio-base continuam o mesmo "site" para o cookie `SameSite=Strict`.
- **Só a rede do escritório**, por enquanto: o `financeiro.conf` libera as faixas privadas e nega o resto. Abrir para a internet fica com a Q64.
- **Sem log de acesso** no nginx (IP é dado pessoal), **envio até 30 MB** (a parte do PDF de comprovantes tem 25 MB; o padrão do nginx é 1 MB) e até 5 minutos de resposta.

**O que vale para os dois:**

- A API continua num endereço próprio, sem prefixo, porque o cookie de sessão é do caminho `/auth`.
- **`deploy/compose.sh`** é o `docker compose` do servidor: junta o `compose.yml` com o `compose.ip.yml` ou o `compose.nginx.yml` (portas e Caddyfile do modo) e calcula `URL_TELAS` e `URL_API`, que a API e o build das telas usam. O Makefile passa por ele em todo comando.
- **`deploy/endereco.sh`** confere o `IP=` ou o `DOMINIO=` (formato, portas, um só dos dois) e escreve as linhas do endereço. `HOST=` é recusado, com a dica de usar `IP=`.
- **`make trocar-endereco IP=...|DOMINIO=...`** troca só as linhas do endereço no `deploy/.env` (guarda o de antes em `backups/`), depois de verificar o servidor para o endereço novo, e roda o `make subir`. Chaves, banco e arquivos ficam como estão; o certificado raiz do modo IP também (volume `caddydata`).
- **`make conferir`:** pelo IP, pelo HTTPS com o certificado raiz (erro se falhar); por nome, pelo Caddy local com o nome certo (erro) e depois pelo HTTPS do nginx (só aviso, porque na primeira instalação o nginx é ligado depois do `make subir`).
- **`make verificar`** confere as portas do modo (8444 e 8443, ou 8089) e, por nome, o nginx (erro) e o certbot (aviso). As portas 80 e 443 não são mais conferidas.
- `make atualizar`, `make agendar` (a atualização das 22h) e `make voltar` não mudam: todos passam pelo `make subir`.

## Alternativas consideradas

- **Só por nome, atrás do nginx:** era a primeira versão desta decisão (26/11), mas o servidor ainda não tem nome no DNS, e sem nome não há certbot nem como o nginx separar o Financeiro dos outros sistemas na porta 443.
- **O nginx também no modo IP, em outra porta:** o nginx precisaria de um certificado feito à mão para o IP, renovado por alguém. O Caddy faz isso sozinho.
- **O nginx direto nas telas e na API, sem o Caddy:** um container a menos, mas fugiria do modelo do Connect, e o nginx teria de alcançar portas publicadas da API e das telas.

## Consequências

- Pelo IP, cada computador da equipe instala o certificado raiz (como no ADR 0020) e abre o endereço com a porta (`:8444`). Na troca para o nome, deixam de precisar dele.
- Por nome, pede da TI os dois nomes no DNS e, para o certbot, que sejam públicos e a porta 80 alcance o servidor pela internet. Se forem só internos, o certificado é o da empresa, posto à mão no `financeiro.conf` do `/etc/nginx`. Se o DNS público levar os computadores do escritório ao IP público e o roteador não devolver o IP interno, o nginx nega (403): o DNS interno resolve.
- Copiar o `financeiro.conf` de novo para o `/etc/nginx` apaga o HTTPS que o certbot pôs nele: depois de copiar, rode o certbot outra vez (o `make nginx` avisa).
- Os navegadores liberados (ADR 0022) são por endereço: depois de um `make trocar-endereco`, cada computador vira pedido de novo.
- Um `deploy/.env` sem `MODO` (do ADR 0020 ou da primeira versão desta decisão) para no `deploy/compose.sh` com a dica do `make trocar-endereco`. Em 26/11 nenhum servidor tinha subido com eles.
- A CI do deploy roda os dois modos (matriz `ip` e `nginx`): cada um sobe, faz o login (pelo IP com o certificado raiz; por nome através do nginx), backup, `make voltar`, `make subir-projeto`, troca para o outro modo e volta.
- Arquivos: `deploy/compose.yml`, `deploy/compose.ip.yml`, `deploy/compose.nginx.yml`, `deploy/compose.sh`, `deploy/endereco.sh`, `deploy/Caddyfile.ip`, `deploy/Caddyfile.nginx`, `deploy/nginx/financeiro.conf`, `deploy/verificar.sh`, `Makefile` (`configurar`, `conferir`, `certificado`, `nginx`, `trocar-endereco`, `subir-projeto`), `.github/workflows/deploy.yml`, `DEPLOY.md`.
