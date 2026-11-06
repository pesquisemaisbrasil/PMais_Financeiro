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
| Quem recebeu e quanto (título a receber) | `receivables`, `receivable_payments` | Cliente por id, valores, datas e conta bancária; sem dado pessoal além do contato acima | Controlar o que a empresa tem a receber | A definir com o DPO (Q5) |

## Documentos anexados às contas a pagar

| Dado | Tabela e coluna | Como fica guardado | Por quê | Prazo |
|---|---|---|---|---|
| O arquivo (nota, boleto, contrato, comprovante) | Bucket `financeiro-arquivos`, objeto `payable/{id}/{código}.bin` | **Cifrado** (AES-256-GCM, chave própria por arquivo, embrulhada pela `FILES_MASTER_KEY`). Nunca em claro, nunca no banco | Guardar o documento onde a equipe o procura | A definir com o DPO (Q5, F6). Hoje nada apaga |
| Nome, tipo, tamanho e SHA-256 do arquivo | `payable_attachments.name`, `contentType`, `size`, `fileSha256`, `fileKey` | Em claro. O nome do arquivo pode trazer nome de pessoa | Listar e conferir que ninguém mexeu no arquivo | Mesmo do arquivo |
| Quem anexou, quando; quem tirou, quando e por quê | `payable_attachments.uploaded_by_user_id`, `createdAt`, `deletedAt`, `deleted_by_user_id`, `deletedReason`; `payable_events` | Em claro | Auditoria: cada inclusão, download e remoção fica no histórico da conta | Mesmo do arquivo |

**O conteúdo do arquivo pode ter dado pessoal** (nota de pessoa física, RPA, contrato). O sistema **não lê** o arquivo: não extrai nem copia nada dele. O arquivo só sai pela API, com download auditado, sem URL pública. Se uma nota trouxer CPF, ele está dentro do arquivo cifrado; o banco continua sem campo de CPF. Tirar um documento da conta é lógico: o arquivo continua guardado.
