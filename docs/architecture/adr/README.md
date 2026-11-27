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
| [0017](0017-demonstracao-com-o-backend-no-navegador.md) | Versão de demonstração com o backend rodando no navegador (Pyodide) | Aceito (provisório) |
| [0018](0018-importar-o-relatorio-do-sistema-antigo.md) | Importar o relatório do sistema antigo: uma conta por linha, chave por linha e CPF retirado do texto | Aceito (provisório) |
| [0019](0019-solicitacoes-da-demonstracao-no-netlify.md) | Solicitações da demonstração numa função do Netlify, com Netlify Blobs e chave do desenvolvimento | Aceito (provisório) |
| [0020](0020-servidor-local-com-docker-compose-e-caddy.md) | Servidor local com Docker Compose, Makefile e Caddy com certificado da própria máquina | Aceito (provisório) |
| [0021](0021-projeto-cadastrado-no-financeiro-provisorio.md) | Projeto cadastrado no Financeiro, provisório, com a unidade e o centro de custo do lançamento | Aceito (provisório) |
| [0022](0022-navegador-liberado-por-cookie.md) | Navegador liberado por cookie, e não por IP: a conta só entra pelos computadores que um admin liberou | Aceito |
| [0024](0024-feriados-das-capitais-pelo-feriados-dev.md) | Feriados estaduais e municipais das 27 capitais pelo feriados.dev, rodando no nosso servidor e buscados sozinhos | Aceito (provisório) |
| [0023](0023-tres-niveis-de-acesso-e-telas-por-pessoa.md) | Três níveis de acesso (super admin, admin e usuário) e telas bloqueadas por pessoa, barradas também no servidor | Aceito (super admin provisório) |
| [0025](0025-abas-de-telas-com-activity.md) | Abas de telas como no VS Code, com o `<Activity>` do React montado no layout: cada aba guarda o estado até fechar | Aceito |
| [0026](0026-banco-local-no-servidor-e-atualizacao-as-22h.md) | Banco local levado ao servidor num pacote com as chaves, e atualização automática da `development` às 22h, que volta sozinha se a versão nova não subir | Aceito (provisório) |
| [0027](0027-nginx-do-servidor-na-frente-do-caddy.md) | Dois jeitos de abrir o servidor: pelo IP, com o HTTPS do Caddy e o certificado da máquina (portas 8444 e 8443), ou por nome, atrás do nginx como no P+ Connect | Aceito (provisório, Q64) |
| [0028](0028-baixa-de-incentivos-pelos-comprovantes-casados-pela-chave.md) | A baixa dos lançamentos de incentivo sai pelos comprovantes Pix, casados com cada pessoa pelo HMAC da chave, com a página de cada uma guardada nela | Aceito (guarda do comprovante a confirmar com o DPO, Q19 e Q69) |
