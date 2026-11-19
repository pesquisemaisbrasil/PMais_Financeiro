# Solicitações da equipe (versão de demonstração)

Contrato do canal em que a equipe do financeiro, testando a **versão de demonstração**, pede correções e melhorias ao desenvolvimento, e do acesso do desenvolvimento que lê esses pedidos. Pedido do Bruno em 16/11/2026. A decisão técnica (função do Netlify) está no [ADR 0019](../architecture/adr/0019-solicitacoes-da-demonstracao-no-netlify.md).

## Comportamento

- A tela de entrada da demonstração tem **dois acessos**, em abas:
  - **Financeiro**: o das meninas, com o e-mail e a senha fictícios já preenchidos (como antes);
  - **Desenvolvimento**: pede a **chave de acesso**. A chave é conferida pela função do Netlify; certa, a pessoa entra com a conta fictícia "Desenvolvimento" e o navegador guarda a chave.
- Não há login pelo **Google** nem pela **Microsoft** na demonstração. No sistema de verdade eles continuam ([acesso-e-auditoria](acesso-e-auditoria.md), Q10).
- Em todas as telas, o menu lateral tem **Enviar solicitação**, logo acima de **Conhecer o sistema**. O botão abre um modal com:
  - **Tipo** (obrigatório): **Correção de bug**, **Correção de regra** ou **Melhoria**;
  - **Descrição** (obrigatória): o que aconteceu, em qual tela e o que se esperava (até 4.000 caracteres);
  - **Imagem** (obrigatória): um print da tela, escolhido no computador ou **colado com Ctrl + V** (PNG, JPG, WEBP ou GIF, até 4 MB), com a prévia no modal.
  - **Enviar** guarda a solicitação com a tela de onde ela saiu, o nome de quem está logado e a hora, e mostra "Solicitação enviada. Obrigado!".
- No acesso **Desenvolvimento**, o menu tem **Solicitações**: a lista da mais nova para a mais antiga, com quantas há de cada tipo, a hora, o tipo, a descrição, a tela ("Financeiro - Contas a pagar"), quem enviou e o botão **Ver imagem**. **Atualizar** busca de novo; **Trocar chave** esquece a chave guardada.

## Regras

1. As solicitações são a **única coisa da demonstração que sai do navegador**: vão para a função do Netlify do próprio site (`/api/solicitacoes`), que guarda no **Netlify Blobs**. O resto da demonstração continua só no navegador de cada pessoa.
2. **Só dados de exemplo** no print e na descrição: a demonstração é de dados fictícios, e o que é enviado fica fora da empresa (Netlify). O modal lembra isso.
3. **Enviar é aberto** a quem abre a demonstração; **ler** a lista e as imagens pede a chave `SOLICITACOES_CHAVE`, configurada no Netlify e conferida pela função, sem dizer pelo tempo quantos caracteres bateram. A senha da conta "Desenvolvimento" não protege nada (o código roda no navegador): quem protege é a chave.
4. A imagem é aceita **pelos primeiros bytes** (PNG, JPG, WEBP ou GIF), não pelo nome nem pelo tipo informado; SVG e outros arquivos são recusados. A imagem volta com o tipo conferido e `nosniff`.
5. Para a caixa não crescer sem limite, a função guarda até **500** solicitações; passou disso, recusa com aviso.
6. Uma solicitação guardada **não é editada nem apagada pela tela**. Apagar é pelo painel do Netlify (Blobs, store `solicitacoes`), até a regra de guarda do DPO (Q50).

## Casos negados

| Situação | HTTP | `detail` exato |
|---|---|---|
| Enviar sem tipo, descrição ou imagem (a tela já confere antes) | 422 | Falta preencher: tipo, descrição, imagem. (só os que faltam) |
| Tipo que não é bug, regra nem melhoria | 422 | Falta preencher: tipo. |
| Descrição com mais de 4.000 caracteres | 422 | A descrição passa de 4.000 caracteres. Resuma um pouco. |
| Arquivo que não é PNG, JPG, WEBP nem GIF | 422 | A imagem precisa ser PNG, JPG, WEBP ou GIF. |
| Imagem com mais de 4 MB | 413 | A imagem passa de 4 MB. Recorte um pedaço menor da tela. |
| Caixa com 500 solicitações | 429 | A caixa de solicitações está cheia. Avise o desenvolvimento. |
| Ler a lista ou a imagem sem chave ou com a chave errada | 401 | Chave errada. |
| Ler sem `SOLICITACOES_CHAVE` configurada no Netlify | 503 | A chave do desenvolvimento ainda não foi configurada no Netlify. |
| Imagem que não existe | 404 | Imagem não encontrada. |

Na tela, antes de enviar: "Preencha os campos obrigatórios: Tipo, Descrição e Imagem." (só os que faltam), "Anexe uma imagem PNG, JPG, WEBP ou GIF (um print da tela)." e "A imagem passa de 4 MB. Recorte um pedaço menor da tela.".

## Critérios de aceite

- [ ] A tela de entrada da demonstração mostra as abas Financeiro e Desenvolvimento e não mostra Google nem Microsoft.
- [ ] No acesso Financeiro, Enviar solicitação sem nada preenchido pede Tipo, Descrição e Imagem; com os três, a solicitação é enviada e some do modal.
- [ ] Um print colado com Ctrl + V vira a imagem anexada, com a prévia.
- [ ] O acesso Financeiro não tem a tela Solicitações.
- [ ] Na aba Desenvolvimento, a chave errada mostra "Chave errada." e não entra; a certa entra e mostra Solicitações, com a solicitação enviada, a tela de onde veio, quem enviou e a imagem.
- [ ] A lista e as imagens não saem sem a chave, nem mesmo chamando o endereço direto.

## Onde está no código

- Regra: `frontend/netlify/solicitacoes.mjs` (com os testes em `solicitacoes.test.ts`); função: `frontend/netlify/functions/solicitacoes.mts`; publicação: `frontend/scripts/deploy-demo.mjs`.
- Tela: `frontend/src/components/FeedbackDialog.tsx` (modal), `frontend/src/app/(app)/solicitacoes/page.tsx` (lista), `frontend/src/app/login/page.tsx` (os dois acessos), `frontend/src/lib/feedback.ts`, `frontend/src/lib/api.ts` (`sendFeedback`, `listFeedback`, `getFeedbackImage`).
- Conta do desenvolvimento: `backend/scripts/seed_demonstracao.py` (`ensure_account`) e `backend/demo_runtime.py`.
- Teste local: `frontend/scripts/serve-demo.mjs` responde `/api/solicitacoes` com a mesma regra, em memória; E2E em `frontend/e2e-demo/demonstracao.spec.ts`.

## Ajustes

- 2026-11-16: primeira versão. O destino (função do Netlify com Netlify Blobs, e não o formulário do Netlify nem o Jira) e "só dados fictícios" foram escolhas do Bruno. Fica para depois: situação de cada pedido (em análise, resolvido), apagar pela tela e um nome por pessoa (hoje as meninas usam a mesma conta "Bruna Demonstração").
- 2026-11-19: no sistema de verdade, o canal é o **Abrir demanda**, que guarda no servidor e só o super admin lê ([demandas](demandas.md)). A demonstração continua com o Enviar solicitação daqui.
