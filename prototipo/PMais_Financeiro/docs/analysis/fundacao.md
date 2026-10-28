# Análise — Fundação, segurança e design do P+ Financeiro

**Recorte:** fundação técnica, autenticação/autorização, auditoria e diretrizes de interface para a primeira entrega funcional. Análise restrita aos arquivos locais indicados e materiais de contexto. Não é implementação nem decisão de produto.

## Síntese e escopo da fase

O objetivo atual é construir software funcional, separado do P+ Connect, entregue incrementalmente; ainda não existe implementação específica do Financeiro neste novo projeto. Não é o protótipo navegável e mockado descrito no `PROMPT-PROTOTIPO-MANUS.txt`. O prompt antigo ajuda como referência de linguagem, experiência e alguns cenários, mas seus papéis ampliados, troca de papel, MFA fictício, armazenamento local e números de demonstração não são contrato operacional nem dados reais. A entrega inicial proposta fica em fundação, design, login/MFA, contas/permissões e auditoria, sujeita à aprovação do plano. Não inclui migração de dados reais, novos papéis, pagamentos bancários ou integração simulada em produção.

A adaptação autorizada de stack alvo (Next/FastAPI/Postgres/MinIO) para React/Vite/Express/tRPC/Drizzle/MySQL é técnica, não autorização para alterar regras. Preservar login por e-mail/senha, MFA obrigatório e apenas papéis `financeiro` e `admin`. A API do Connect não foi fornecida nem validada: qualquer baixa real deve permanecer bloqueada até validação bilateral de contrato, autenticação, idempotência e testes.

## Requisitos de fundação e design

- Aplicação e dados segregados do Connect; sem acesso direto aos seus bancos ou MinIO. Banco, credenciais, ambiente e armazenamento do Financeiro próprios. Configuração/segredos fora do repositório e fornecidos pelo cofre/ambiente.
- Organizar responsabilidades em camadas equivalentes: rotas/autenticação/permissões/limites; serviços/regras/transações; modelos e schemas; núcleo de infraestrutura. Toda rota precisa de contrato de entrada/saída, erros compreensíveis em pt-BR e autorização no servidor.
- Fundação inclui documentação de trabalho, specs, decisões/ADRs e perguntas abertas, testes e CI, verificações de dependências e segredos, cabeçalhos de segurança desde o início, health check e migration inicial.
- Interface alinhada à marca e padrões visuais do Connect, mas sem dependência da stack original: português do Brasil, responsiva para notebook, clara, acessível, foco visível, rótulos/nome acessível e estados de carregamento, vazio, erro e sucesso. Não depender só de cor ou tooltip para informar bloqueios. Ações irreversíveis usam confirmação explícita com resumo do efeito.
- Componentes, cliente HTTP centralizado, validação tipada e formatação ficam em módulos compartilhados; telas não fazem chamadas de rede ad hoc. A autorização da UI apenas esconde/explica ações; servidor sempre impõe a regra.
- Dinheiro usa decimal exato (nunca `float`); datas de negócio exibidas/calculadas em `America/Sao_Paulo`; textos e erros em pt-BR simples.
- Testes cobrem sucesso e negações (autenticação, papel, estado/entrada), verificando que tentativa negada não altera estado. Integrações externas sempre simuladas em testes, nunca chamadas em rede pela suíte. Dados de teste devem ser fictícios e determinísticos.

## Acesso, papéis e estados/transições

**Autenticação especificada:** login e-mail + senha; primeiro login exige cadastro de MFA antes de qualquer área protegida. Fluxo: credenciais válidas → token parcial `mfa_pending` (5 min) → MFA TOTP correto → par de tokens. MFA errado ou parcial expirado → 401; excesso de tentativas → 429/bloqueio temporário. A referência do spec define access token de 15 min em memória, refresh de 7 dias em cookie `HttpOnly; Secure; SameSite=Strict`, rotação e detecção de reuso por família, logout com revogação. Códigos de recuperação são de uso único.

Reautenticação MFA é requisito para download de planilha com chave Pix completa, confirmação de baixa (quando integração estiver autorizada), eventual cancelamento de baixa, criação/rotação de conta de serviço. Troca de senha exige senha atual, revoga outras sessões e avisa o usuário. Conta desativada não autentica; desativação revoga refresh tokens. Papel e permissões são consultados no banco a cada requisição.

Papéis mínimos e únicos da fase: `financeiro` (operações financeiras previstas) e `admin` (inclui usuários, contas de serviço e auditoria). Permissões finas documentadas: `confirm_payment`, `download_payment_sheet`, `manage_service_clients`; padrão de financeiro recebe as duas primeiras e admin todas. Auditoria administrativa é exclusiva de admin. Não ampliar para supervisor, direção, gestora, comercial ou auditor sem decisão explícita.

Estados relevantes de acesso: MFA ainda não configurado → cadastro obrigatório; MFA pendente → validado/expirado; sessão válida → renovada ou revogada; usuário ativo → desativado; papel/permissão anterior → novo. Rebaixar/desativar o último admin ativo é recusado (409). Usuário sem permissão recebe 403 quando sabe que o recurso existe; recursos fora de seu conhecimento/escopo devem responder 404 para evitar enumeração.

**Auditoria append-only:** eventos financeiros, acessos a dados pessoais/chave Pix, exportações, alterações de papel/permissão, contas de serviço e chamadas de integração. Autor deve ser identificável; eventos de auditoria não podem ser alterados/apagados pela aplicação (restrição de privilégio também no banco, conforme padrão Postgres de referência). Sem dados pessoais em logs técnicos, corpos de requisição ou logs de integração. Manter data/IP/user-agent do último login nos termos do spec.

## Campos e dados de fundação

- Usuário: identificador interno, e-mail, hash de senha, papel (`financeiro`/`admin`), estado ativo/desativado, configuração/segredo MFA protegido, códigos de recuperação em forma segura, sessões/refresh token hash e família, datas de criação/atualização e último login (data, IP, user-agent). Nunca armazenar CPF.
- Permissões: usuário, capacidade, valor/concessão; log de alteração com autor e antes/depois.
- Sessão: hash do refresh token, família, expiração/revogação/uso; access token curto e não persistido no armazenamento durável do navegador.
- Auditoria: tipo/ação, ator, instante, objeto/referência, antes/depois quando necessário e filtros de consulta; export/access logs sem gravar chave completa ou conteúdo sensível. Append-only.
- Configuração: segredos fora do código; ambiente separado; endpoints de documentação/OpenAPI desativados em produção, headers de segurança, rate limit especialmente para login/MFA.
- Design: identidade do produto, tokens de cor/tipografia, componentes e estados acessíveis. Valores demonstrativos do prompt antigo não entram como dados de negócio.

## Regras críticas de segurança e qualidade

1. MFA obrigatório para ambos os papéis, inclusive primeiro acesso; MFA reexigido em ações críticas especificadas.
2. Login é por e-mail, não CPF; nenhuma coluna ou tela de CPF no Financeiro.
3. Autorização é decidida pelo backend em cada chamada; não confiar em estado/rota/menus do navegador.
4. Refresh rotativo com detecção de reuso; desativar usuário invalida sessões; proteger contra remoção do último admin.
5. Segredos, tokens, TOTP/códigos e dados pessoais nunca em logs, respostas não autorizadas ou repositório. Auditoria não substitui log técnico e não é editável pela role de aplicação.
6. Segregar o Financeiro do Connect. Sem leitura/escrita em banco/MinIO do Connect e sem baixa real enquanto a API não for validada.
7. Download com chave Pix completa, se entrar numa fase posterior, precisa MFA e auditoria de exportação/acesso; a chave não deve aparecer em telas comuns.
8. Erros não revelam existência de recursos fora de escopo; mensagens para usuário em português simples. Rate limit para autenticação/MFA e proteção contra enumeração.
9. Persistência de sessão coerente com o spec: access token somente em memória e refresh em cookie protegido; não copiar sem revisão a referência de frontend que usa `localStorage`.
10. Testar tentativas inválidas, expiração/reuso, papel insuficiente, conta inativa, último admin, auditoria e ausência de CPF/chave em claro; CI deve incluir lint, testes, análise de dependências/segredos e validação de migrações conforme stack escolhida.

## Contradições e decisões abertas

- **Login:** spec de acesso decide e-mail/senha; handoff de banco sugere copiar autenticação por CPF do Connect. Prevalece o spec mais recente/decisão registrada: e-mail; alinhar esquema, APIs e testes para não importar CPF.
- **Sessão frontend:** especificação de segurança determina access em memória e refresh em cookie HttpOnly; padrão UI antigo do Connect guarda ambos em `localStorage`. Não copiar este mecanismo legado; adaptar cliente à sessão segura.
- **Papéis:** prompt do protótipo lista sete papéis e seletor instantâneo, mas visão geral/spec e solicitação atual limitam a `financeiro` e `admin`. Os papéis adicionais são pendências de produto, não autorização.
- **Protótipo vs produto:** prompt demanda SPA mockada, sem login real, com MFA qualquer código e dados em `localStorage`. Isso contradiz autenticação e persistência seguras atuais; serve apenas como evidência de intenção visual/validação. Números, nomes e cadastros são fictícios.
- **Stack:** handoff recomenda Next/FastAPI/Postgres/MinIO; adaptação React/Vite/Express/tRPC/Drizzle/MySQL está autorizada como decisão técnica. Documentar diferenças e redesenhar CI, autenticação, migrations, auditoria append-only e controles equivalentes; não replicar mecanicamente exemplos específicos de SQL/Postgres.
- **Permissão de confirmação:** spec lista `confirm_payment` por padrão para financeiro, enquanto pergunta Q8 deixa sem segregação e o protótipo antigo pede segregação por alçada. Não inventar dupla aprovação ou limite: esclarecer antes de instituir regra; no recorte de fundação não implementar pagamento.
- **Baixa e integração:** documentos pressupõem futura API `/integrations/v1`, outbox e idempotência; roadmap confirma dependência. Não está disponível/validada e não se deve simular integração como se fosse funcional. Baixa real fica bloqueada até validação.
- **Auditoria/banco:** modelos/regras append-only são propostos com privilégios Postgres específicos. Em MySQL, definir e testar mecanismo equivalente de negação de UPDATE/DELETE e privilégio mínimo; não afirmar garantia apenas por convenção da aplicação.
- **Escopo/ordem:** roadmap põe fase 0 como fundação e fase 1 como contas/acesso; plano também prevê MFA/auditoria em fase 1. A entrega pedida combina essas áreas incrementalmente; separar base técnica e acesso em marcos testáveis, sem antecipar os módulos financeiros.
- **Perguntas restantes:** segregação de funções Q8; login único/OIDC Q14 (pensar sem implementá-lo); ROPA/RIPD e validação DPO; política de auditoria/retensão; gestão segura de segredo MFA e recuperação; limites e política operacional para bloqueio/rate limits. Decisões de produto devem ser perguntadas e registradas, não preenchidas pelo código.

## Dependências / bloqueios

- Definição/validação de infraestrutura gerenciada e equivalentes MySQL para migrations, privilégios append-only, backup e secrets; o ajuste de stack não apaga essas necessidades.
- Responsáveis precisam confirmar fluxo de provisionamento inicial do primeiro admin, recuperação de MFA e procedimentos de suporte sem enfraquecer o MFA.
- Decisão/parecer DPO sobre retenção de trilha e tratamento do material de autenticação; ROPA/RIPD pendentes para operações futuras com dados pessoais.
- Para qualquer baixa real: API do Connect, contrato versionado, autenticação de serviço, idempotência, eventos/outbox e testes bilaterais aprovados. Até lá, sem baixa.
- Mudanças futuras de papéis, segregação, login único, contas de serviço e integração precisam de decisão registrada; nenhum item autoriza migração de dados reais, pagamento bancário ou novos papéis nesta fase.

## Recomendação

Entregar em dois incrementos coerentes dentro do escopo autorizado: (1) fundação, estrutura documental, identidade visual, componentes acessíveis, base de testes/CI, armazenamento e segregação; (2) login e-mail/senha, MFA obrigatório, sessão segura, papéis financeiro/admin, gestão mínima de contas e auditoria append-only, com critérios de aceite e testes negativos. Não colocar módulos de contas a pagar, conciliação, baixa ou integração real nesta primeira entrega. Manter todo exemplo com dados sintéticos; qualquer decisão não coberta deve permanecer pergunta aberta até deliberação competente.
