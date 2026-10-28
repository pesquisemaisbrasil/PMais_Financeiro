# Revisão independente e correções — P+ Financeiro

**Data:** 25/10/2026  
**Escopo:** versão informativa, somente leitura. A revisão independente ocorreu antes das correções; as verificações dirigidas posteriores foram executadas pelo agente principal.

## Fronteira de segurança confirmada na revisão

A revisão somente leitura confirmou ausência de registro OAuth, contexto sempre sem identidade, recusas de auth/admin/finance mesmo com contexto de admin de teste, bloqueio de escrita e prefixos protegidos, MySQL somente SELECT 1, status sem DSN/credenciais/IP/nome/saldo, catálogo conceitual de sete módulos, ausência de login por storage/cookie e estados de loading/retry/offline. Os resultados já existentes de tipos, 44 testes e build foram reutilizados; não houve operação de banco ou browser na revisão.

## Achados e resultado das correções

| Achado inicial | Resultado posterior e evidência |
|---|---|
| Logo ausente no servidor local | O achado não considerava o gateway: `/manus-storage/` é resolvido pela plataforma antes do app, sem proxy próprio. GET no gateway retornou HTTP 200 image/png com hash idêntico ao original. Também foi incluída cópia exata em `client/public/brand/` como fallback para execução local; sua resposta HTTP foi validada, sem reexibir a imagem. |
| Alvos abaixo de 44 px | `.button-quiet`, links, `.clear-search` e `.catalog-tab` agora têm área mínima de 44 px; 404 utiliza a ação primária do produto. Correção inspecionada no source. |
| Busca sem rótulo persistente | Incluído label visível associado a `module-search`; placeholder deixa de ser o rótulo. Associação verificada no source. |
| Contraste de texto pequeno | Texto/placeholder `#666670` sobre branco: 5,68:1. Texto âmbar `#8a550c` sobre `#fff6e8`: 5,79:1. Texto cyan `#24667c` sobre `#eaf8fc`: 5,92:1. Razões calculadas pela fórmula WCAG; não equivalem a certificação de todas as combinações. |
| ARIA incompleta de abas | Filtros passaram a grupo comum de botões com `aria-pressed`, eliminando o padrão de abas incompleto; resultado anunciado em região de status. |
| 404 em inglês | Mensagem e ação traduzidas; layout sóbrio, noindex e sem animação decorativa. HTTP /404 e /404 com query foram validados com status 404. |
| CSP sem default-src | Política explícita para origem padrão, scripts, estilos, fontes, imagens e conexões. Testes específicos passaram; header HTTP confirmado. Não bloqueia o iframe do Preview. |

## Limites de endurecimento e validação

A CSP desta base permite scripts e conexões HTTPS e conteúdo inline necessário à aplicação/plataforma; não é uma política final estrita de nonce/allowlist para uma futura área autenticada. Essa etapa exigirá revisão própria antes de dados reais. Não se fixa um host CDN antigo porque scripts da plataforma podem mudar.

Não houve nova bateria completa de aceitação depois das correções: foram rechecados tipos, build, três testes de CSP, HTTP das rotas afetadas, disponibilidade do logo e combinações de contraste apontadas. Os testes anteriores de bloqueios continuam registrados em `validacao.md`.

Não foram executados browser click-through, leitor de tela ou testes visuais em múltiplos dispositivos. Acessibilidade global, responsividade integral e prontidão de produção não foram certificados. Nenhuma correção habilitou autenticação, MFA, registros financeiros, migração, Connect ou operação bancária.
