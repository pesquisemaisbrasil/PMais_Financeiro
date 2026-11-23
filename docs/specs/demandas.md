# Demandas

Contrato do canal em que qualquer pessoa do Financeiro pede uma mudança no sistema e só o **super admin** lê. Pedido do Bruno em 19/11/2026 ("admin e usuários podem abrir demandas... um anexo vai ser obrigatório, e uma descrição também"). Os níveis de acesso estão em [acesso-e-auditoria](acesso-e-auditoria.md) e no [ADR 0023](../architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md). Na versão de demonstração continua o **Enviar solicitação** ([solicitacoes](solicitacoes.md)).

## Comportamento

- No menu lateral, logo abaixo de **Acessos**, todos têm **Abrir demanda**. O botão abre um modal com:
  - **Tipo** (obrigatório), numa lista: **Abrir nova demanda**, **Correção de bugs** ou **Correção de regra**;
  - **Descrição** (obrigatória): o que precisa mudar, em qual tela e o que se esperava (até 4.000 caracteres);
  - **Anexo** (obrigatório): um print da tela, escolhido no computador ou **colado com Ctrl + V**, ou um PDF (PNG, JPG, WEBP ou PDF, até 10 MB), com a prévia da imagem no modal.
  - **Enviar** guarda a demanda com a tela de onde ela saiu, quem estava logado e a hora, e mostra "Demanda enviada. Obrigado!".
- O super admin recebe um aviso no sino ("Nova demanda: Correção de bugs") e tem no menu a tela **Demandas**: a lista da mais nova para a mais antiga, com a hora, o tipo, a descrição, a tela ("Financeiro - Contas a pagar"), quem abriu e o botão **Baixar** do anexo. **Atualizar** busca de novo.
- Cada demanda tem a **Situação** (Aberta ou Concluída, com a data e quem concluiu) e o botão **Concluído**. Ele pede confirmação, marca a demanda como concluída e manda um aviso no sino de quem abriu: "Sua demanda foi concluída: Correção de bugs", com a data em que ela foi aberta e quem concluiu.
- Admin e usuário não veem a tela Demandas nem o menu dela.

## Regras

1. Abrir demanda vale para os três níveis. Ler a lista e baixar o anexo, só o super admin (`require_superadmin`).
2. O anexo é aceito **pelos primeiros bytes** (PNG, JPG, WEBP ou PDF), não pelo nome; o nome guardado leva a extensão do conteúdo conferido, sem pasta nem caractere de controle. Volta sempre como download, com `nosniff` e sem cache.
3. O anexo pode mostrar **dado real** da tela (nomes, valores, chaves Pix mascaradas). Por isso fica **cifrado no cofre** (`core/file_vault.py`, chave amarrada à demanda), como os anexos das contas, e só o super admin baixa.
4. Uma demanda não é editada nem apagada pela tela; só muda de Aberta para Concluída, uma vez, pelo super admin. O prazo de guarda fica com o DPO (Q56).
5. O aviso de concluída diz o tipo e quando a demanda foi aberta, **sem a descrição**: ela é texto livre e pode citar pessoas.
6. O super admin é provisório: existe até o fim do desenvolvimento (Bruno, 19/11/2026).

## Casos negados

| Situação | HTTP | `detail` exato |
|---|---|---|
| Enviar sem tipo, descrição ou anexo (a tela já confere antes) | 422 | Falta preencher: tipo, descrição, anexo. (só os que faltam) |
| Tipo fora da lista | 422 | Falta preencher: tipo. |
| Descrição com mais de 4.000 caracteres | 422 | A descrição passa de 4.000 caracteres. Resuma um pouco. |
| Arquivo que não é PNG, JPG, WEBP nem PDF | 422 | Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF. |
| Anexo com mais de 10 MB | 413 | O anexo passa de 10 MB. Envie um arquivo menor. |
| Ler a lista ou baixar o anexo sem ser super admin | 403 | Esta tela é só do super admin |
| Baixar o anexo de uma demanda que não existe | 404 | Demanda não encontrada |
| Concluir sem ser super admin | 403 | Esta tela é só do super admin |
| Concluir uma demanda já concluída | 409 | Esta demanda já foi concluída |
| Concluir uma demanda que não existe | 404 | Demanda não encontrada |
| Sem login | 401 | (padrão do login) |

Na tela, antes de enviar: "Preencha os campos obrigatórios: Tipo, Descrição e Anexo." (só os que faltam), "Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF." e "O anexo passa de 10 MB. Envie um arquivo menor.".

## Critérios de aceite

- [x] Admin e usuário abrem demanda pelo menu, com tipo, descrição e anexo obrigatórios; um print colado vira o anexo, com a prévia.
- [x] O super admin vê a demanda em Demandas, com a tela de onde veio e quem abriu, e baixa o anexo; recebe o aviso no sino.
- [x] Admin e usuário não veem a tela Demandas e recebem 403 chamando a API direto.
- [x] O anexo fica cifrado no cofre: o que está guardado não é o arquivo enviado.
- [x] O super admin clica em Concluído, confirma, e a demanda fica Concluída; quem abriu vê o aviso no sino.

## Onde está no código

- Backend: `backend/services/demands.py`, `backend/api/access.py` (`/demands`), `backend/models/demand.py`, migration `c4e8a2f6b913`; testes em `backend/tests/test_niveis_de_acesso.py`.
- Tela: `frontend/src/components/DemandDialog.tsx` (modal), `frontend/src/app/(app)/demandas/page.tsx` (lista), `frontend/src/components/Sidebar.tsx` (botão), `frontend/src/lib/access.ts`; E2E em `frontend/e2e/niveis-de-acesso.spec.ts`.

## Ajustes

- 2026-11-19: primeira versão. O anexo aceita imagem ou PDF até 10 MB (escolha do Bruno entre imagem só, imagem ou PDF e qualquer arquivo). Fica para depois: situação de cada demanda (em análise, feita) e responder pela tela.
- 2026-11-19 (**Concluído**, Bruno, com o print da tela Demandas: "precisa ter um botão para mim clicar em concluído e notificar o usuário na plataforma"): situação Aberta ou Concluída e o botão Concluído, que avisa quem abriu no sino. A coluna Tela passa a mostrar o nome das telas de primeiro nível do menu (Demandas, Acessos) em vez do endereço.
