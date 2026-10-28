# P+ Financeiro

Sistema financeiro da Pesquise+. É separado do **P+ Connect** e substitui o SGE4B, em módulos:

1. pagamento de entrevistadores;
2. cadastros e migração;
3. contas a pagar e a receber;
4. projetos, orçamento e provisionamento;
5. folha de campo e pagamento em lote;
6. conciliação bancária;
7. relatórios e fluxo de caixa.

**Estado:** documentação e especificação. O código começa na fase 0 do [plano](docs/handoff/11-plano-de-implementacao.md).

## Comece por aqui

- [docs/README.md](docs/README.md): índice da documentação.
- [docs/specs/visao-geral.md](docs/specs/visao-geral.md): o que o sistema faz, a fronteira com o Connect e as regras de produto.
- [docs/planning/roadmap.md](docs/planning/roadmap.md): ordem dos módulos.
- [docs/planning/perguntas-abertas.md](docs/planning/perguntas-abertas.md): o que ainda precisa de decisão.

## Regras que valem para tudo

- Integração com o Connect **só por API**: nunca acessar o banco ou o MinIO dele.
- Dinheiro em `Decimal`, Pix com valor exato, nada pago sem confirmação humana.
- CPF só como hash, chave Pix mascarada, nenhum dado pessoal em log.
- **Nenhum dado real no repositório:** comprovantes, notas, planilhas de pagamento e transcrições brutas ficam fora daqui.
