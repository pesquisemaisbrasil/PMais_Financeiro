# ADR 0027: nginx do servidor na frente do Caddy, como no P+ Connect

**Status:** Aceito, provisório (abrir para a internet ou só para a rede do escritório: Q64)
**Data:** 26/11/2026
**Quem decidiu:** pedido no primeiro deploy do servidor (26/11/2026): "faça igual ao connect"

## Contexto

O deploy do [ADR 0020](0020-servidor-local-com-docker-compose-e-caddy.md) punha o Caddy do Financeiro nas portas 80, 443 e 8443 da máquina, com a CA local dele. No servidor de verdade (192.168.30.15), as portas 80 e 443 já são do **nginx**, que atende outros sistemas da empresa, e o `make verificar` parou com "Porta(s) 80 443 em uso por outro programa". O P+ Connect já resolveu isso no mesmo tipo de servidor ([deploy do Connect](https://github.com/pesquisemaisbrasil/Entrevistadores-Connect/blob/main/docs/operations/deploy.md), ADR 0022 de lá): o nginx fica na frente, com o HTTPS, e repassa a um Caddy que só escuta na própria máquina.

## Decisão

O Financeiro segue o modelo do Connect:

- **O nginx do servidor** fica com as portas 80 e 443 e o HTTPS (certbot, que renova sozinho). O Financeiro entra nele como um arquivo separado, `financeiro.conf`, sem mexer nos outros sistemas. O modelo é o `deploy/nginx/financeiro.conf`; o `make nginx` preenche os endereços e a porta do `deploy/.env` e mostra os comandos de instalação, que pedem `sudo` e ficam com quem cuida da máquina.
- **O Caddy do Financeiro** escuta só em `127.0.0.1:PORTA_LOCAL` (padrão 8089; o Connect usa a 8088), por HTTP (`auto_https off`), e escolhe telas ou API pelo nome. Ele confia no `X-Forwarded-For` e no `X-Forwarded-Proto` do nginx (`trusted_proxies private_ranges`). Nenhuma outra porta do Financeiro é publicada.
- **Endereços por nome**, porque o nginx separa os sistemas pelo nome: telas em `https://DOMINIO` e API em `https://DOMINIO_API` (padrão `api.DOMINIO`), como `connect.` e `api.connect.`. A API continua num endereço próprio, sem prefixo, porque o cookie de sessão é do caminho `/auth`; telas e API no mesmo domínio-base continuam o mesmo "site" para o `SameSite=Strict`. O `make configurar DOMINIO=...` grava `DOMINIO`, `DOMINIO_API` e `PORTA_LOCAL` no `deploy/.env` no lugar do `SERVER_HOST`. `HOST=` na linha de comando e IP como `DOMINIO` são recusados.
- **Só a rede do escritório**, por enquanto: o `financeiro.conf` libera as faixas privadas (`10/8`, `172.16/12`, `192.168/16` e a própria máquina) e nega o resto. O Financeiro tem dado financeiro e chave Pix, e a decisão de 17/11 (ADR 0020) era "acesso pela rede". Abrir para a internet é tirar essas linhas, e fica com a Q64.
- **Sem log de acesso** no nginx (`access_log off`), como no Connect: IP é dado pessoal.
- **Envio até 30 MB** no nginx (`client_max_body_size`; o padrão dele é 1 MB): a maior parte enviada é a do PDF de comprovantes, 25 MB. Tempo de resposta de até 5 minutos, para a leitura de comprovantes e as exportações.
- **`make conferir`** testa as telas e o `/readyz` no Caddy local, com o nome certo (é isso que barra o `make subir`, a atualização das 22h e o `make voltar`), e depois pelo HTTPS do nginx, só com aviso, porque na primeira instalação o nginx é ligado depois do `make subir`.
- **`make verificar`** passa a conferir o nginx instalado (erro), o certbot (aviso), a porta local livre ou do próprio Financeiro (erro), as portas 80 e 443 no `ufw` (aviso) e se os dois nomes são encontrados na rede (aviso).
- Sai o `make certificado`: o certificado é do nginx, e os computadores da equipe não instalam mais nada.

`make atualizar`, `make agendar` (a atualização das 22h) e `make voltar` não mudam: todos passam pelo `make subir`, que verifica, sobe e confere pelo Caddy local.

## Alternativas consideradas

- **Só trocar as portas do Caddy** (ex.: telas em `:9443`), sem o nginx: menos mudança, mas o Financeiro ficaria o único sistema da máquina fora do nginx, com a CA local instalada em cada computador e o endereço com porta.
- **O nginx direto nas telas e na API, sem o Caddy:** um container a menos, mas o modelo deixaria de ser o do Connect, e o nginx teria de alcançar portas publicadas da API e das telas.
- **Telas e API por IP no nginx:** com outros sistemas na mesma porta 443, o nginx não tem como separar o Financeiro sem nome ou sem outra porta, e o certbot não emite certificado para IP.

## Consequências

- Pede da TI: os dois nomes no DNS apontando para o servidor, e, para o certbot, que os nomes sejam públicos e a porta 80 alcance o servidor pela internet (como no Connect). Se os nomes forem só da rede interna, o certificado é outro (da empresa), posto no `financeiro.conf` do `/etc/nginx` no lugar do certbot.
- Copiar o `financeiro.conf` de novo para o `/etc/nginx` apaga o HTTPS que o certbot pôs nele: depois de copiar, rode o certbot outra vez (o `make nginx` avisa).
- Se o DNS público levar os computadores do escritório ao IP público e o roteador não devolver o IP interno, o nginx vê um IP de fora e nega (403). Aí, ou o DNS interno aponta os nomes para o IP interno, ou a Q64 decide abrir.
- Instalações antigas (com `SERVER_HOST` no `deploy/.env`) precisam do `DOMINIO`, do `DOMINIO_API` e da `PORTA_LOCAL` no lugar dele. Em 26/11 nenhum servidor tinha subido com o modelo anterior.
- A CI do deploy instala o nginx do Ubuntu, liga o arquivo do `make nginx` e testa telas, `/readyz` e o login através dele (sem certbot).
- Arquivos: `deploy/compose.yml` (serviço `proxy`), `deploy/Caddyfile`, `deploy/nginx/financeiro.conf`, `deploy/verificar.sh`, `Makefile` (`configurar`, `conferir`, `nginx`, `subir-projeto`), `.github/workflows/deploy.yml`, `DEPLOY.md`.
