# Testar a integração com o Connect de dev

Guia do João com os endereços, escopos e exemplos de cada rota: [connect-dev-integracao-financeiro.md](../connect-dev-integracao-financeiro.md). Este arquivo diz **como rodar o nosso teste contra esse ambiente** e o que ele confere.

> O dev tem só dado fictício. O teste dá baixa e desfaz a baixa de itens do dev: **nunca aponte para produção**. O comando recusa qualquer endereço que não seja o do dev.

## O que precisa

1. O João cria a conta de serviço `financeiro-dev` no servidor de dev, com os escopos `projects:read, payables:read, interviewers:read, interviewers:pix:read, pix:match, payments:write, events:read`. O segredo aparece **uma vez só**.
2. O segredo chega ao Bruno por um canal seguro (nunca por chat, e-mail ou print) e vai para `backend/.env.connect`, que o git ignora:

```
CONNECT_BASE_URL=https://api.dev.connect.pesquisemais.com.br
CONNECT_CLIENT_ID=financeiro-dev
CONNECT_CLIENT_SECRET=<o segredo>
```

Os endereços aceitos são só os do dev: `api.dev.connect.pesquisemais.com.br`, `connect-dev-api` (rede interna do dev), `localhost` e `127.0.0.1`.

## Rodar

De dentro de `backend/`:

```bash
python scripts/connect_dev_check.py
```

Sai com 0 se tudo passou (passos pulados não contam como falha), 1 se algum passo falhou e 2 se faltou configuração ou o endereço não é o do dev. O resumo mostra uma linha por passo (`OK`, `FALHOU`, `PULADO`) e o motivo.

## O que o roteiro confere

Segue o "roteiro rápido de teste" do guia do João (seção 7), numa pessoa e num projeto fictícios do dev:

| Passo | O que confere |
|---|---|
| Token | A conta entra, e um token de escopo mínimo (`projects:read`) é recusado na baixa (403 `insufficient_scope`) |
| Leitura | Projetos, itens a pagar de um projeto (com o filtro de situação), dados do entrevistador |
| Chave Pix | `payment-data` devolve a chave completa e `pix-key-matches` reconhece de quem é (a chave não é gravada nem aparece no resultado) |
| Baixa | `POST /payments` com a soma certa aplica; repetir a mesma chave devolve a mesma resposta; mesma chave com corpo diferente dá 409 `idempotency_conflict` |
| Consulta | `GET /payments/{ref}` acha a baixa, e uma inexistente dá 404 |
| Recusas | Item já pago (`already_paid`), valor diferente da soma (`amount_mismatch`) |
| Cancelamento | `reversal` devolve os itens para "a pagar"; repetir com chave nova dá 409 `not_reversible` |
| Feed | `GET /events` mostra `payment.applied` e `payment.reversed` (só eventos com 5 s ou mais, por isso o teste espera) |
| Limpeza | Se um passo falhar no meio, ou o Connect aceitar o que devia recusar, a baixa que ficou é desfeita. Se não der para desfazer, o passo "Limpeza" falha e diz qual baixa desfazer à mão |

Quando uma resposta não traz um campo que o contrato do handoff/07 promete, o passo falha dizendo **o nome do campo** ("campo ausente na resposta: 'x'"). É assim que a primeira rodada real mostra onde o contrato escrito e o Connect divergem.

## Sem o Connect de dev

Nada disso é necessário para os testes do projeto: o `verify-delivery.sh` e o E2E usam um Connect simulado (`CONNECT_MODE=simulated` e o `FakeConnectDev` de `backend/tests/test_connect_check.py`, que obedece ao mesmo contrato). O comando acima é só para conferir o Connect de verdade.

## Onde está no código

- Cliente HTTP: `backend/services/connect_http.py` (token com cache e renovação, `Idempotency-Key` nas escritas, sem nova tentativa automática em escrita).
- Roteiro: `backend/services/connect_check.py`. Comando: `backend/scripts/connect_dev_check.py`.
- Testes: `backend/tests/test_connect_http.py`, `test_connect_check.py` e `test_connect_dev_script.py`.

## O que ainda não existe

- Receptor do webhook (`/integrations/v1/connect-events`, com a assinatura `X-Signature` e `CONNECT_WEBHOOK_SECRET`). Enquanto isso, o Financeiro lê o feed `GET /events`.
- Chamadas de orçamento (`/projects/{id}/budget`) e de situação fiscal (`/projects/{id}/fiscal-status`).
- Em **produção**, as rotas de integração só existem na rede interna do Connect: por fora respondem 404. O endereço e o caminho de rede para produção são do João (ver o [roteiro](../planning/roteiro-com-o-joao.md)).
