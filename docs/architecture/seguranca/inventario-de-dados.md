# Inventário de dados do login

O que o Financeiro guarda para a pessoa entrar e manter a sessão. Os dados de Contas a pagar e dos cadastros estão na [tabela do README](README.md). Tratamento correspondente: [ROPA](lgpd/ropa.md). Prazos: **propostos**, a validar com o DPO ([Q26](../../planning/perguntas-abertas.md)).

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo proposto |
|---|---|---|---|---|
| Nome | `users.name` | Em claro | Mostrar quem está logado e quem fez cada ação | Enquanto a conta existir |
| E-mail | `users.email` | Em claro, em minúsculas | Identificar a conta e entrar | Enquanto a conta existir |
| Senha | `users.passwordHash` | Só o hash da senha | Primeiro fator do login por senha | Enquanto a conta existir |
| Papel e situação | `users.role`, `users.status` | Em claro | Dizer o que a pessoa pode fazer e barrar conta desativada | Enquanto a conta existir |
| Chave do autenticador (TOTP) | `users.totpSecretEncrypted` | Cifrada (AES-256-GCM), nunca em claro | Segundo fator | Enquanto o MFA estiver ativo |
| Controle do TOTP | `users.totpLastUsedStep`, `mfaFailedAttempts`, `mfaLockedUntil`, `mfaEnabledAt` | Números e datas | Impedir código repetido e adivinhação | Enquanto a conta existir |
| Códigos de recuperação | `mfa_recovery_codes.codeHash`, `usedAt` | Só o hash; o código aparece uma vez | Entrar se o autenticador for perdido | Até o uso, ou até o MFA ser refeito |
| Tentativas de login | `login_events` | HMAC do e-mail digitado (não o e-mail), IP **mascarado**, user-agent, motivo, data. Nunca a senha | Limitar tentativas e auditar acessos | **6 meses** (mínimo do Marco Civil, art. 15) |
| Identificador da pessoa no Google ou na Microsoft | `sso_identities.provider`, `subject` | Em claro (Google: `sub`; Microsoft: `tid:oid`). Não é e-mail nem documento | Achar a conta mesmo se o e-mail mudar ou for reaproveitado | Some junto com a conta |
| Sessões | `refresh_tokens` | Hash do token, família, validade, se veio do SSO | Manter a pessoa logada e derrubar sessão roubada | **30 dias depois de expirar ou ser revogada** |
| Último acesso | `users.lastSignedInAt` | Data | Mostrar na administração | Enquanto a conta existir |

## O que o login não guarda

- **CPF.** Nunca ([ADR 0004](../adr/0004-cpf-de-usuario-fora-do-financeiro.md)).
- **A senha, o e-mail digitado nas tentativas e o IP completo.**
- **O código TOTP e a chave do autenticador em claro.**
- **Dados da conta Google ou Microsoft** além do identificador fixo acima. O e-mail do provedor só é usado no momento do login e não é copiado.

## Hoje o banco só cresce

Hoje nada apaga `login_events` nem `refresh_tokens`. A rotina de limpeza **já existe e está desligada**: `backend/scripts/purge_login_data.py`, sobre `services/retention.py`. Sem prazo configurado ela não faz nada; com prazo, **só conta** o que apagaria, e apaga apenas com `--apply`. Tentativa de login passa do prazo contado da data em que aconteceu; sessão, da data em que **expirou** (sessão revogada só entra depois de expirar). Os prazos entram em `LOGIN_EVENTS_RETENTION_DAYS` e `REFRESH_TOKENS_RETENTION_DAYS` quando o DPO decidir (Q26). Enquanto isso, o crescimento é pequeno (duas pessoas usando todo dia).

## Comprovantes Pix (PF-56)

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| Nome do recebedor lido no comprovante | `payment_receipts.payeeNameEncrypted` | Cifrado (AES-256-GCM). Aparece na tela só quando a chave não casa com ninguém | Descobrir de quem é um Pix de chave desconhecida | A definir com o DPO (Q5, Q19) |
| Chave Pix do recebedor | `payment_receipts.payeeKeyHash`, `payeeKeyMasked` | Só o hash (HMAC) e a máscara (`mar***@exemplo.com`). A chave inteira nunca é gravada | Casar comprovante com a pessoa e mostrar sem expor | A definir com o DPO |
| Valor, data e ID da transação (`e2eId`) | `payment_receipts.amount`, `paidOn`, `e2eId` | Em claro | Conciliar a baixa e impedir pagar o mesmo Pix duas vezes | A definir com o DPO |
| Quem recebeu (id da pessoa no Connect) | `payment_receipts.connect_interviewer_id`, `connect_payable_items.connect_interviewer_id` | Número, sem nome | Ligar a baixa à pessoa sem copiar o cadastro dela | A definir com o DPO |

| Dia em que a pessoa foi paga no lançamento | `payable_items.paidOn`, `connect_interviewer_id` | Data e número, sem nome nem chave | Mostrar quem já foi paga em cada lançamento | A definir com o DPO |

**O que o comprovante não guarda:** o PDF (lido em memória e descartado), o CPF do recebedor, agência e conta, o bloco do pagador, o código de autenticação e o texto bruto. Nada disso vai para log.

## Cadastro de cliente e fornecedor (contas a pagar e a receber)

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| CNPJ do cliente ou fornecedor | `customers.document`, `suppliers.document` | Só os 14 dígitos, em claro. CPF nunca é guardado | Identificar a empresa e impedir cadastro repetido | Enquanto o cadastro existir |
| Contato (nome, telefone e e-mail) | `customers.contactName`, `phone`, `email` (e o mesmo em `suppliers`) | Em claro | Falar com a empresa sobre cobrança e pagamento | A definir com o DPO (Q5) |
| Ficha do cliente: IE (inscrição estadual), segundo e terceiro telefone, e-mail alternativo e observações | `customers.stateRegistration`, `phone2`, `phone3`, `emailAlt`, `notes` | Em claro. RG e CPF nunca: a IE e as observações que parecem CPF são recusadas | Falar com a empresa e emitir nota com a IE certa | A definir com o DPO (Q5) |
| Endereço do cliente (opcional): país, CEP, rua, número, complemento, bairro, cidade e UF | `customers.addressCountry`, `addressZip`, `addressStreet`, `addressNumber`, `addressComplement`, `addressDistrict`, `addressCity`, `addressState` | Em claro. De cliente pessoa física ou MEI é dado pessoal | Enviar cobrança e nota; saber onde a empresa fica | A definir com o DPO (Q5) |
| Quem recebeu e quanto (título a receber) | `receivables`, `receivable_payments` | Cliente por id, valores, datas e conta bancária; sem dado pessoal além do contato acima | Controlar o que a empresa tem a receber | A definir com o DPO (Q5) |

## Documentos anexados às contas a pagar, aos títulos a receber e aos clientes

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| O arquivo (nota, boleto, contrato, comprovante) | Bucket `financeiro-arquivos`, objeto `payable/{id}/{código}.bin` | **Cifrado** (AES-256-GCM, chave própria por arquivo, embrulhada pela `FILES_MASTER_KEY`). Nunca em claro, nunca no banco | Guardar o documento onde a equipe o procura | A definir com o DPO (Q5, F6). Hoje nada apaga |
| Nome, tipo, tamanho e SHA-256 do arquivo | `payable_attachments.name`, `contentType`, `size`, `fileSha256`, `fileKey` | Em claro. O nome do arquivo pode trazer nome de pessoa | Listar e conferir que ninguém mexeu no arquivo | Mesmo do arquivo |
| Quem anexou, quando; quem tirou, quando e por quê | `payable_attachments.uploaded_by_user_id`, `createdAt`, `deletedAt`, `deleted_by_user_id`, `deletedReason`; `payable_events` | Em claro | Auditoria: cada inclusão, download e remoção fica no histórico da conta | Mesmo do arquivo |
| Documento do cliente (contrato, ficha): o arquivo, o nome, o tipo e quem anexou, baixou, renomeou e tirou | Bucket `financeiro-arquivos`, objeto `customer/{id}/{código}.bin`; `customer_attachments`; trilha em `record_events` | Cifrado, como os das contas; remover é lógico (o arquivo fica no cofre) | Guardar o contrato e os papéis do cliente | A definir com o DPO (Q5) |

**O conteúdo do arquivo pode ter dado pessoal** (nota de pessoa física, RPA, contrato). O sistema **não lê** o arquivo: não extrai nem copia nada dele. O arquivo só sai pela API, com download auditado, sem URL pública. Se uma nota trouxer CPF, ele está dentro do arquivo cifrado; o banco continua sem campo de CPF. Tirar um documento da conta é lógico: o arquivo continua guardado.

## Planilha de incentivos e de folha de campo

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| Nome da pessoa e valor a pagar | `payable_items.name`, `amount` | Em claro | Saber quem recebe cada valor do lançamento | A definir com o DPO (Q5) |
| Data da pesquisa de cada respondente | `payable_items` | Em claro, ligada ao nome | Calcular a data de pagamento e devolver o cronograma ao projeto | A definir com o DPO (Q5) |
| Chave Pix **mascarada** | `payable_items.pix_masked` | 3 primeiros e 2 últimos caracteres, como o Connect mostra. **A chave completa nunca é guardada**, nem vai para a prévia ou para o log. **Numa chave que é CPF ficam 5 dos 11 dígitos (os 2 de controle entre eles)**: decisão provisória do Bruno (12/11/2026), a confirmar com o DPO (Q22) | Mostrar, na tela Incentivos, qual chave cada pessoa tem, sem expor a chave | A definir com o DPO (Q5 e Q22) |
| Número e data da NF, valor bruto do RPA (folha de campo) | `payable_items` | Em claro | Acompanhar o documento fiscal e o desconto de INSS | A definir com o DPO (Q5) |

O arquivo da planilha **não é guardado**: é lido na hora e descartado.

## Conferência bancária (PF-69 a PF-72)

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| Dados da conta bancária **da empresa**: banco, agência, número da conta, tipo, saldo inicial e a data dele | `bank_accounts` | Em claro. É dado da empresa, não de uma pessoa (no caso de empresário individual, pode identificar o titular) | Conferir o extrato e calcular o saldo do mês | Enquanto a conta existir |
| Linha do extrato: data, valor, ID da transação no banco | `bank_transactions.postedOn`, `amount`, `externalId` | Em claro. A linha é imutável (o banco de dados barra alterar e apagar) | Conferir o que o banco movimentou contra o que foi pago e recebido | A definir com o DPO (Q44) |
| Descrição da linha (o Pix traz o nome de quem pagou ou recebeu) | `bank_transactions.description_enc` | **Cifrada** (AES-256-GCM, amarrada à conta e à linha). Nunca vai para log, histórico ou evento | Achar a linha certa na conciliação | A definir com o DPO (Q44) |
| Chave de repetição da linha | `bank_transactions.dedupeKey` | **HMAC** com a chave permanente de hash da aplicação (`PIX_SECRET_KEY`), não SHA puro: sem o segredo, quem lê o banco não confirma "quem recebeu" calculando o hash de uma descrição conhecida | Reimportar o mesmo extrato sem duplicar linha | Junto com a linha |
| De cada importação: nome do arquivo, SHA-256, formato, período, quantas linhas entraram e quantas já estavam, quem importou e quando | `bank_statements` | Em claro. **O arquivo em si não é guardado** | Provar o que foi importado e avisar o mesmo arquivo de novo | A definir com o DPO (Q44) |
| Conciliação: a que lançamento (e pessoa) a linha foi ligada, a classificação, o número e a data de emissão da NF, o **motivo** da exceção (texto livre), quem conciliou e quando | `bank_reconciliations` | Em claro. O texto livre não deve trazer dado pessoal | Provar a origem de cada movimento e preparar a planilha da contabilidade | A definir com o DPO (Q44) |
| Histórico da conciliação (quem desfez, quando e por quê) | `bank_reconciliation_events` | Em claro. O texto da linha do extrato **nunca** entra aqui | Auditoria | Só recebe linhas novas; nada apaga hoje |
| Fechamento do mês: empresa, mês, quem fechou e quando; quem reabriu e o motivo; quem baixou a planilha da contabilidade | `period_closings`, `period_closing_events` | Em claro | Impedir mudança depois do fechamento e deixar rastro | A definir com o DPO (Q44) |

A **planilha da contabilidade** é montada na hora e **não é guardada**: traz a descrição do extrato (com nome de pessoa), a classificação, a NF e o lançamento. Cada download fica registrado no histórico do fechamento.

