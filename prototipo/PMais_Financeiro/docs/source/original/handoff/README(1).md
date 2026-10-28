# Handoff do sistema Financeiro

Pacote para o time (pessoas e agentes de IA) que vai construir o **Financeiro da Pesquise+** como sistema separado do **P+ Connect**, com os **mesmos padrões**: código, banco, front, segurança, testes e processo.

O pacote é autossuficiente: dá para trabalhar só com ele. Quando cita um arquivo do Connect (`backend/core/crypto.py`, `frontend/src/components/ui/`…), o caminho é deste repositório e serve para **copiar** o padrão real.

## Ordem de leitura

| # | Arquivo | Para quê | Quando |
|---|---|---|---|
| 01 | [Visão, escopo e decisões](01-visao-escopo-e-decisoes.md) | O que o Financeiro faz, a fronteira com o Connect, as decisões já tomadas e as perguntas em aberto | **Antes de tudo** |
| 02 | [Arquitetura e stack](02-arquitetura-e-stack.md) | Versões, pastas, como a app sobe, variáveis de ambiente, docker compose | Ao montar o repositório |
| 03 | [Padrões do backend](03-padroes-backend.md) | Camadas, rotas, exceções, dinheiro, datas, transações, filas, logs | Ao escrever qualquer código Python |
| 04 | [Banco de dados](04-banco-de-dados.md) | Database e usuário próprios, convenções, migrations, modelo de dados proposto | Ao criar tabela ou migration |
| 05 | [Padrões de frontend e UI](05-padroes-frontend-e-ui.md) | Next.js, componentes, marca, estados de tela, textos, acessibilidade | Ao criar ou mudar tela |
| 06 | [Segurança e LGPD](06-seguranca-e-lgpd.md) | Login, papéis, criptografia, cofre de arquivos, logs, auditoria, segredos, LGPD | Ao tocar em dado pessoal, arquivo, permissão ou login |
| 07 | [Integração com o Connect](07-integracao-com-o-connect.md) | Conta de serviço, contrato da API, webhooks, idempotência, o que cada lado implementa | Na fase 3 |
| 08 | [Domínio e código atual](08-dominio-e-codigo-atual.md) | Glossário, regras, fluxo, conciliação, parser, o que vem do Connect | Ao portar o Financeiro que já existe |
| 09 | [Testes, qualidade e CI](09-testes-qualidade-e-ci.md) | pytest, Vitest, Playwright, cobertura, workflows, definição de pronto | Ao montar o CI e em toda entrega |
| 10 | [Processo, docs e skills](10-processo-docs-e-skills.md) | AGENTS.md, estrutura de docs, skills e revisores prontos para copiar, commits e PRs | Ao montar o repositório |
| 11 | [Plano de implementação](11-plano-de-implementacao.md) | Fases, com o que é "pronto" em cada uma, e riscos | Para planejar |

## Para começar com um agente de IA

Coloque esta pasta em `docs/handoff/` do repositório novo e peça:

```
Leia docs/handoff/README.md e os arquivos 01, 10 e 11.
Execute a Fase 0 do 11-plano-de-implementacao.md seguindo os padrões dos arquivos 02 a 09.
Crie o AGENTS.md, as skills e os revisores com os textos do 10-processo-docs-e-skills.md.
Anote toda decisão no lugar indicado no 10. Commits separados por assunto, PR com base na main.
```

## Regras que valem para tudo

1. **Sistema separado:** o Financeiro nunca lê nem escreve no banco do Connect. A integração é só por API.
2. **Dinheiro é `Decimal`**, nunca `float`. O valor do Pix é exato e não existe resto.
3. **Nada é pago sem confirmação humana.**
4. **Dado pessoal:**
   - CPF só como hash;
   - chave Pix buscada sob demanda, mascarada na tela e sem cópia;
   - nada disso no log;
   - nenhum comprovante real no repositório.
5. **Decisão de produto não se toma no código:** vai para `perguntas-abertas.md`.
6. **Pronto = verde:** testes, lint, tipos, `check:ui` e e2e quando a tela muda.
7. **Um PR por entrega, base na `main`**, commits separados por assunto. Nada vai para a `main` sem o dono aprovar.

## Contato

- **Produto (PO):** João Paulo
- **Operação financeira e regras de acesso:** Vivi
- **LGPD e retenção:** DPO
