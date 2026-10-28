# ADR 001 — modo informativo com áreas protegidas adiadas

**Data:** 25/10/2026  
**Estado:** implementado no escopo da entrega informativa, por instrução do usuário.

## Contexto

O ZIP contém documentação, não código executável. A reconstrução com stack WebDev adaptada foi autorizada. O plano de acesso seguro exige chaves de sessão e criptografia MFA que não foram fornecidas. O usuário pediu continuar e pular as áreas que precisam de chaves.

## Decisão

Entregar uma base somente leitura, com catálogo sanitizado de módulos e checagem mínima do ambiente. Não implementar login inferior ao requisito aprovado, não usar OAuth do starter como desvio de e-mail/senha e MFA, e não oferecer ações monetárias ou exposição de dados protegidos.

Contexto de requisição não resolve identidade. Procedures administrativas/financeiras e de autenticação recusam acesso; rotas HTTP protegidas e métodos de escrita na API recusam a operação. A adição de segredos não habilita esses recursos automaticamente. Os critérios de acesso, MFA, auditoria, permissões e persistência de negócios permanecem abertos no TODO.

## Dados e infraestrutura

A verificação do banco é somente SELECT 1, com timeout, limite de conexões e cache curto. Nenhuma tabela de usuário ou negócio é consultada por essa entrega. Resposta de status contém apenas flags, estado da conexão e instante; não informa credenciais, DSN ou endpoints privados.

O banco gerenciado tem schema inicial do starter, mas isso não constitui persistência do domínio financeiro. Não há novas migrations, inserts, uploads, extratos, títulos ou registros fictícios. Os documentos originais não são servidos pelo front-end.

## Consequências

A interface pode ser validada no Preview sem segredos. Não é um Financeiro operacional, e os módulos são guias, não telas de CRUD. Retomar as etapas protegidas exige configuração de segredos, implantação do acesso seguro, MFA, autorização e auditoria com validação própria. Gates de Connect, dados, migração e operação continuam válidos.
