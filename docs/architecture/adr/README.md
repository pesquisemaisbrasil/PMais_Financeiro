# ADRs: registros de decisão de arquitetura

Uma decisão por arquivo, curta, no template de [handoff/10 §3](../../handoff/10-processo-docs-e-skills.md). O código é a fonte da verdade; o ADR explica o porquê.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-stack-do-sistema-real.md) | Stack do sistema real: a do handoff, igual à do Connect | Aceito |
| [0002](0002-comprovante-da-baixa-nao-cria-entrevista.md) | Comprovante dá baixa, não cria entrevista | Aceito |
| [0003](0003-pdf-de-comprovante-nao-e-armazenado.md) | PDF de comprovante não é armazenado | Proposto (Q19) |
| [0004](0004-cpf-de-usuario-fora-do-financeiro.md) | O Financeiro não guarda CPF de usuário | Aceito |
| [0005](0005-orcamento-e-teto-e-mora-no-connect.md) | Orçamento é teto, e quem o altera é o Connect | Aceito |
| [0006](0006-gitleaks-cli-no-ci.md) | Gitleaks pela CLI na CI | Aceito |
| [0007](0007-calendario-com-react-day-picker.md) | Calendário com react-day-picker | Aceito |
| [0008](0008-ler-planilha-com-openpyxl.md) | Ler planilha com openpyxl | Aceito |
| [0009](0009-padroes-de-outras-bibliotecas-em-shadcn.md) | Padrões do Ant Design, MUI X e Mantine feitos em shadcn | Aceito |
| [0010](0010-minio-pelo-build-da-chainguard.md) | Manter o MinIO, pelo build da Chainguard fixo por digest | Aceito (provisório) |
| [0011](0011-fastapi-e-starlette-novos-fora-da-versao-do-connect.md) | FastAPI 0.162.0 e Starlette 1.10.0, fora da versão do Connect | Aceito |
| [0012](0012-anexos-das-contas-cifrados-por-arquivo.md) | Anexos das contas, cifrados um a um no backend com chave-mestra própria | Aceito (provisório) |
| [0013](0013-consulta-de-cnpj-pela-brasilapi.md) | Consulta de CNPJ pela BrasilAPI, feita pelo servidor | Aceito (provisório) |
| [0014](0014-passeio-de-introducao-com-driver-js.md) | Passeio de introdução com o Driver.js (MIT), e não o Intro.js (AGPL) | Aceito |
| [0015](0015-feriados-por-cadastro-e-brasilapi.md) | Feriados por cadastro, com os nacionais buscados na BrasilAPI | Aceito (provisório) |
| [0016](0016-extrato-bancario-imutavel-e-descricao-cifrada.md) | Extrato bancário: linhas imutáveis, descrição cifrada e reimportação sem duplicar | Aceito (provisório) |
