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
| Sessões | `refresh_tokens` | Hash do token, família, validade, se veio do SSO | Manter a pessoa logada e derrubar sessão roubada | **30 dias depois de expirar ou ser revogada** |
| Último acesso | `users.lastSignedInAt` | Data | Mostrar na administração | Enquanto a conta existir |

## O que o login não guarda

- **CPF.** Nunca ([ADR 0004](../adr/0004-cpf-de-usuario-fora-do-financeiro.md)).
- **A senha, o e-mail digitado nas tentativas e o IP completo.**
- **O código TOTP e a chave do autenticador em claro.**
- **Dados da conta Google ou Microsoft** além do e-mail confirmado no momento do login. O identificador fixo do provedor (`sub`, ou `oid` e `tid`) entra com o PF-49, e este inventário será atualizado no mesmo PR.

## Hoje o banco só cresce

Nada apaga `login_events` nem `refresh_tokens`. A rotina de limpeza segue o prazo que o DPO decidir (Q26). Enquanto isso, o crescimento é pequeno (duas pessoas usando todo dia).
