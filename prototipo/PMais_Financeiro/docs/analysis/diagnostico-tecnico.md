# Diagnóstico técnico — P+ Financeiro

**Data da análise:** 25/10/2026  
**Fonte:** `PMais_Financeiro.zip`, prompt anexado, guia de marca e logotipo oficial anexados.

## 1. Conclusão executiva

O ZIP fornecido não contém uma aplicação executável a ser modernizada. Ele reúne **46 arquivos de documentação e especificação** (Markdown, texto e `.gitignore`); não foram encontrados arquivos de código, dependências, configurações de build, migrations, modelos de banco, rotas, testes ou implementação de interface. O README do próprio pacote declara: **“Estado: documentação e especificação. O código começa na fase 0.”**

Portanto, não é possível, com este ZIP, cumprir a instrução de preservar e evoluir código funcional do P+ Financeiro. As especificações descrevem regras e fluxos que hoje pertencem em parte ao P+ Connect, mas o código do Connect também não foi anexado. A iniciativa, neste ponto, é uma **construção nova baseada em documentação**, não uma modernização verificável de software existente.

## 2. Matriz técnica do material fornecido

| Elemento | Encontrado no pacote | Diagnóstico |
|---|---|---|
| Tecnologia | Stack-alvo documentada: Next.js 16.4.2, React 19.2.8, TypeScript 5, Tailwind 4; API FastAPI/Python 3.11, SQLAlchemy 1.4.39, PostgreSQL 16, Alembic e MinIO. | São decisões/recomendações documentais; não há manifests ou código que comprove implementação. |
| Front-end | Fluxos, telas e padrões descritos em documentos. | Nenhuma rota, página, componente, estado ou arquivo de front-end no ZIP. |
| Back-end | Camadas, APIs propostas, regras financeiras e contratos descritos. | Nenhum serviço, endpoint, parser ou código de negócio do Financeiro no ZIP. |
| Banco de dados | Modelo proposto e convenções de PostgreSQL/SQLAlchemy documentados. | Nenhum schema, migration, ORM model, seed ou banco configurado no pacote. |
| Autenticação | Especificação de login por e-mail, access/refresh tokens e MFA TOTP obrigatório para `admin` e `financeiro`. | Não implementada nem verificável no material. |
| Autorização | Papéis iniciais `financeiro` e `admin`; supervisores e entrevistadores não entram no Financeiro, conforme decisões atuais. | Não implementada. Todas as decisões de acesso precisam ser aplicadas também no servidor. |
| Funcionalidades | Specs para pagamentos, comprovantes, cadastros, contas, projetos/orçamento, folha, conciliação e relatórios. | Não há funcionalidade operacional no código do Financeiro fornecido. |
| Integrações | Contrato proposto com P+ Connect, além de requisitos para MinIO e eventual infraestrutura bancária. | A integração não pode ser considerada disponível sem verificar o Connect e obter ambiente/credenciais de teste. |
| Testes e CI | Requisitos de pytest, Vitest, Playwright, lint, auditoria de dependências e segredos. | Nenhum teste, workflow, fixture ou configuração de CI no ZIP. |
| Preservação | Documentação menciona código financeiro existente dentro do Connect e descreve caminhos e testes desse repositório. | O código-fonte referido não foi fornecido. Não é possível portar, comparar ou garantir preservação. |

## 3. Situação dos módulos do roadmap

| Módulo | Estado documental | Estado de implementação no ZIP | Dependências/bloqueios relevantes |
|---|---|---|---|
| 0. Fundação do repositório | Plano de fundação detalhado. | Não iniciada no pacote. | Decisão de repositório, runtime, banco, armazenamento, autenticação e estratégia de publicação. |
| 1. Pagamento de entrevistadores | Specs detalhados; regras de parser, conciliação FIFO por valor exato, confirmação humana, planilha auditada e minimização de dados. | Nenhuma implementação do Financeiro presente. | API do Connect, acesso ao código de referência/testes do Connect e confirmação do status real das rotas de integração. |
| 2. Cadastros, papéis e migração | Specs prontos. | Não implementado. | Exportação completa do SGE4B e decisão sobre os dados/cadastros a migrar. |
| 3. Contas a pagar e receber | Specs prontos; o roadmap ainda marca protótipo a fazer. | Não implementado. | Validação do protótipo e decisões de categorias, cadastros, recorrência e documentos fiscais. |
| 4. Projetos, orçamento e provisionamento | Specs prontos. | Não implementado. | Depende dos módulos 1 e 3 e de ampliação do contrato com o Connect para orçamento por categoria. |
| 5. Folha de campo e pagamento em lote | Specs prontos. | Não implementado. | Depende dos módulos 1, 3 e 4; eventual pagamento direto pelo Itaú depende de pesquisa e decisão pendentes. |
| 6. Conciliação bancária | Spec pronto. | Não implementado. | Depende do módulo 3 e da definição operacional dos extratos/bancos. |
| 7. Relatórios e fluxo de caixa | Spec pronto. | Não implementado. | Depende dos módulos 3, 4 e 6 e de dados persistidos confiáveis. |

## 4. Classificação solicitada de funcionalidades

- **Existentes e operacionais no código entregue:** nenhuma funcionalidade pode ser confirmada; não há código executável do Financeiro no ZIP.
- **Existentes, mas incompletas no código entregue:** nenhuma pode ser verificada. O pacote descreve funcionalidades que estariam no P+ Connect, mas não inclui o repositório nem os testes referenciados.
- **Ausentes no projeto Financeiro entregue / previstas para construção:** fundação, interface, API, banco, login, autorização, auditoria e todos os módulos 1–7.
- **Dependentes de decisão ou integração externa:** integração máquina a máquina com Connect; credenciais e ambiente de teste; exportação SGE4B; infraestrutura PostgreSQL/MinIO compatível; pesquisa/decisão de Itaú; ROPA/RIPD e retenção aprovados pelo DPO; itens pendentes na lista de perguntas abertas.

Essa classificação se refere ao conteúdo recebido. Não declara que as funcionalidades descritas como atuais no Connect inexistem; apenas que não foram entregues nem verificadas neste pacote.

## 5. Integração com o Connect: risco de status inconsistente

O documento `docs/handoff/07-integracao-com-o-connect.md` contém duas indicações que precisam ser reconciliadas com o repositório/ambiente real do Connect:

1. No início, informa que o Connect **não tem** integração máquina a máquina, conta de serviço, escopos, webhooks, outbox nem rotas `/v1`.
2. Em seção posterior, afirma que uma “fatia 1” já teria implementado partes da identidade de serviço e leitura de projetos, itens a pagar e entrevistadores.

O mesmo documento lista como faltantes operações críticas, incluindo dados Pix sob demanda, casamento de chave, baixa idempotente, outbox/webhooks e feed de eventos. Assim, **não se deve presumir que o fluxo de pagamento de ponta a ponta está disponível** sem confirmação técnica no código/ambiente do Connect. O próprio plano de implementação condiciona a fase 3 à API de integração estar publicada e testada.

## 6. Regras críticas identificadas

As regras de negócio documentadas incluem: valores em `Decimal` e transporte como strings decimais; moeda e datas em pt-BR/fuso de São Paulo; nenhum pagamento sem confirmação humana; valor do Pix igual à soma exata das entrevistas; chave Pix completa somente sob demanda para planilha auditada; não persistir chave Pix completa nem PDF de comprovante; CPF não aparece; separação estrita do banco/MinIO do Connect; baixa gravada pelo Connect mediante API idempotente; acesso financeiro protegido por papel, MFA e auditoria.

A implementação desses controles não é demonstrável sem código, configuração de ambiente, testes e serviços disponíveis. O sistema não deve receber dados financeiros reais até que os controles, políticas e operadores sejam definidos e verificados.

## 7. Compatibilidade de arquitetura e implantação

A arquitetura prescrita nos documentos é Next.js + FastAPI + PostgreSQL 16 + MinIO, em repositórios e bancos separados. Um projeto Manus WebDev pode oferecer uma via gerenciada e acelerada, mas usar seus starters/serviços pode exigir adaptação de framework, runtime e/ou banco em relação às decisões documentadas. Isso seria uma **mudança arquitetural**; não deve ser feita silenciosamente, pois o material determina preservar a stack e justifica a separação do Connect.

Para manter fielmente a arquitetura documentada, ainda seriam necessários o repositório/artefatos ausentes, infraestrutura compatível e configuração segura das integrações. Para construir sobre a infraestrutura gerenciada do Manus, é preciso autorizar explicitamente a arquitetura alternativa e delimitar a primeira entrega. Em ambos os caminhos, a baixa real de entrevistas continua bloqueada até a API do Connect estar disponível e validada.

## 8. Recomendação e próximo passo

Recomendo não declarar nem publicar agora um Financeiro “operacional” ou “pronto para produção”. O próximo passo é escolher um destes caminhos:

1. **Preservar a arquitetura especificada:** fornecer o repositório/ZIP com o código real a evoluir (se existente), além de uma referência do Connect e de um ambiente/API de teste para integração. Confirmar também onde PostgreSQL e MinIO serão executados.
2. **Construir de novo a partir das especificações:** autorizar a arquitetura gerenciada alternativa e a entrega em fases. O primeiro escopo precisa explicitar quais capacidades podem operar sem a API do Connect; a integração e a baixa real só entram após sua validação.

Nenhum código ou serviço foi alterado nesta etapa de diagnóstico.
