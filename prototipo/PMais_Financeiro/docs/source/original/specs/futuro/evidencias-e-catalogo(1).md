# Spec: Evidências e catálogo de projetos

> **Escopo futuro: não implementar sem decisão do PO** (pergunta [F1](../../planning/perguntas-abertas.md#escopo-futuro)). Ajustado às decisões do [handoff](../../handoff/README.md); ver o [README desta pasta](README.md).

**Onda D.** Contrato do cofre de evidências (fotos, recibos, folhas, e-mails de projeto) com OCR e renomeação em lote, e do catálogo de projetos que alimenta a Big Base e a calculadora.

## Comportamento

**Cofre de evidências**
- Envio em lote de arquivos por projeto para o cofre cifrado de [handoff/06 §4](../../handoff/06-seguranca-e-lgpd.md), cada um com metadados (projeto, tipo, pessoa, data, ID da entrevista/registro), checksum e original preservado.
- **Renomeação em lote:** dada uma planilha/banco com ID e códigos, renomeia os arquivos no padrão de entrega definido por projeto (modelo de nome configurável). Substitui o caso de 4 a 5 mil fotos renomeadas à mão [S1 25:37; S2 09:45].
- **OCR/visão:** lê o texto e o ID da foto ou do recibo, sugere o vínculo e aponta exceções (sem ID, ID inexistente, duplicada, fora do padrão de entrega).
- Fila de revisão humana para as exceções. Exportação do pacote de entrega já renomeado.
- Recibo de incentivo com OCR: confere o valor e o nome com a linha da folha (sinal antifraude [S1 41:33]).

**Catálogo de projetos (Big Base)**
- Para cada projeto: objetivo, categoria, metodologia, público, especialidade, comorbidade, amostra, duração, custo e resultado.
- **Extração assistida** a partir da proposta, da carta-convite e da introdução do questionário no STG, com revisão humana antes de publicar [S2 18:05–23:49].
- Busca por "médicos cardiologistas que atendem Chagas" ou "diabetes tipo 2" retorna os projetos e as bases relacionadas [S2 19:04–19:50].

## Regras

1. Arquivo sem projeto vai para a **quarentena** e não aparece em nenhum projeto [SWOT §7].
2. O original nunca é sobrescrito; a renomeação gera uma cópia nomeada, ligada ao original.
3. Sugestão de OCR abaixo do limiar de confiança vai para revisão; nada é vinculado sem confiança suficiente ou revisão.
4. Acesso, download e exclusão seguem o escopo do projeto e são auditados. A retenção segue a política do DPO (Q5).
5. Registro do catálogo só é publicado depois de revisado. Campo obrigatório vazio bloqueia a publicação [SWOT RF11].
6. Evidência com dado pessoal (foto de pessoa, recibo com CPF) segue a minimização: acesso restrito à gestora do projeto e à auditoria.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Publicar registro do catálogo sem revisão | 409 | Revise o registro antes de publicar |
| Arquivo duplicado (mesmo checksum no projeto) | 409 | Esse arquivo já foi enviado neste projeto |
| Baixar evidência fora do escopo | 404 | (registro não encontrado) |

## Critérios de aceite

- [ ] Um lote de 500 fotos com uma planilha de IDs sai renomeado no padrão do projeto, e as exceções ficam listadas.
- [ ] Gate: ≥95% dos nomes corretos e ≥90% dos campos extraídos corretos numa amostra rotulada, com tempo -70% [SWOT §4.5].
- [ ] Um recibo de incentivo com valor diferente da folha vira exceção.
- [ ] A proposta de um projeto gera a sugestão de objetivo, especialidade e comorbidade, que a gestora revisa e publica.

## Origem

- [S1 25:37–27:59; S2 09:45]: renomeação de fotos.
- [S2 18:05–25:20]: Big Base, objetivo/categoria, carta-convite e introdução do STG.
- [SWOT S15–S18, PT6, RF10, RF11].
