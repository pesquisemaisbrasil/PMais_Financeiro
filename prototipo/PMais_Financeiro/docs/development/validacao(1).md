# Validação — P+ Financeiro, versão informativa

**Data:** 25/10/2026  
**Escopo:** somente leitura; acesso, MFA, administração e finanças adiados por instrução do usuário.

## Evidências executadas

| Verificação | Resultado |
|---|---|
| TypeScript (`pnpm check`) | Passou antes e após as correções. |
| Suíte inicial (`pnpm test`) | 44 testes passaram em 3 arquivos, sem escrita no banco. |
| Testes novos de CSP | 3 testes dirigidos passaram. |
| Build (`pnpm build`) | Cliente e servidor compilados, incluindo as correções finais. |
| `scripts/verify-delivery.sh` | Tipos, suíte inicial, build e conjunto do manifesto passaram. |
| `scripts/check-readonly-http.py` | Health, CSP, manifesto, status, 10 rotas protegidas, página 404 e logo estático passaram após as correções. |
| Health HTTP | 200 e `mode: read_only`. |
| Manifesto HTTP | 200 JSON com 7 rotas informativas, coerentes com o source. |
| Status HTTP | 200; banco `available` por SELECT 1; acesso e dados de negócio desabilitados, Connect não validado. |
| Login/admin/auditoria/pagamento/upload | 503 em rotas HTTP e procedures tRPC testadas, inclusive com cookie/contexto de fixture. |
| API inexistente | 404 JSON, sem fallback HTML. |
| Páginas informativas | Rotas de aplicação testadas serviram HTTP 200. |
| /404 e /404 com query | HTTP 404 real confirmado. |
| Logo no gateway | HTTP 200 image/png; bytes/hash idênticos ao original, sem reexibir a imagem. |
| Logo estático para execução local | HTTP 200 image/png, cópia exata do original. |
| Contraste corrigido | Texto/placeholder 5,68:1; badge âmbar 5,79:1; badge cyan 5,92:1, nas combinações medidas. |
| Semântica de interface | Rótulo visível de busca, grupo de filtros com aria-pressed, alvos corrigidos para 44 px e texto 404 em pt-BR inspecionados no source. |

A revisão independente ocorreu antes das correções. Seu resultado e a rechecagem dirigida posterior pelo agente principal estão em `revisao-independente.md`. Não foi repetida uma bateria completa de aceitação depois de cada ajuste.

## Conteúdo dos testes

Status sem segredos; flags que não habilitam acesso mesmo com chaves presentes; diferenciação de estado do banco; bloqueios HTTP e tRPC; contexto sem identidade por cookie; catálogo documental de sete módulos; CSP explícita e compatibilidade de embedding. Cinco testes herdados do starter verificam seus helpers em fixtures, não habilitam OAuth, LLM ou geração de imagem na aplicação.

Não houve INSERT/UPDATE/DELETE de negócio, cadastro de usuário financeiro, upload de documento, migration adicional, migração SGE4B ou operação bancária/Connect. A única consulta HTTP ao banco é SELECT 1.

## Avisos e limites

O build Vite avisa que `/api/platform/config.js` não é empacotado como módulo: o script é intencionalmente dinâmico e servido pelo Express. O build terminou com sucesso.

A CSP permite origens HTTPS e conteúdo inline para acomodar a aplicação/plataforma; não é a política estrita final de nonce/allowlist de uma futura área autenticada. Esta limitação é explícita e será revisada antes de dados reais.

Não houve browser click-through, bateria manual de teclado/leitor de tela nem inspeção visual em vários dispositivos. Foram inspecionados código responsivo, foco, rótulos, estados e as combinações de contraste apontadas; isso não certifica WCAG 2.2 AA nem compatibilidade visual integral.

Não foram testadas funcionalidades adiadas: login/MFA/sessões, papéis, auditoria append-only, persistência de domínio, Connect/Itaú, migração, backup/restauração ou prontidão operacional. Health/build/Preview não equivalem a um sistema financeiro pronto para produção. A entrega é uma **base informativa navegável**.
