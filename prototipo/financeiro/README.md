# Protótipo do Financeiro

HTML puro, sem build e sem servidor. **Abra `index.html` com dois cliques** ou publique a pasta inteira no Netlify (Netlify Drop).

Tudo é simulado e fictício: extrato, planilhas, PDF de comprovantes e notas do portal são **arquivos de exemplo dentro do protótipo**. Nada sai do computador. As ações ficam salvas no navegador; **Restaurar dados de exemplo** volta tudo ao começo.

## Telas (as 6 entregas do plano de 3 meses, ajustadas após o kickoff de 03/11)

| Tela | O que dá para validar |
|---|---|
| Início | Pendências do dia, saldos, fluxo de caixa previsto (com provisões), próximos vencimentos |
| Contas a pagar | **Único lugar onde se paga** (K10). Abre no **dia** de hoje (K11); período dia/semana/mês/ano/tudo com navegação, abas rápidas por tipo (Todas · Planilhas e agrupados · Provisões · Do Connect), indicadores clicáveis, filtros, colunas, ordenação, rateio, recorrência simulada, baixa parcial/lote, estorno, Pix devolvido, autorização acima do orçamento, documentos, histórico. **Importar planilha** de folha de campo e de incentivos (cronograma por data; usa a **data de pagamento da planilha** quando ela traz, senão data da pesquisa + prazo do projeto, K12). **Provisões** com "Substituir pelo valor real" e "Atualizar do orçamento do Connect". Lançamento agrupado (planilha, incentivo ou Do Connect) abre na própria lista num **resumo compacto** (pessoas, pagos, total, NF pendente, anexos; sub-tabela com busca e rolagem; anexos em chips); a **conferência do PDF de comprovantes** (batem, divergentes, fora, sem chave, confirmar baixa) abre num diálogo. O código do projeto abre o relatório |
| Notas e RPA | Só o que não é pagamento: NF pendente (aviso, nunca bloqueia), lista de RPA com INSS de 11% para a contabilidade e conferência de notas do portal (cancelada, falta lançar). Folha, incentivos e provisões estão em Contas a pagar |
| Contas a receber | Bruto, retenções e líquido; parcelamento (30;70); recebimento com conta; inadimplência por cliente. **Filtros no mesmo padrão do Contas a pagar** (K13): período dia/semana/mês/ano/tudo, situação, cliente, projeto, empresa e busca, com indicadores que respeitam o filtro |
| Conferência do banco | Importar extrato (com pré-visualização e sem duplicar), extrato × sistema em duas colunas, sugestão de par, item a item do lançamento agrupado, volta do Pix, classificação para a contabilidade, exceção, diferença extrato × sistema, saldo do mês, fechamento do mês e planilha da contabilidade |
| Relatório do projeto | Antes "Entrevistadores"; agora é consulta, não é onde se paga. Orçamento, lançado, pago, a pagar, saldo, gasto total, lançamentos de Contas a pagar do projeto (clicáveis) e anexos de todos os lançamentos. Lista também as **provisões do projeto** (vêm de Contas a pagar) |
| Cadastros | Empresas e unidades, centros de custo, plano de contas com linha do DRE, fornecedores (CNPJ validado), clientes, contas bancárias, formas de pagamento, projetos (do Connect; com tipo, "tem incentivo" e prazo do incentivo em dias úteis, editáveis para testar), importação de teste do SGE4B |
| Auditoria | Quem fez o quê e quando |
| Validação | Respostas Sim/Não/Comentar de cada tela, regra e pergunta aberta; exporta CSV e copia resumo |

## Juntar as respostas de todo mundo (Netlify Forms)

Cada resposta de validação vai também para o **Netlify Forms** quando o site está publicado (abrindo o arquivo local, fica só no navegador).

1. No Netlify: **Project configuration → Forms → Enable form detection**.
2. Publique a pasta de novo (arraste em *Deploys*).
3. As respostas aparecem em **Forms → validacao**, com nome, tela, regra, resposta e comentário. Dá para exportar CSV e ligar aviso por e-mail.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `index.html` | Casca, menu e o formulário oculto do Netlify Forms |
| `app.css` | Tokens do Connect e componentes visuais |
| `dados.js` | Dados de exemplo, arquivos de extrato e perguntas abertas |
| `base.js` | Estado, formatação, rotas, diálogo, toast, paginação, validação |
| `dominio.js` | Regras: situação dos títulos, saldo, período fechado, orçamento, recorrência, RPA, auditoria |
| `telas/*.js` | Uma tela por arquivo. `comprovantes.js` e `planilhas.js` não são telas: guardam o painel do lançamento agrupado e a conferência do PDF, e a importação de planilhas e as provisões, usados por Contas a pagar; `notas.js` é a tela Notas e RPA; `projetos.js` é o relatório do projeto |
| `lucide.min.js` | Ícones (cópia local) |
