# ADR 0029: Acesso por empresa, com um filtro central no servidor

**Status:** Aceito
**Data:** 27/11/2026

## Contexto

O Financeiro tem várias empresas do Grupo. Na reunião de 26/11, a Bruna contou que a Camila só vê a Pesquise+ e que outra pessoa só veria a IHEA. Em 27/11 o Bruno pediu: os admins definem, para cada pessoa, se ela vê todas as empresas ou só algumas ([registro](../../transcricoes/2026-11-27-acesso-por-empresa.md)).

Esconder na tela não basta: relatórios, planilhas, busca, avisos e a API chamada direto também precisam respeitar. São centenas de consultas no backend, e uma consulta nova esquecida vazaria dado de outra empresa.

## Decisão

- **`users.companyAccess`**: as empresas liberadas, separadas por vírgula; nulo é todas. Ninguém perde acesso na atualização. O super admin sempre vê todas.
- **Filtro central** (`core/company_scope.py`): o login grava as empresas na sessão do banco do pedido, e um ouvinte do SQLAlchemy (`do_orm_execute` com `with_loader_criteria`) filtra toda consulta:
  - empresa, unidade, conta bancária, conta a pagar e título a receber, com tudo o que pendura neles (baixas, pessoas, rateios, anexos, histórico);
  - extrato, conciliação e fechamento.
  Uma tela nova nasce filtrada, e escolher algo de outra empresa numa gravação vira "não encontrado".
- **Olham todas as empresas** (`unscoped`) as checagens que protegem dado e dinheiro:
  - um Pix ou ID bancário só vale uma vez;
  - código e nome não repetem;
  - cadastro ou projeto em uso não se exclui;
  - o relatório e a planilha já importados são reconhecidos;
  - a provisão volta quando a conta real que a substituiu é cancelada.
- **Projetos** são filtrados nas listas e nas escolhas, não pelo filtro central: uma conta pode ter rateio num projeto de outra empresa, e esconder o projeto quebraria a conta. Projeto sem empresa aparece para todos. Clientes e fornecedores são compartilhados.
- **Comprovantes e divergências do Connect** juntam pessoas de várias empresas num lote: pedem acesso a todas, e os avisos deles vão só para quem vê todas.
- **Quem muda:** em Acessos, com as regras das telas (admin muda usuários, super admin também admins, ninguém muda as próprias), e **só quem vê todas as empresas**. Quem vê só algumas não cadastra empresa nova.

## Consequências

- Duas particularidades do SQLAlchemy 1.4, cobertas por teste:
  - as consultas filtradas **não usam o cache de comandos**, e o valor das empresas é lido na hora (`callable_` numa `ContextVar`): sem isso, uma carga de relação reaproveitava o filtro de outra pessoa;
  - uma junção com condição escrita à mão (`join(Payable, ...)`) não é filtrada pelo lado juntado: por isso as tabelas filhas têm o filtro próprio.
- `tests/test_acesso_por_empresa.py` passa por **todas** as rotas de leitura com uma pessoa restrita e procura as marcas da empresa oculta. Rota nova com número no endereço faz o teste falhar até entrar nele.
- Um admin restrito só vê o nome das empresas dele em Acessos e não muda o acesso por empresa de ninguém.
- Sem o filtro, ficam os trabalhos de fundo (envio ao Connect, feriados, limpeza), que não são de uma pessoa.
- Alternativa descartada: *row level security* do Postgres. Os testes e a demonstração rodam em SQLite, e o filtro não seria testado como em produção.
