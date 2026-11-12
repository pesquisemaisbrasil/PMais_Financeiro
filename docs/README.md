# Documentação do Financeiro

Sistema financeiro da Pesquise+, separado do P+ Connect, que substitui o SGE4B, em módulos.

## Por onde começar

| Perfil | Leia |
|---|---|
| Qualquer pessoa ou agente, antes de tudo | [specs/visao-geral](specs/visao-geral.md), depois [handoff/README](handoff/README.md) |
| Vai montar o repositório ou escrever código | [handoff/](handoff/README.md), arquivos 02 a 10 |
| Vai implementar um módulo | [planning/roadmap](planning/roadmap.md), [planning/proximos-passos](planning/proximos-passos.md) e os specs do módulo em [specs/](specs/README.md) |
| PO / direção | [planning/perguntas-abertas](planning/perguntas-abertas.md) e [specs/futuro/](specs/futuro/README.md) |

Regras de trabalho, skills e revisores: [AGENTS.md](../AGENTS.md).

## Pastas

| Pasta | O que tem |
|---|---|
| [handoff/](handoff/README.md) | Pacote técnico: stack, padrões, banco, UI, segurança, integração com o Connect, domínio do pagamento de entrevistadores, testes, processo e plano do Módulo 1 |
| [specs/](specs/README.md) | Contrato de comportamento por área, organizado por módulo; o que ainda não entrou fica em `futuro/` |
| [planning/](planning/roadmap.md) | Roadmap dos módulos, perguntas abertas e histórico das decisões de documentação |
| [transcricoes/](transcricoes/2026-10-21-processo-de-reconciliacao-e-lancamento.md) | Registro das reuniões que viraram requisito (resumo com minuto, sem dado pessoal); a mais recente é o [kickoff de 03/11](transcricoes/2026-11-03-kickoff-com-o-financeiro.md) |
| [architecture/](architecture/README.md) | [ADRs](architecture/adr/README.md) e, conforme forem escritos, modelo de dados, segurança e LGPD |
| [development/](development/README.md) | Padrões de código, testes e entrega; por enquanto aponta para o handoff |
| [operations/](operations/README.md) | Runbooks; por enquanto aponta para o README da raiz. Inclui [testar com o Connect de dev](operations/testar-com-o-connect-dev.md), a partir do [guia do João](connect-dev-integracao-financeiro.md) |
| [functional-map/](functional-map/README.md) | Jornadas e fluxos; por enquanto aponta para os specs |

**Fora do repositório:** as entrevistas com a gestão operacional, o levantamento do SGE4B e a transcrição bruta das reuniões têm nomes, valores e comentários internos. Ficam com o PO e são citados nos specs como `[S1]`, `[S2]`, `[SGE4B]`, `[SWOT]` e `[Reunião dd/mm]` e `[Kickoff dd/mm]`.
