# Roteiro da conversa com o João: o que decidir e o que fazer

**Posição em 12/11/2026.** Este roteiro é para o Bruno conduzir uma conversa de uns 40 minutos com o João (dono do projeto) e fechar o que está parado. Ele **complementa** a [pauta para o João](pauta-para-o-joao.md): a pauta tem a lista completa e este roteiro diz, tarefa por tarefa do Jira, **o que já está pronto, o que perguntar, o que o Bruno faz e o que acontece depois da resposta**.

As quatro tarefas abertas da sprint estão todas esperando uma pessoa. Nenhuma depende de mais código.

## Resumo

| Tarefa | O que já está pronto | O que trava | Quem responde |
|---|---|---|---|
| **PF-53** Impedir que alguém de fora trave o login | A proposta está escrita (D2 da pauta) | Decisão da regra de bloqueio | João |
| **PF-55** Inventário de dados e ROPA do login | Inventário e ROPA já cobrem o login; a rotina de limpeza está escrita e desligada | Prazo de guarda (Q26) | DPO |
| **PF-58** Levar ao João as decisões e as datas do Connect | A pauta está pronta | A conversa em si, e as datas das entregas 1 a 8 | João e time do Connect |
| **PF-65** Contas a receber, fatia 3 | Anexos da nota e faixas de atraso feitos | Falta 1 critério: receita da ficha do projeto (Q43, nova) | João (Connect) e Vivi |

Para responder, o João só precisa dizer o número e "aceito", "outra" ou "depois". Exemplo: "PF-53 aceito, Q43 opção b, Connect: entrega 1 em tal data".

---

## 1. PF-53: bloqueio de login (decisão do João)

**Pergunta:** quando alguém erra a senha 10 vezes em uma hora no mesmo e-mail, o sistema recusa até a senha certa. Para travar a conta de outra pessoa basta saber o e-mail, e o do João aparece na tela de login do Connect. Podemos contar as falhas por **e-mail e rede juntos**?

| Opção | O que muda | Risco |
|---|---|---|
| **(a) Aceitar a proposta (recomendada)** | Falhas vindas de outra rede deixam de travar a pessoa | Um ataque vindo de muitos IPs fica limitado só pelas 5 tentativas por minuto de cada IP |
| (b) Manter como está | Nada | Qualquer um trava a conta de qualquer pessoa, de hora em hora |
| (c) Outra, por exemplo bloqueio progressivo | Espera mais a cada falha | Mais código e mais regra para explicar |

**Depois da resposta:** a regra 9 de [acesso-e-auditoria](../specs/acesso-e-auditoria.md) é reescrita, entra um teste provando que falhas de outra rede não travam a pessoa, e o PF-53 fecha. É pouco código.

**O Bruno faz:** levar a opção recomendada e anotar a resposta.

## 2. PF-55: guarda dos registros de login (decisão do DPO)

**O que já está pronto:** [inventário de dados](../architecture/seguranca/inventario-de-dados.md) e [ROPA](../architecture/seguranca/lgpd/ropa.md) cobrem o login. A rotina `purge_login_data.py` já existe e só apaga com prazo configurado.

**Pergunta ao DPO (Q26):** por quanto tempo guardar as tentativas de login e as sessões?

- **Proposta:** **6 meses** para tentativas de login (Marco Civil, art. 15) e **30 dias depois de expirar** para sessões.
- **Depois da resposta:** configurar `LOGIN_EVENTS_RETENTION_DAYS` e `REFRESH_TOKENS_RETENTION_DAYS`, ligar a rotina, escrever o prazo no inventário e no ROPA, e fechar o PF-55.

**O Bruno faz:** pedir ao João o contato do DPO, ou levar a proposta junto.

## 3. PF-58: entregas do Connect e perguntas abertas (conversa com o João)

**Pronto quando** cada entrega do Connect tem data e responsável, e cada pergunta tem resposta ou uma nova data para responder.

### 3.1 Entregas do Connect ([entregas-do-connect](../specs/entregas-do-connect.md))

O time do Connect preenche **data** e **responsável** de cada uma. As que mais importam:

| # | Entrega | Sem ela |
|---|---|---|
| 1 | Dados de pagamento e busca por chave Pix | Não sai a planilha de pagamento ao banco, e a baixa por comprovante em produção responde 503 |
| 2 | Baixa (`POST /payments`) com chave de idempotência | "Confirmar baixa" só funciona com o Connect simulado |
| 6 | `FINANCE_EXTERNAL_ENABLED` | Risco de o mesmo Pix ser baixado nos dois sistemas |
| 3, 4, 5, 7, 8 | Eventos, feed, modelo fiscal, exemplos JSON e cancelamento de baixa | Podem vir depois (a 8 só depois da D5) |

### 3.2 Perguntas para o teste com o projeto piloto (projeto 3 no Connect de produção)

O João mandou o guia do **Connect de dev** ([connect-dev-integracao-financeiro](../connect-dev-integracao-financeiro.md)), que responde parte do que perguntávamos. O Financeiro já tem o cliente das rotas e um roteiro de teste ([como rodar](../operations/testar-com-o-connect-dev.md)); **falta só a conta de serviço**.

**Respondido pelo guia (12/11):**

- Endereço: no dev, `https://api.dev.connect.pesquisemais.com.br` (ou `http://connect-dev-api:8000` na rede interna do dev). Em **produção** as rotas só existem na **rede interna**, e por fora dão 404 (era o 404 que víamos).
- Ambiente de teste: existe (o dev, só com dado fictício).
- Quem cria a conta: o João, com `create_service_client.py`, e o segredo aparece uma vez só.
- `GET /payables` aceita `projectId` sozinho (`interviewerId` é só mais um filtro). O roteiro de teste confirma na primeira rodada real.
- Orçamento do projeto: existe em `/projects/{id}/budget`. **Receita (valor vendido)** o guia não cita.

Perguntar ao João:

1. Crie a conta `financeiro-dev` com os escopos `projects:read, payables:read, interviewers:read, interviewers:pix:read, pix:match, payments:write, events:read`, e entregue o segredo ao Bruno por **canal seguro**. O segredo nunca vai por chat, e-mail ou print, e fica só no `backend/.env.connect`.
2. Há **restrição de rede** (lista de IPs permitidos) para chamar o dev a partir da máquina do Bruno?
3. Para **produção**: por qual caminho de rede o Financeiro chega à API interna, e quando?
4. A API de projetos devolve a **receita** do projeto? Isso responde a Q43 (abaixo) e a Q40.
5. A entrega 6 (`FINANCE_EXTERNAL_ENABLED`) está pronta no dev? O guia não fala dela.
6. Para o webhook: o Connect de dev pode chamar o Financeiro de dev (`/integrations/v1/connect-events`), e quem guarda o `CONNECT_WEBHOOK_SECRET`? Hoje o Financeiro ainda não recebe o webhook, só lê o feed.

### 3.3 Decisões que o João toma (D3 a D8 da pauta)

Resumo, com a proposta de cada uma. O detalhe está na [pauta](pauta-para-o-joao.md).

| # | Pergunta | Proposta |
|---|---|---|
| D3 (Q20) | A baixa pede reautenticação para quem entra por Google ou Microsoft? | Sim, sempre, antes de "Confirmar baixa" |
| D4 (Q18, Q19) | Qual produto substitui o MinIO? O PDF do comprovante fica guardado? | Manter o PDF descartado no fluxo de comprovantes até o DPO responder. **Novo:** a tela Incentivos já anexa o PDF de comprovante ao lançamento (provisório, pedido do Bruno); se o DPO disser "não guardar", essa função sai |
| D5 (Q4, Q8) | Cancelar baixa existe? A partir de que valor há dupla aprovação? | Não existe até haver uso real; se vier, com dupla aprovação |
| D6 (Q22, Q23) | Pode guardar a chave Pix do respondente e o CPF de fornecedor? | Manter só a chave **mascarada** e só CNPJ de fornecedor |
| D7 (F3) | Plano de contas completo e linhas do DRE | Vivi e direção entregam a lista oficial |
| D8 (F23, F25) | Tipo de projeto, "tem incentivo" e prazo se marcam no Connect ou no Financeiro? Entrevistador: um lançamento por projeto e data, ou por ciclo? | Hoje no Financeiro; um lançamento por projeto e data |

## 4. PF-65: receita da ficha do projeto (pergunta nova, Q43)

**O que falta:** o último critério de aceite de [contas-a-receber](../specs/contas-a-receber.md): "a receita da ficha do projeto bate com a soma dos títulos; diferença mostra aviso". O espelho de projeto que o Financeiro tem **não guarda nenhum valor de receita**, então não há com o que comparar.

**Pergunta:** de onde vem a "receita da ficha do projeto" (a tela financeira do projeto no Connect, `admin/projetos/<id>/financeiro`)?

| Opção | O que muda |
|---|---|
| **(a) Ler do Connect (recomendada, se a API já tem o valor)** | A API de projetos passa a devolver a receita; o Financeiro compara e avisa a diferença |
| (b) Digitar no Financeiro | Campo "valor vendido" no cadastro do projeto (como já é com tipo, incentivo e prazo); o financeiro mantém dois números |
| (c) Fora do MVP | A receita do projeto é só a soma dos títulos a receber, sem comparação |

**Depois da resposta:** implementar a comparação e o aviso, marcar o critério e pedir à **Vivi** que valide a tela. É a Vivi que fecha o PF-65.

**O Bruno faz:** levar a pergunta junto com a 3.2 (item 6), porque a resposta do Connect decide entre (a) e (b).

---

## 5. Fora da sprint: decisões que ainda destravam o backlog

Não bloqueiam o que está na sprint, mas travam ou mudam as próximas tarefas.

| Tarefas | Decisão pendente | Quem |
|---|---|---|
| PF-66 a PF-68 (Notas e RPA) | **Q15** CPF e PIS/NIT do RPA: guardar cifrado ou a contabilidade coleta fora? **Q17** prazo de guarda de notas. **N3** teto do INSS, retenções e regime do PJ. **N2** captura automática de notas | DPO, contabilidade, Camila |
| PF-69 a PF-72 (Conferência bancária) | **Q44 (nova):** o layout real do extrato do Itaú, e se o extrato pode ser guardado (traz nome de quem recebeu o Pix). **N1** pagar pelo Itaú: API Pix em lote ou remessa | Vivi, DPO, pesquisa técnica |
| PF-73 a PF-76 (Relatórios) | **F3/D7** plano de contas e DRE. **Q39** gasto do projeto líquido ou bruto. **Q40** orçamento do Connect | Vivi, direção, João |

**Para a Vivi** (uma conversa curta, pode ser por mensagem):

- **Q44:** enviar **um extrato exportado do Itaú com os dados trocados por fictícios** (ou só a lista das colunas com uma linha de exemplo), nos formatos que ela usa (OFX e/ou CSV). Sem isso o leitor do CSV é uma estimativa. Nunca mandar extrato real pelo chat ou pelo repositório.
- **Q21, Q24, Q25, Q28, Q29, Q42**, as faixas de atraso e as demais da pauta, seção "Com a Vivi".

## 6. O que já foi decidido e só pede ciência

Decisões tomadas no trabalho, dentro do que o projeto permite, e registradas nos specs. Se o João discordar de alguma, é só dizer:

- **Incentivos em Relatórios:** a tela fica no menu Relatórios, abaixo de Relatório do projeto. Cada lançamento mostra a data na frente do nome e abre as pessoas a pagar, com chave Pix **mascarada**, nota e de onde veio (planilha ou Connect).
- **Dia útil e feriados:** data de pagamento em sábado, domingo ou feriado vai para o próximo dia útil, com aviso na prévia; feriados nacionais vêm da BrasilAPI e os locais se cadastram à mão ([ADR 0015](../architecture/adr/0015-feriados-por-cadastro-e-brasilapi.md)). Dúvidas na Q42.
- **Chave Pix do respondente:** só a máscara é guardada (provisório, Q22). A completa não é guardada, e a exceção está no [ADR 0004](../architecture/adr/0004-cpf-de-usuario-fora-do-financeiro.md).
- **Baixar planilha (incentivos):** é uma planilha **de controle**, com a chave mascarada. **Não serve para subir no banco.**
- **Enviar PDF de comprovantes (incentivos):** anexa o PDF ao lançamento, cifrado, e **não dá baixa em ninguém**. A baixa de cada pessoa continua no Contas a pagar. Provisório até a Q19.
- **Receita sem projeto (Q27):** nem toda receita é ligada a um projeto, então o projeto não é obrigatório no título a receber.
- **Campos obrigatórios:** a mensagem diz quais campos faltam, e o asterisco é vermelho.

## 7. Checklist do Bruno

**Antes da conversa**

- [ ] Mandar ao João esta página e a [pauta](pauta-para-o-joao.md) com um dia de antecedência.
- [ ] Marcar 40 minutos e pedir que o João tenha à mão o acesso ao Connect de produção.
- [ ] Levar o celular com o autenticador (A1 da pauta: teste do login Microsoft e verificação em duas etapas).

**Na conversa**, nesta ordem: 3.2 (Connect, o que mais destrava), 1 (PF-53, é rápida), 4 (Q43), 3.3 (D3 a D8) e A1 a A6 da pauta.

**Depois da conversa**

- [ ] Gravar a fala bruta em `docs/transcricoes/2026-11-DD-conversa-com-o-joao.md`.
- [ ] Passar as respostas para o spec dono e tirar a pergunta de [perguntas-abertas](perguntas-abertas.md).
- [ ] Pedir ao DPO a Q26, e à Vivi a Q44 e a lista da seção 5.
- [ ] Com a conta de serviço em mãos, colocar os dados em `backend/.env.connect` (nunca no chat) e rodar o teste só de leitura com o projeto piloto.
- [ ] **Jira:** mover e comentar nas tarefas só depois de você autorizar, tarefa por tarefa.
- [ ] **Merge na `main`:** só o João pede ou autoriza. Antes do push, rodar a simulação de CI em Linux e a auditoria de segredos (A3 da pauta).
