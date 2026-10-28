# ADR 002 — mockup local interativo dos sete módulos

**Data:** 25/10/2026  
**Estado:** aprovado pelo usuário; mockup implementado, sem autorização/uso real.

## Contexto

A versão anterior é uma base informativa somente leitura. O usuário pediu mockup funcional e interativo de todos os módulos. O pedido anterior de pular áreas que exigem chaves continua vigente.

## Decisão

Criar demonstração de navegação, formulários e fluxos por meio de dados identificados como sintéticos. Um estado compartilhado entre sete módulos mantém vínculos e recalcula vistas/relatórios. O estado fica somente no browser em chave versionada, com validação/reset; a API do app não grava nem recebe as entidades demonstrativas. Ações que se chamem pagar, receber, baixar, importar, conciliar ou fechar período são apenas ações locais de demonstração com confirmação e rótulo “Simulado”.

Nenhum PDF/OFX/CSV real é aceito; extrato demonstrativo deriva das operações simuladas. Não há Pix, CPF/CNPJ, credencial, integração com Connect/Itaú, dados bancários reais, migração, banco de negócio, sessão/MFA, usuário ou auditoria. As rotas e APIs financeiras de servidor permanecem bloqueadas. A checagem mínima de implantação continua real e não exibe segredo/DSN.

## Consequências

O mockup permitirá validar sequência de telas e interdependências, sem provar o domínio operacional, segurança financeira, conformidade, reconciliação bancária ou integração. Todas as telas/exportações têm avisos permanentes para prevenir confusão. Qualquer evolução para dados reais exige novo estágio, acesso seguro, contratos validados e as decisões registradas nos specs.
