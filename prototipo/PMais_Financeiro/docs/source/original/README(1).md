# Documentação do Financeiro

Sistema financeiro da Pesquise+, separado do P+ Connect, que substitui o SGE4B, em módulos.

## Por onde começar

| Perfil | Leia |
|---|---|
| Qualquer pessoa ou agente, antes de tudo | [specs/visao-geral](specs/visao-geral.md), depois [handoff/README](handoff/README.md) |
| Vai montar o repositório ou escrever código | [handoff/](handoff/README.md), arquivos 02 a 10 |
| Vai implementar um módulo | [planning/roadmap](planning/roadmap.md) e os specs do módulo em [specs/](specs/README.md) |
| PO / direção | [planning/perguntas-abertas](planning/perguntas-abertas.md) e [specs/futuro/](specs/futuro/README.md) |

## Pastas

| Pasta | O que tem |
|---|---|
| [handoff/](handoff/README.md) | Pacote técnico: stack, padrões, banco, UI, segurança, integração com o Connect, domínio do pagamento de entrevistadores, testes, processo e plano do Módulo 1 |
| [specs/](specs/README.md) | Contrato de comportamento por área, organizado por módulo; o que ainda não entrou fica em `futuro/` |
| [planning/](planning/roadmap.md) | Roadmap dos módulos, perguntas abertas e histórico das decisões de documentação |
| [transcricoes/](transcricoes/2026-10-21-processo-de-reconciliacao-e-lancamento.md) | Registro das reuniões que viraram requisito (resumo com minuto, sem dado pessoal) |

Pastas que o [handoff/10 §3](handoff/10-processo-docs-e-skills.md) pede e que serão criadas na fase 0:
- `architecture/` (modelo de dados, ADRs, segurança/LGPD);
- `development/`;
- `operations/`;
- `functional-map/`.

**Fora do repositório:** as entrevistas com a gestão operacional, o levantamento do SGE4B e a transcrição bruta das reuniões têm nomes, valores e comentários internos. Ficam com o PO e são citados nos specs como `[S1]`, `[S2]`, `[SGE4B]`, `[SWOT]` e `[Reunião dd/mm]`.
