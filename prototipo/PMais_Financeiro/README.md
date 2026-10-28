# P+ Financeiro — mockup interativo

Aplicativo demonstrativo da Pesquise+ / P+Solution Research, reconstruído no Manus WebDev a partir dos documentos fornecidos.

## Estado da entrega

**MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL**

O dashboard e os sete módulos compartilham um estado local de demonstração. Cadastros alimentam títulos; provisões viram títulos sem dupla contagem; folhas/lotes criam contas a pagar; liquidações simuladas atualizam a origem e geram movimentos demonstrativos; conciliação e relatórios leem o mesmo conjunto. Valores, pessoas, projetos, orçamento, classificações e datas são exemplos sintéticos, não dados ou decisões oficiais.

Não há banco financeiro, pagamento, Pix, importação de extrato/PDF real, Connect/Itaú, identidade individual do Financeiro, MFA ou auditoria financeira. O servidor recusa operações financeiras protegidas; configurar chaves não as habilita automaticamente. Nunca insira dados pessoais/financeiros reais no mockup.

## Acesso ao mockup — extensão de 26/10/2026

Abra o aplicativo e entre com o identificador `adm` e a senha configurada pelo usuário no formulário protegido. A senha é lida somente pelo servidor em `PMAIS_DEMO_LOGIN_PASSWORD`; seu valor não faz parte dos fontes, exemplos, cliente ou logs. Não há cadastro público nem usuário administrador financeiro criado por esse login.

O acesso usa sessões opacas em memória, expira em até 30 minutos e é revogado pelo botão **Sair**. Reiniciar ou substituir a instância exige entrar novamente; a demonstração não oferece sessão distribuída entre instâncias nem autenticação corporativa. Cookie próprio HttpOnly/Secure/SameSite=None/Partitioned é elegível ao Preview HTTPS. CSRF está vinculado à sessão e tentativas são limitadas em janela de cinco minutos. Senha e token não vão ao armazenamento do navegador.

Para desenvolvimento exclusivamente HTTP local, existe o modo explícito `PMAIS_DEMO_LOCAL_HTTP=1`; nunca o habilite no Preview/produção. Políticas de cookies de terceiros ainda podem impedir acesso; a aplicação mantém o estado desconectado e informa a falha, sem inventar sessão. Sem a senha protegida configurada, o login permanece indisponível. Esses controles não substituem MFA, autorização ou proteção para dados financeiros reais.

## Módulos navegáveis

| Módulo | Demonstração |
|---|---|
| M1 Pagamentos de campo | Selecionar itens DEMO, formar lote exato, confirmar liquidação local e ver o efeito em Contas/Conciliação. |
| M2 Cadastros | Criar fornecedor/cliente/categoria/centro/projeto sintético; buscar, editar nome e inativar fornecedor/cliente; preservar vínculos. |
| M3 Contas | Criar pagar/receber, filtrar, simular parcial/total de título manual, consultar histórico e resolver pendência documental fictícia. Folhas/lotes exigem soma exata total. |
| M4 Orçamento | Baseline fictícia, métricas derivadas, provisões, conversão/cancelamento local e alertas informativos. |
| M5 Folha/lotes | Item calculado por quantidade/unidade, ciclo, conferência/aprovação, título vinculado e liquidação simulada. |
| M6 Conciliação | Somente movimentos gerados pelo demo; classificação, conciliação/exceção local, fechamento e reabertura com motivo. |
| M7 Relatórios | Seis vistas com período/projeto/categoria, previsto por vencimento, realizado por baixa, resultado por competência, aging, conciliação, CSV demo e impressão. |

Guia detalhado: `docs/development/guia-mockup.md`. Catálogo, segurança, acesso e implantação real mínima continuam disponíveis em rotas separadas. Documentos internos e transcrições não são servidos pela interface.

## Estado local e limites

Chave: `pmaisfinanceiro:demo:v1` no localStorage. Apenas registros sintéticos, nunca tokens/credenciais. O estado é validado ao carregar; dados incompatíveis/corrompidos são descartados. Ação **Restaurar demonstração**, no dashboard, repõe fixtures após confirmação dentro do app. Armazenamento local não é banco corporativo, não compartilha dados entre computadores e pode ser removido pelo navegador. Se armazenamento falhar, o mockup continua temporariamente em memória e mostra aviso.

Datas de negócio seguem São Paulo; moeda é representada por inteiros em centavos. O valor de linha de folha usa aritmética inteira. Baixa parcial não excede saldo; lote/folha exige total exato. Período fechado bloqueia mutações datadas pertinentes. Esses controles exercitam hipóteses de UI, não certificam o domínio contábil/fiscal ou a segurança de produção.

## Instalação e execução

Node.js compatível com Dockerfile e pnpm 10.18.0:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

No Manus, abra Preview. O servidor usa `0.0.0.0`, porta 3000 ou `PORT` configurada; o acesso exige a senha previamente confirmada no formulário protegido. A logo oficial é servida pelo armazenamento gerenciado e tem cópia intacta de fallback local.

```bash
pnpm check
pnpm test
pnpm build
pnpm start
# Com o app ativo:
python3 scripts/check-readonly-http.py
python3 scripts/check-demo-access.py
```

Rotina completa reproduzível: `scripts/verify-delivery.sh`. Health: `/api/health`. Status técnico real: `/api/deployment/status`.

## Arquitetura

React/TypeScript/Vite, Tailwind/Radix; Express/tRPC; MySQL gerenciado somente para checagem SELECT 1 nesta entrega. A adaptação Next/FastAPI/PostgreSQL/MinIO continua documentada; requisitos originais permanecem em `docs/source/`.

- `client/src/pages/demo/`: dashboard e sete páginas, carregadas sob demanda.
- `client/src/contexts/DemoStore.tsx`: API local compartilhada e reducer; não chama serviços.
- `client/src/lib/demoModel.ts`, `demoValidation.ts`: fixtures, tipos, moeda/data, validação de integridade.
- `client/src/components/Demo*`: componentes e confirmação acessível no app.
- `server/services/deployment.ts`: status mínimo real, sem revelar segredos.
- `server/security/readOnlyGuard.ts`: continua recusando escrita/rotas protegidas.
- `docs/architecture/ADR-002-mockup-interativo.md`: distinção entre mockup e operação real.
- `plan.md`, `TODO.md`: requisitos demonstrativos e gates operacionais separados.

## Verificação e evolução

Tipos/build/testes e revisão independente foram executados sem escrever no banco ou integrar serviços. Evidências e limitações estão em `docs/development/validacao-mockup.md`. Não houve bateria de browser/teclado/leitor de tela ou certificação WCAG.

Publicação automática continua desativada; Preview não é publicação nem produção. Para evoluir além do mockup, ainda são necessários acesso seguro por e-mail/senha e MFA, permissões, auditoria, persistência financeira durável, decisões de DPO/contabilidade/PO, contratos/API de Connect e banco validados e autorização própria. Nenhuma migração SGE4B, operação bancária ou baixa real foi realizada.
