# Evidência de auditoria — domínio Decisões, marca, assets e cobertura

**Projeto auditado:** `<raiz-do-repositorio>`
**Base informada:** `81bc243` (acesso compartilhado seguro ao mockup)
**Recorte:** auditoria de domínio e evidências; este arquivo **não é documentação final de operação** e não altera aplicação, schema, dependências, configuração ou Git.
**Idioma:** pt-BR.
**Restrições observadas:** não foram lidos `.env`/`.manus-logs`, não foram expostos segredos, valores de senha/hash, tokens, cookies ou DSNs, e o logo não foi aberto visualmente. A metadata da imagem foi obtida sem renderização.

## 1. Legenda de evidência

- **CONFIRMADO NO CÓDIGO:** fato verificável em fonte/configuração rastreada ou em metadata de arquivo.
- **A CONFIRMAR:** fato externo, licença, contrato, decisão de produto, política ou comportamento que o repositório não prova.
- **RECOMENDAÇÃO — não implementado atualmente:** proposta de reconstrução/Financeiro real; não deve ser tratada como feature existente.
- Textos em `docs/source/original/`, `docs/analysis/`, `docs/architecture/` e `docs/development/` são evidência documental, histórico, contrato-alvo ou relato de validação conforme o próprio texto. Não foram convertidos em implementação apenas por existirem.

## 2. Escopo e fonte da verdade

**CONFIRMADO NO CÓDIGO/documentação:** o material original declara que o P+ Financeiro é separado do P+ Connect, substitui o SGE4B e é organizado em sete módulos: pagamento de entrevistadores; cadastros e migração; contas a pagar/receber; projetos/orçamento/provisionamento; folha/lotes; conciliação bancária; relatórios/fluxo de caixa (`docs/source/README-original.md:1-13`; `docs/source/original/specs/README.md:7-28`). O índice dos specs informa que o contrato tem comportamento, regras, casos negados, critérios de aceite e destino de código (`docs/source/original/specs/README.md:30-51`).

**CONFIRMADO NO CÓDIGO/documentação:** a visão de domínio fixa que Connect é dono de pessoas, CPF/hash, chave Pix, modelo fiscal, projetos, orçamento, entrevistas e status de pago; o Financeiro deve receber apenas o mínimo necessário e pedir baixa ao Connect (`docs/source/original/specs/visao-geral.md:34-45`). As regras transversais incluem valor exato do Pix, confirmação humana, CPF nunca exposto, chave Pix mascarada, dinheiro decimal como string e datas no fuso de São Paulo (`docs/source/original/specs/visao-geral.md:47-63`).

**CONFIRMADO NO CÓDIGO/documentação:** o handoff descreve uma arquitetura-alvo Next.js → FastAPI → PostgreSQL/MinIO, com camadas de API, serviços, modelos/schemas e core (`docs/source/original/handoff/02-arquitetura-e-stack.md:5-20`), e lista versões/pastas alvo (`:22-102`). O próprio diagnóstico posterior registra que esse era material documental sem código financeiro executável (`docs/analysis/diagnostico-tecnico.md:6-25`).

**CONFIRMADO NO CÓDIGO atual:** a aplicação efetivamente rastreada é React/TypeScript/Vite com Express/tRPC, Drizzle e MySQL; o README chama essa combinação de adaptação e mantém a arquitetura Next/FastAPI/PostgreSQL/MinIO apenas documentada (`README.md:66-77`; `package.json:1-16,18-108`; `drizzle.config.ts:8-15`). A adaptação é técnica, não autorização para mudar regras de produto (`docs/analysis/fundacao.md:5-10`).

**CONFIRMADO NO CÓDIGO atual:** o estado exposto é explicitamente `MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL`; não há banco financeiro, pagamento, Pix, PDF/extrato real, Connect/Itaú, identidade individual do Financeiro, MFA ou auditoria financeira (`README.md:5-12`).

**A CONFIRMAR:** aprovação formal da arquitetura adaptada para um Financeiro real, equivalentes MySQL para privilégios mínimos/append-only, migrations, backup/restauração, segregação e política operacional. O handoff descreve controles PostgreSQL que não podem ser presumidos equivalentes em MySQL (`docs/source/original/handoff/04-banco-de-dados.md:5-16,44-57`; `docs/analysis/fundacao.md:55-74`).

## 3. Inventário e cobertura do repositório

### 3.1 Lista versionada e tipos

**CONFIRMADO NO CÓDIGO/artefato de auditoria:** `arquivos-versionados.txt` contém 243 entradas (`arquivos-versionados.txt:1-244`). Ele cobre fonte de cliente (`client/src`), servidor (`server`), compartilhados (`shared`), schema/migrations Drizzle, scripts, testes, configurações, `README.md`, `TODO.md`, `plan.md`, documentação de análise/arquitetura/desenvolvimento e toda a documentação original em `docs/source/original/` (`arquivos-versionados.txt:15-119,121-185,186-243`). Portanto a cobertura solicitada contempla tanto o boilerplate quanto as fontes específicas do domínio; a lista é a referência de cobertura, não uma afirmação de prontidão.

**CONFIRMADO NO CÓDIGO:** no inventário não há `frontend/` Next, `backend/` FastAPI, `requirements.txt`, Alembic, Docker Compose financeiro, contrato Connect ou fixtures PDF/OFX reais. Há, no entanto, Dockerfile, lockfile, configs Vite/TypeScript/Vitest, código React/Express/tRPC, schema e migration iniciais (`arquivos-versionados.txt:1-15,186-243`).

**CONFIRMADO NO CÓDIGO:** tipos restantes no projeto, fora `.git`, `node_modules` e `.manus-logs`, foram contabilizados assim: 91 `.tsx`, 55 `.ts`, 18 `.js`, 12 `.json`, 66 `.md`, 5 `.css`, 2 `.py`, 2 `.yaml`, 1 `.sql`, 5 `.txt`, além de configurações sem extensão/extensões auxiliares (`.bak`, `.patch`, `.gitkeep`, `.gitignore`, `.dockerignore`, `.prettierignore`, `.prettierrc`). Os papéis são: interface e componentes; serviços/guards/testes; tipos/fixtures; documentação e decisões; scripts de verificação; migration/schema; configuração de build/execução.

**CONFIRMADO NO CÓDIGO:** o boilerplate inclui vários componentes em `client/src/components/ui/`, helpers de plataforma em `server/_core/`, OAuth/LLM/storage/map/notification do starter e componentes não usados diretamente pelo domínio demo (`arquivos-versionados.txt:29-81,201-220`). Não se conclui que cada helper esteja integrado ao Financeiro; a implementação efetiva do domínio passa pelas rotas `App.tsx`, `DemoStore`, páginas `client/src/pages/demo` e guards do servidor.

### 3.2 Ambiente e persistência

**CONFIRMADO NO CÓDIGO:** não foi encontrado `.env.example` nos nomes/árvores consultados nem na lista versionada; nenhum arquivo de ambiente foi aberto. Recomenda-se criar posteriormente um exemplo sem valores protegidos, mas isso é **RECOMENDAÇÃO — não implementado atualmente**. A ausência de `.env.example` não autoriza concluir que não existam variáveis protegidas fora do Git.

**CONFIRMADO NO CÓDIGO:** `drizzle/schema.ts` declara somente `users` em MySQL, com `openId`, nome, e-mail, método de login, papel genérico `user/admin` e timestamps; termina com TODO para novas tabelas (`drizzle/schema.ts:1-27`). A migration inicial cria somente `users` e seu índice único de `openId` (`drizzle/0000_initial_users.sql:1-14`). `relations.ts` não declara relações (`drizzle/relations.ts:1-2`). Não há tabelas financeiras, auditoria, Connect, folha, títulos, extrato ou arquivos.

**CONFIRMADO NO CÓDIGO:** o status de implantação consulta, no máximo, `SELECT 1`, com timeout/cache, sem schema reads, writes, migrations ou dados pessoais (`server/services/deployment.ts:18-43`). O status retorna `mode: read_only`, `accessEnabled: false`, `connect.validated: false` e `businessDataEnabled: false` (`server/services/deployment.ts:3-12,45-68`). Isso é verificação de infraestrutura, não persistência do domínio.

## 4. Decisões rastreáveis

### D1 — Produto real versus mockup demonstrativo

- **Problema:** o briefing original exige software empresarial operacional, persistência e fluxos completos (`docs/source/briefing-usuario.txt:8-12,311-325`), enquanto o prompt histórico define protótipo 100% navegador, mockado, sem backend/banco/login real (`docs/source/PROMPT-PROTOTIPO-MANUS.txt:13-23`).
- **Decisão confirmada:** a entrega atual é mockup local interativo, sem operação real; o ADR 002 delimita sete módulos, estado compartilhado no browser, reset/validação e APIs financeiras bloqueadas (`docs/architecture/ADR-002-mockup-interativo.md:1-18`).
- **Motivo:** pedido posterior de funcionamento demonstrativo, mantendo adiadas as áreas que precisam de chaves (`plan.md:21-35`).
- **Consequências confirmadas:** telas e mutações locais servem para validar sequência/interdependência; não provam contabilidade, LGPD, segurança de produção, integração, reconciliação bancária ou persistência corporativa (`docs/development/validacao-mockup.md:26-30`).
- **Alternativa rejeitada/pendente:** declarar o mockup como Financeiro operacional. Isso é proibido pelo README e pelo ADR; somente seria possível após gates reais.

### D2 — Estado local versus banco financeiro

- **Problema:** o Financeiro real precisa de Postgres/MinIO separados e persistência/auditoria; o mockup precisa ser reconstruível sem chaves.
- **Decisão confirmada:** estado de demonstração versionado em `localStorage` com chave interna do demo, validação ao carregar, fixtures DEMO e restauração confirmada; entidades demo não chegam à API/DB (`client/src/contexts/DemoStore.tsx:10,26-36,408-432`; `README.md:35-39`; `ADR-002:10-14`).
- **Motivo:** interatividade offline/local sem armazenar dados pessoais ou financeiros reais.
- **Consequências confirmadas:** dados não são compartilhados entre computadores, podem desaparecer se storage falhar e não formam base corporativa (`README.md:35-39`; `docs/development/guia-mockup.md:5-7,19-27`).
- **Alternativa futura:** persistência MySQL/Drizzle para contas de acesso e, depois, domínio financeiro real; **RECOMENDAÇÃO — não implementado atualmente**, com migrations aditivas e controles de não destruição (`TODO.md:56-64`).

### D3 — Gate de acesso demo versus login do Financeiro

- **Problema:** havia necessidade de acesso compartilhado ao Preview, mas autenticação real exige e-mail/senha, MFA TOTP, sessões, RBAC e auditoria.
- **Decisão confirmada:** a porta atual é exclusiva do mockup, valida segredo apenas no servidor, cria sessão opaca transitória em memória e declara escopo `demo_only`; não cria usuário `admin/financeiro`, não cria MFA e não libera operações (`server/security/demoAccess.ts:19-35,68-85,99-132`; `client/src/contexts/DemoAccess.tsx:14-20,22-44,79-100`; `README.md:13-19`).
- **Motivo:** compartilhar o demo sem transformar credencial de demonstração em identidade financeira.
- **Consequências confirmadas:** sessão expira/reinicia, pode depender de cookies do Preview e não é distribuída entre instâncias; APIs protegidas seguem indisponíveis (`docs/development/validacao-acesso-demo.md:19-24`; `server/security/readOnlyGuard.ts:3-21`; `server/routers.ts:6-32`; `server/_core/context.ts:10-13`).
- **Alternativa futura:** login próprio por e-mail/senha, MFA TOTP obrigatório, access em memória, refresh protegido/rotativo, RBAC server-side e auditoria; **RECOMENDAÇÃO — não implementado atualmente** (`docs/source/original/specs/acesso-e-auditoria.md:5-27,69-85`; `TODO.md:44-64`).

### D4 — Stack adaptada

- **Problema:** o handoff prescreve Next/FastAPI/PostgreSQL/MinIO, mas o projeto efetivo usa starter WebDev com React/Vite/Express/tRPC/Drizzle/MySQL.
- **Decisão confirmada:** aceitar a adaptação técnica sem alterar as regras de domínio (`docs/analysis/fundacao.md:5-10`; `README.md:66-77`).
- **Motivo:** entregar a camada demo no runtime existente e sem inventar equivalências de segurança.
- **Consequências:** os exemplos de FastAPI/Pydantic/Alembic/Postgres/MinIO são alvo documental; precisam ser redesenhados/testados antes do Financeiro real. Não há backend Python nem Postgres no repositório atual.
- **Alternativa:** preservar literalmente a stack do handoff, condicionada ao repositório/infra ausentes e contrato Connect validado (`docs/analysis/diagnostico-tecnico.md:64-75`); **A CONFIRMAR** pelo PO/arquitetura.

### D5 — Fronteira e fonte da verdade Connect

- **Problema:** pagamentos, entrevistas, projetos, orçamento, pessoas e chaves são originados/atualizados no Connect, mas o Financeiro precisa conciliar e gerar relatórios.
- **Decisão confirmada:** nenhum acesso direto ao banco/MinIO do Connect; integração exclusivamente por API, com dados mínimos, chave completa sob demanda e baixa idempotente no Connect (`docs/source/original/specs/visao-geral.md:34-45`; `docs/source/original/handoff/01-visao-escopo-e-decisoes.md:29-41`; `docs/source/original/specs/integracao-com-o-connect.md:12-29,56-67`).
- **Motivo:** minimização de dados, separação de sistemas e preservação do dono do dado.
- **Consequências:** o M1 real depende de contrato/escopos, eventos assinados, idempotência, sandbox e testes bilaterais; a documentação não é evidência de API pronta (`docs/source/original/specs/integracao-com-o-connect.md:79-93`; `docs/analysis/mapa-modulos-e-fases.md:277-286`).
- **Alternativa atual segura:** bloquear Connect real e usar somente entidades DEMO locais. É o comportamento efetivo (`README.md:9-12`; `server/services/deployment.ts:9-12`).

### D6 — Precisão e semântica financeira

- **Problema:** exemplos históricos e requisitos reais precisam de precisão monetária, datas e derivação coerente.
- **Decisão confirmada no demo:** inteiros em centavos, datas em `America/Sao_Paulo`, validação de datas/estado, liquidação parcial sem exceder saldo, lotes/folhas com soma exata e fechamento local de período (`client/src/lib/demoModel.ts:62-126`; `client/src/lib/demoValidation.ts:4-35`; `client/src/contexts/DemoStore.tsx:46-69,277-402`; `README.md:37-39`).
- **Regra-alvo documentada:** Financeiro real usará `Decimal`/strings decimais, valor exato por Pix, data de baixa para realizado e vencimento para previsto (`docs/source/original/specs/visao-geral.md:51-63`; `docs/source/original/specs/relatorios-e-analises.md:27-35`).
- **Consequência:** a coerência local do mockup não certifica cálculo contábil/fiscal ou integração bancária.
- **Alternativa não autorizada:** usar floats, inferir regras de juros/feriados/retenções ou considerar fixtures como saldo oficial. **RECOMENDAÇÃO — não implementado atualmente:** decidir com contabilidade antes do domínio real.

### D7 — Marca e asset oficial

- **Problema:** aplicar identidade Pesquise+ sem recriar, recolorir ou distorcer o logo.
- **Decisão confirmada:** reutilizar o asset oficial intacto; tagline `predict the future` em minúsculas; Open Sans e paleta institucional; logo branco em superfície escura (`docs/source/guia-de-marca.md:25-30,50-61,108-142`; `docs/source/briefing-usuario.txt:140-169`).
- **Consequências:** asset raster não deve ser AI-gerado, recolorido ou separado; versão clara colorida deve ser obtida/confirmada separadamente.
- **Alternativas:** não gerar/recolorir; se a versão clara oficial não estiver disponível, manter superfície escura ou solicitar asset oficial (`docs/source/guia-de-marca.md:132-142`; `docs/source/briefing-usuario.txt:51-57`).

## 5. Navegação e funções efetivamente presentes

### 5.1 Rotas e shell

**CONFIRMADO NO CÓDIGO:** `client/src/App.tsx:35-53` registra `/login`, dashboard `/`, sete rotas demo (`/demo/pagamentos`, `/demo/cadastros`, `/demo/contas`, `/demo/orcamento`, `/demo/folha`, `/demo/conciliacao`, `/demo/relatorios`) e rotas informativas `/fundacao`, `/modulos`, `/modulos/:id`, `/implantacao`, `/seguranca`, `/acesso`, `/documentacao`. Todas as áreas, exceto login/404, passam pelo `ShellRoute`, que consulta o gate demo (`App.tsx:26-31`).

**CONFIRMADO NO CÓDIGO:** a navegação lateral chama os sete módulos e também catálogo, implantação, segurança, acesso e documentação (`client/src/components/AppShell.tsx:33-77`). O shell exibe “Modo implantação / Mockup local · Nenhuma operação real” (`AppShell.tsx:139-153`) e chip “MOCKUP • Dados sintéticos · Sem operação real” (`AppShell.tsx:210-219`).

### 5.2 Matriz de módulos: presente versus contrato-alvo

| Domínio | CONFIRMADO NO CÓDIGO atual | Planejado nos specs/handoff, mas não implementado como Financeiro real |
|---|---|---|
| **M0 acesso, identidade e auditoria** | Gate compartilhado de demo; login técnico restrito ao mockup; status `read_only`; APIs auth/admin/finance recusadas. `server/security/readOnlyGuard.ts:9-21`; `server/routers.ts:12-32`; `server/services/deployment.ts:3-12`. | E-mail/senha, MFA TOTP, refresh rotativo, `financeiro/admin`, permissões, último admin e auditoria append-only. `docs/source/original/specs/acesso-e-auditoria.md:5-27,69-85`. |
| **M1 pagamento de entrevistadores** | Seleção de itens DEMO do mesmo projeto, formação de lote, conferência de soma em centavos, confirmação de pagamento local e geração de movimento local; aviso explícito de que nenhum Pix/Connect é acionado (`client/src/pages/demo/DemoPaymentsPage.tsx:17,56-135,176-285,351-379`). | Espelho vindo do Connect, planilha auditada com chave sob demanda, PDF Itaú/Sispag, parser, matching, FIFO/valor exato, divergências e baixa idempotente. `docs/source/original/specs/pagamentos-a-pagar.md:5-44`; `comprovantes-e-baixa.md:5-74`; `integracao-com-o-connect.md:12-39`. |
| **M2 cadastros/dimensões** | Criar/editar/inativar fornecedor/cliente DEMO, criar categoria, centro e projeto sintético, busca e preservação de vínculos; nomes/códigos são rotulados DEMO (`client/src/pages/demo/DemoRegistryPage.tsx:32-163,191-365,369-535`; `DemoStore.tsx:225-270`). | Empresa/unidade/plano de contas/DRE/contratos, validações CPF/CNPJ/E.164, importação com erros por linha e migração das 11 bases SGE4B. `docs/source/original/specs/cadastros-e-dimensoes.md:7-26,38-57`. |
| **M3 contas a pagar/receber** | O modelo local tem títulos pagar/receber, datas, contraparte, categoria/projeto, status derivado, baixa parcial/total, histórico e vínculo com movimento; ações estão declaradas no store (`client/src/lib/demoModel.ts:19-28,121-133`; `client/src/contexts/DemoStore.tsx:181-210,259-284`). O roteiro descreve filtro, liquidação local e pendência documental fictícia (`docs/development/guia-mockup.md:11-17`). | Rateios, parcelas/recorrência reais, estorno imutável, anexos/cofre, fiscal NF/RPA, autorização acima do orçamento e regras contábeis. `docs/source/original/specs/contas-a-pagar.md`; `baixas-recorrencia-e-anexos.md:7-56`; `documentos-fiscais.md:7-59`. |
| **M4 projetos/orçamento/provisões** | Baseline sintética, provisões previstas, conversão para título M3, cancelamento com motivo, métricas previsto/comprometido/realizado/saldo/consumo e alertas locais (`client/src/pages/demo/DemoBudgetPage.tsx:90-205,214-289,292-326,352-479`; `DemoStore.tsx:286-309`). | Orçamento por categoria originado no Connect, teto por categoria, autorização auditada, consumo devolvido ao Connect, lifecycle/checklists e fechamento real. `docs/source/original/specs/orcamento-e-saude-financeira.md:7-56`; `projetos-financeiros.md:7-32`. |
| **M5 folha/lotes** | Estado comum possui itens de campo, folhas abertas/aprovadas/pagas, cálculo inteiro quantidade × unitário, aprovação, cancelamento e liquidação local; ações no store (`client/src/lib/demoModel.ts:33-46`; `client/src/contexts/DemoStore.tsx:334-377`). | Regras versionadas/vigência/precedência, origem Connect, exceções de produção, NF/RPA, aprovação por papel/segregação, lote bancário e etapa Itaú. `docs/source/original/specs/regras-de-pagamento-de-campo.md:7-38`; `folha-de-campo.md:11-55`; `lotes-de-pagamento-de-campo.md:9-39`. |
| **M6 conciliação bancária** | Extrato é criado somente por liquidações simuladas; classificar, registrar exceção, impedir dupla conciliação, fechar/reabrir mês localmente com motivo (`DemoStore.tsx:46-68,379-402`; `README.md:30-31`). | Importar OFX/CSV, conta bancária, idempotência, correspondência por item, devolução, classificação fiscal, fechamento contábil e auditoria. `docs/source/original/specs/bancos-e-conciliacao.md:7-33,45-61`. |
| **M7 relatórios/fluxo de caixa** | Seis visões: pagar/receber, realizado, previsto, resultado por projeto, aging e conciliação; filtros de período/projeto/categoria, totais derivados do estado, CSV demo protegido contra fórmula e impressão (`client/src/pages/demo/DemoReportsPage.tsx:35-58,186-344,377-425,430-493,521-662`). | DRE, fluxo de caixa operacional, exportações XLSX/PDF, escopo por papel, assíncrono >50 mil linhas e fontes reconciliadas. `docs/source/original/specs/relatorios-e-analises.md:7-35,45-65`. |

**CONFIRMADO NO CÓDIGO:** o modelo seed usa somente rótulos DEMO para parties, categorias, projetos, títulos, provisões, entrevistadores, itens de folha e transações (`client/src/lib/demoModel.ts:143-195`). A validação Zod restringe IDs/rótulos demonstrativos, centavos positivos, datas e relações (`client/src/lib/demoValidation.ts:10-35,37-78`).

## 6. Offline, mock e login: limites operacionais

**CONFIRMADO NO CÓDIGO:** as entidades de negócio demo não usam tRPC/Express; `DemoProvider` carrega fixtures do browser, grava somente estado demo no storage local e sincroniza outra aba pela chave local (`client/src/contexts/DemoStore.tsx:26-36,408-430`). A falha de storage deixa a sessão demo de negócio temporária em memória e avisa o usuário (`DemoStore.tsx:410-417`).

**CONFIRMADO NO CÓDIGO:** o servidor não atribui identidade ao contexto tRPC (`server/_core/context.ts:4-13`) e o `readOnlyGuard` bloqueia prefixos financeiros/administrativos, integrações e qualquer escrita de API com 503 (`server/security/readOnlyGuard.ts:3-21`). Procedures `finance`, `admin` e `auth` também retornam indisponibilidade (`server/routers.ts:6-32`).

**CONFIRMADO NO CÓDIGO:** o login demo é um gate de navegação, não login de domínio. A sessão retornada declara escopo demo-only (`server/security/demoAccess.ts:68-80`); o cliente mantém CSRF apenas em referência transitória e senha apenas no estado do formulário (`client/src/contexts/DemoAccess.tsx:14-20,54-64,79-100`). Nenhum token/credencial de autenticação deve ser interpretado como registro financeiro.

**RECOMENDAÇÃO — não implementado atualmente:** para um MVP demonstrativo reconstruível, manter o offline local, reset determinístico, rótulo DEMO em cada entidade/exportação, API financeira fechada e separar visualmente status de infraestrutura do estado demo. Para o Financeiro real, remover mutações de negócio locais e só habilitar após persistência durável, autorização server-side, contrato Connect, auditoria e políticas aprovadas.

## 7. Marca, identidade, assets e licenças

### 7.1 Marca e tokens

**CONFIRMADO NO CÓDIGO/documentação:** o guia define a tagline oficial `predict the future`, sempre minúscula, sem tradução/pontuação (`docs/source/guia-de-marca.md:25-30`). Define propósito, missão e percepção moderna, estratégica, visionária, confiável e orientada a decisões (`:11-23`).

**CONFIRMADO NO CÓDIGO/documentação:** paleta oficial: Azul Claro `#009CEF`; Roxo `#6B36F7`; Verde `#00C977`; Azul Deep `#4063EE`; Azul Neutro `#6EC3E4`; Cinza Escuro `#3C3C3C`; Cinza Claro `#E8E8E8`; Branco `#FFFFFF` (`docs/source/guia-de-marca.md:50-61`). A proporção orientativa é 60–70% neutros, 20–30% azuis/cinza escuro e 5–10% acentos (`:63-69`).

**CONFIRMADO NO CÓDIGO/documentação:** Open Sans é a família oficial, com Regular para corpo, SemiBold para rótulos/navegação e Bold para títulos/métricas (`docs/source/guia-de-marca.md:108-130`). O CSS efetivo usa `font-family: "Open Sans", Arial, sans-serif` (`client/src/index.css:40-50`); não há fonte Open Sans versionada no inventário. **A CONFIRMAR:** origem/carregamento efetivo da fonte no ambiente publicado e licença/redistribuição do arquivo de fonte, se for incorporado.

**CONFIRMADO NO CÓDIGO:** tokens efetivos adaptados estão em `client/src/index.css:4-29`: `--primary #4063ee`, `--focus #009cef`, `--green #00c977`, `--purple #6b36f7`, `--cyan #6ec3e4`, `--ink #3c3c3c`, além de neutros funcionais e estados âmbar. O guia recomenda foco visível, contraste AA e estado não comunicado somente por cor (`docs/source/guia-de-marca.md:71-76,185-197`). Os relatos históricos registram que contraste selecionado, rótulo de busca e alvos mínimos foram inspecionados, mas não houve bateria real de browser/leitor de tela/WCAG completa (`docs/development/revisao-independente.md:15-28`; `validacao-mockup.md:18,26-30`).

### 7.2 Logo e assets

**CONFIRMADO NO CÓDIGO/metadata:** existe um único asset de logo rastreado: `client/public/brand/Logo2025_branco.png` (`arquivos-versionados.txt:11-14`). Metadata sem abrir/renderizar: PNG RGBA 8-bit, 356 × 129 px, não interlaced. O ativo mantém proporção aproximada 2,76:1; não foi feito recolor, edição ou geração AI.

**CONFIRMADO NO CÓDIGO:** `AppShell` tenta primeiro o asset gerenciado `/manus-storage/Logo2025_branco_2abedc7a.png` e usa fallback local `/brand/Logo2025_branco.png`; alt é `Pesquise+` e a tagline adicional é `predict the future` (`client/src/components/AppShell.tsx:119-135`). `Login` usa a cópia local em superfície escura (`client/src/pages/Login.tsx` conforme referências de marca encontradas; o caminho rastreado é `client/public/brand/Logo2025_branco.png`).

**CONFIRMADO NO CÓDIGO/documentação:** as regras de marca exigem usar arquivo oficial em fundo escuro, preservar proporção/área livre, largura mínima de 100 px e não distorcer, separar, recolorir, adicionar efeitos ou aplicar sobre fundo de baixo contraste (`docs/source/guia-de-marca.md:132-142`; `docs/source/briefing-usuario.txt:51-57`).

**A CONFIRMAR:** licença específica do logo, brandbook e eventual asset colorido `Logo2025.png`; a licença MIT em `package.json:1-6` cobre o pacote de software, mas não prova autorização de uso/redistribuição da marca. Também deve ser confirmada a origem/autorização do caminho gerenciado `/manus-storage/...` para publicação externa.

### 7.3 Assets ausentes e não inventados

**CONFIRMADO NO CÓDIGO:** não há SVG/JPG/WebP/font assets rastreados; não há logo colorido rastreado na lista. Nenhum asset novo foi gerado e a orientação vigente é não gerar/recolorir o logo. **RECOMENDAÇÃO — não implementado atualmente:** solicitar/registrar o asset colorido oficial e sua licença antes de uma versão em fundo claro, sem reconstrução por IA.

## 8. Documentação histórica, inconsistências e publicação

**CONFIRMADO NO CÓDIGO/documentação:** o README original dizia “documentação e especificação; o código começa na fase 0” (`docs/source/README-original.md:1-20`). Isso é histórico do pacote original; não contradiz o fato de existir hoje código demo, mas impede tratá-lo como código legado financeiro preservado.

**CONFIRMADO NO CÓDIGO/documentação:** `ADR-001` registra a base informativa read-only, APIs financeiras/admin/auth recusadas e somente `SELECT 1` (`docs/architecture/ADR-001-modo-informativo.md:1-25`). `ADR-002` posterior aprova o mockup local dos sete módulos, sem API/DB de negócio, Connect/Itaú, Pix, MFA, usuário ou auditoria (`docs/architecture/ADR-002-mockup-interativo.md:1-18`). A evolução deve ler ADR-002 como decisão posterior e delimitadora do demo.

**CONFIRMADO NO CÓDIGO/documentação:** relatórios de desenvolvimento são evidências históricas de testes, não aceite de produção. A validação do mockup registra TypeScript/build e testes dirigidos sem browser, banco, upload ou Connect, e explicita que login/MFA, papéis, auditoria, regras fiscais, documentos, Pix, Connect/Itaú, migração e produção continuam bloqueados (`docs/development/validacao-mockup.md:6-12,20-30`). A validação do acesso confirma nove testes de servidor e checagem HTTP, mas ressalva sessão em memória, ausência de identidade corporativa/MFA/auditoria e não certifica cookies de navegador (`docs/development/validacao-acesso-demo.md:9-24`).

**INCONSISTÊNCIA DOCUMENTAL CONFIRMADA:** `plan.md:5` menciona que a preferência atual do Dashboard informava publicação automática ativa, sem alteração pelo agente; o README atual afirma que publicação automática continua desativada e que Preview não é publicação nem produção (`README.md:79-84`). Deve prevalecer a afirmação operacional explícita do README/estado de deployment até confirmação do ambiente de publicação. **A CONFIRMAR:** política real de publicação do projeto e se há preferência externa divergente.

**CONFIRMADO NO CÓDIGO/documentação:** o histórico de revisão de acesso registrou divergências textuais antigas — documentação que dizia não haver login ou portal público — e anotou correções posteriores para distinguir gate demo de autenticação financeira (`docs/development/revisao-acesso-demo.md:36-53`). Não tratar o texto histórico anterior como feature ou condição atual; conferir sempre `App.tsx`, `DemoAccess`, `demoAccess` e README atual.

**CONFIRMADO NO CÓDIGO/documentação:** publicação automática, produção e integração real permanecem separadas de Preview; o README explicita que não houve migração SGE4B, operação bancária ou baixa real (`README.md:79-84`).

## 9. Roadmap não implementado e gates de dependência

### MVP demo reconstruível — recomendado

**RECOMENDAÇÃO — não implementado atualmente como pacote de auditoria final:** preservar o que já existe e aceitar como critério de reconstrução demo:

1. iniciar com `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm check`, `pnpm test`, `pnpm build` e scripts de verificação (`README.md:41-64`);
2. usar somente fixtures/inputs rotulados DEMO; manter reset, validação Zod, centavos, datas São Paulo, relações entre M1–M7 e exportação com cabeçalho DEMO;
3. manter `readOnlyGuard` e tRPC protegidos em 503; falha do status de infraestrutura não vira sucesso demo;
4. incluir no pacote futuro um `.env.example` sem valores, guia de assets/licenças e matriz de confirmação de cada rota;
5. executar browser real, teclado, leitor de tela, impressão/download e responsividade em dispositivo como critérios separados, pois não foram certificados nos relatos históricos.

### Financeiro real — sequência e requisitos não implementados

**RECOMENDAÇÃO — não implementado atualmente:**

- **Fundação/acesso:** e-mail/senha próprios, MFA TOTP obrigatório, sessões seguras, rate limit, recuperação, RBAC server-side, último admin, auditoria append-only e logs sem dado sensível (`TODO.md:40-64`; `docs/source/original/specs/acesso-e-auditoria.md:5-78`).
- **Gate Connect:** contrato versionado, HTTPS, conta de serviço, escopos, webhook HMAC, feed, idempotência, eventos/outbox, sandbox e testes bilaterais. Até lá, nenhuma baixa real (`docs/source/original/specs/integracao-com-o-connect.md:5-29,79-93`; `docs/analysis/mapa-modulos-e-fases.md:277-286`).
- **M2/migração:** exportação integral do SGE4B, levantamento das 11 bases/relatórios, deduplicação, reconciliação 100%, plano de corte e operação paralela (`docs/source/original/specs/cadastros-e-dimensoes.md:45-57`; `TODO.md:76-81`).
- **M3/fiscal:** regras de títulos, parcelas/rateios, estorno, recorrência, anexos, NF/RPA, alíquotas e retenções confirmadas pela contabilidade/DPO (`docs/source/original/specs/baixas-recorrencia-e-anexos.md:32-56`; `documentos-fiscais.md:45-59`; `TODO.md:83-88`).
- **M4/Connect:** orçamento por categoria/data no Connect, consumo, autorização acima do teto, autoridade do lifecycle, fechamento e reabertura (`orcamento-e-saude-financeira.md:39-65`; `projetos-financeiros.md:24-43,70-73`).
- **M5:** regras versionadas, antecedência/documentação, exceções, papéis e segregação; envio Itaú só depois de decisão N1 e autorização (`regras-de-pagamento-de-campo.md:20-38`; `folha-de-campo.md:43-55`; `lotes-de-pagamento-de-campo.md:30-39`).
- **M6:** formatos OFX/CSV, importação idempotente, transação imutável, devoluções, classificação e fechamento para contabilidade (`bancos-e-conciliacao.md:7-33`).
- **M7:** relatórios sobre dados reconciliados, competência/baixa/vencimento, escopo de acesso, exportação auditada e limites de processamento (`relatorios-e-analises.md:7-35`).

## 10. Dependências que exigem decisão externa (sem inventar)

- **DPO:** retenção de comprovantes/anexos/logs, ROPA/RIPD, CPF/PIS-NIT/RPA, acesso a NF e política de expurgo. A documentação registra conflito entre 6 meses no Connect para NF de entrevistador e 5 anos na rede, e retenção de notas de fornecedores; não consolidar sem decisão (`docs/source/original/specs/documentos-fiscais.md:16-21,45-59`; `docs/analysis/mapa-modulos-e-fases.md:288-307`).
- **Contabilidade:** plano de contas oficial, linhas DRE, categorias, tratamento de NF/RPA/INSS/retenções, formato do fechamento e significado contábil de exceções/devoluções.
- **PO/financeiro:** Q8 de segregação/alçada, Q16/D4 autoridade do lifecycle/projeto, F2 Pix de natureza mista, F3 categorias, F4 prazo/feriados, F8 empresas/unidades/escopo, F11 papéis ampliados, Q1 supervisor, Q4 reversão, N1 Itaú e N4 contrato Connect ampliado (`docs/source/original/handoff/01-visao-escopo-e-decisoes.md:72-82`; `docs/source/original/specs/papeis-e-escopo-ampliados.md:18-39`; `docs/analysis/mapa-modulos-e-fases.md:277-307`).
- **Connect:** API/contrato, sandbox, escopos, erros, estados de baixa, webhook/feed/outbox, fonte do orçamento e eventos bilaterais. O handoff de integração é proposta documental e não substitui evidência no Connect (`docs/source/original/handoff/07-integracao-com-o-connect.md:1-7,49-77,599-630`; `docs/analysis/diagnostico-tecnico.md:49-56`).
- **Publicação/infra:** confirmar política de publicação automática versus Preview, destino do asset gerenciado, origem/licença de logo/fonte e segregação de ambiente/banco antes de qualquer uso real.

## 11. Riscos de reconstrução

1. **Confundir demo com produção:** os nomes “pagar”, “conciliar”, “fechar” e “relatório” existem no mockup, mas só alteram estado local; risco mitigado pelos rótulos/guards, deve permanecer em qualquer evolução.
2. **Inferir contrato Connect:** endpoints e escopos documentados ainda são alvo; sem validação bilateral, qualquer baixa real seria insegura.
3. **Persistência insuficiente:** tabela `users` não é modelo financeiro; localStorage não é retenção corporativa, auditoria ou backup.
4. **Autenticação incompleta:** gate demo não possui identidade, MFA, RBAC ou auditoria do Financeiro; não usar para dados reais.
5. **Fiscal/DPO/contábil aberto:** NF/RPA, CPF/PIS-NIT, retenções, anexos e prazos têm decisões pendentes; não codificar como verdade definitiva.
6. **Migração SGE4B:** 11 bases e saldos abertos exigem exportação/reconciliação/corte; nenhum número histórico deve ser tratado como seed atual.
7. **Marca/licença:** só há logo branco rastreado e metadata; licença de logo/brandbook/fonte e asset colorido ainda precisam de confirmação.
8. **Validação de UX:** relatos históricos não substituem browser, teclado, leitor de tela, impressão/download e testes em dispositivos.
9. **Publicação:** divergência entre plano e README pode gerar promoção indevida; confirmar estado externo antes de declarar “publicado”.

## 12. Parecer final do domínio

**CONFIRMADO NO CÓDIGO:** o repositório atual cobre uma aplicação demonstrativa com sete módulos interligados por estado local, acesso demo separado, bloqueio de APIs protegidas, status técnico isolado e um logo branco oficial preservado. Cobre também documentação original suficiente para reconstruir o contrato-alvo, a stack recomendada, as regras de fonte da verdade e o roadmap.

**CONFIRMADO NO CÓDIGO:** não há Financeiro operacional real, schema financeiro, parser/ingestão bancária, Connect validado, MFA/RBAC/auditoria financeira, migração SGE4B, anexos fiscais, persistência de negócio ou publicação produtiva comprovada.

**A CONFIRMAR:** licenças/origem dos assets, fonte Open Sans no runtime, política efetiva de publicação, contrato/ambiente Connect, decisões DPO/contábil/PO e equivalentes MySQL de segurança/backup.

**RECOMENDAÇÃO — não implementado atualmente:** manter a barreira demo-only, usar esta matriz como mapa de reconstrução, e só promover módulos reais após gates independentes de segurança, DPO, contabilidade, Connect, migração e publicação. Não fazer AI generation/recolor do logo e não usar texto histórico como evidência de feature.
