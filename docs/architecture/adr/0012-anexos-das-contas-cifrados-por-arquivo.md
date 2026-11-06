# ADR 0012: Anexos das contas, cifrados um a um no backend com chave-mestra própria

**Status:** Aceito, provisório (a escolha final do armazenamento é a Q18; o prazo de guarda, a Q5 e a F6)
**Data:** 06/11/2026

## Contexto

O Bruno pediu, em 06/11/2026, anexar documentos às contas a pagar "igual ao sistema antigo". A [spec de baixas, recorrência e anexos](../../specs/baixas-recorrencia-e-anexos.md) (regra 6) e o [handoff/04](../../handoff/04-banco-de-dados.md) pedem um cofre cifrado. O [ADR 0010](0010-minio-pelo-build-da-chainguard.md) manteve o MinIO e deixou o código falando S3 (`boto3`) para o primeiro upload. A Q18 (qual armazenamento) e a Q5 (por quanto tempo guardar) seguem com o João e o DPO.

## Decisão

- `boto3` fala com o bucket `financeiro-arquivos`. Qualquer armazenamento compatível com S3 serve: trocar de produto é trocar variáveis.
- **Cada arquivo é cifrado no backend**, antes de ir para o bucket: AES-256-GCM, com chave de dados e nonce próprios. A chave de dados vai embrulhada pela `FILES_MASTER_KEY` (32 bytes em base64) nos metadados do objeto. O bucket e o backup dele só têm bytes cifrados.
- O arquivo fica amarrado à conta (`payable:{id}`) e a chave de dados, ao nome do objeto: copiar o objeto para outra conta ou outro nome não abre.
- **Chave própria, e não a `ENCRYPTION_KEY`** que o handoff/04 citava: a chave do banco e a dos arquivos têm backup e dono diferentes, e trocar uma não derruba a outra.
- Na leitura, o SHA-256 é conferido e **a leitura falha fechada** se algo não bater (nunca se entrega arquivo mexido).
- **Sem URL pública nem pré-assinada.** O arquivo só sai pela API, que grava cada download no histórico da conta.
- **Remover é lógico:** a linha ganha `deletedAt`, quem tirou e o motivo, e o arquivo continua no bucket. O código nunca apaga objeto, e a role da app perde o `DELETE` da tabela (migration e passo do CI).
- Conferência do conteúdo antes de guardar: tipo pelos primeiros bytes (não pela extensão), XML pelo `defusedxml` (sem DTD nem entidades), arquivo do Office com a peça esperada e no máximo 100 MB depois de aberto, 20 MB por arquivo, 50 por conta e sem repetir o mesmo arquivo na conta.
- `FILES_MODE=memory` é um cofre de mentira só para os testes de tela; a API o recusa em produção.

## Consequências

- Sem `FILES_ENDPOINT_URL`, usuário, senha e `FILES_MASTER_KEY`, anexar responde 503 com uma mensagem simples, e o resto da conta funciona.
- **Perder a `FILES_MASTER_KEY` é perder todos os arquivos.** Ela precisa de backup à parte do banco. O campo `key-version` do objeto deixa a troca da chave por reembrulho (sem recifrar os arquivos); a rotina ainda não foi escrita.
- **Ficou de fora:**
  - antivírus (o gancho `scan()` existe e não recusa nada);
  - a camada 2 do handoff/04 (SSE no MinIO via KES);
  - o usuário do bucket restrito ao bucket, que o ADR 0010 prometia para o primeiro upload (o ambiente local usa o administrador do compose);
  - a separação por empresa que a spec pede (hoje um bucket só, com a chave `payable/{id}/...`);
  - o prazo de guarda e a rotina que apague o que venceu (hoje nada apaga);
  - anexos no Contas a receber.
- O sistema não lê o conteúdo do arquivo. Uma nota ou RPA que traga CPF o carrega dentro do arquivo cifrado; o campo de CPF continua inexistente no banco.
