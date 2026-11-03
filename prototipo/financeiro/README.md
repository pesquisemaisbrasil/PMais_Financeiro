# Protótipo do Financeiro

HTML puro, sem build e sem servidor. **Abra `index.html` com dois cliques** ou publique a pasta inteira no Netlify (Netlify Drop).

Tudo é simulado e fictício: extrato, planilhas, PDF de comprovantes e notas do portal são **arquivos de exemplo dentro do protótipo**. Nada sai do computador. As ações ficam salvas no navegador; **Restaurar dados de exemplo** volta tudo ao começo.

## Telas (as 6 entregas do plano de 3 meses, ajustadas após o kickoff de 03/11)

| Tela | O que dá para validar |
|---|---|
| Início | Pendências do dia, saldos, fluxo de caixa previsto (com provisões), próximos vencimentos |
| Contas a pagar | Período (dia/semana/mês/ano), indicadores clicáveis, filtros, colunas, ordenação, rateio por valor, recorrência simulada (dia útil, estimada), baixa parcial/lote, estorno, Pix devolvido, autorização acima do orçamento, documentos, histórico. **Pagamento de entrevistadores chega do Connect como lançamento agrupado** (um por projeto e data de pagamento, etiqueta "Do Connect"); lançamento agrupado (entrevistadores e incentivos) **abre os itens na própria lista** (seta ao lado do nome) com planilha de pagamento, PDF de comprovantes (conferência: batem, divergentes, fora do lançamento), baixa por item, anexos e aviso "pagamento realizado" ao entrevistador. O código do projeto abre o relatório do projeto |
| Folha, incentivos e notas | Lançamento agrupado por planilha (NF, RPA com INSS de 11%, incentivo), lista de RPA, conferência de notas do portal (cancelada, falta lançar), provisões → valor real. **Importar planilha de incentivos**: lê a coluna "data da pesquisa", calcula o prazo em dias úteis do tipo de projeto (pulando feriados), mostra o cronograma e cria um lançamento por data de pagamento; botão "Copiar cronograma para o projeto" |
| Contas a receber | Bruto, retenções e líquido; parcelamento (30;70); recebimento com conta; inadimplência por cliente |
| Conferência do banco | Importar extrato (com pré-visualização e sem duplicar), extrato × sistema em duas colunas, sugestão de par, item a item do lançamento agrupado, volta do Pix, classificação para a contabilidade, exceção, diferença extrato × sistema, saldo do mês, fechamento do mês e planilha da contabilidade |
| Relatório do projeto | Antes "Entrevistadores"; agora é consulta, não é onde se paga. Orçamento, lançado, pago, a pagar, saldo, gasto total, lançamentos de Contas a pagar do projeto (clicáveis) e anexos de todos os lançamentos |
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
| `telas/*.js` | Uma tela por arquivo. `comprovantes.js` não é tela: guarda o painel de itens do lançamento agrupado (planilha de pagamento, PDF de comprovantes, conferência e baixa) usado por Contas a pagar; `projetos.js` é o relatório do projeto |
| `lucide.min.js` | Ícones (cópia local) |
