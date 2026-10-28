# Protótipo do Financeiro

HTML puro, sem build e sem servidor. **Abra `index.html` com dois cliques** ou publique a pasta inteira no Netlify (Netlify Drop).

Tudo é simulado e fictício: extrato, planilhas, PDF de comprovantes e notas do portal são **arquivos de exemplo dentro do protótipo**. Nada sai do computador. As ações ficam salvas no navegador; **Restaurar dados de exemplo** volta tudo ao começo.

## Telas (as 6 entregas do plano de 3 meses)

| Tela | O que dá para validar |
|---|---|
| Início | Pendências do dia, saldos, fluxo de caixa previsto (com provisões), próximos vencimentos |
| Entrevistadores | Planilha de pagamentos, PDF de comprovantes, conferência (batem, divergentes, fora do projeto), baixa. NF pendente só avisa |
| Contas a pagar | Período (dia/semana/mês/ano), indicadores clicáveis, filtros, colunas, ordenação, rateio por valor, recorrência simulada (dia útil, estimada), baixa parcial/lote, estorno, Pix devolvido, autorização acima do orçamento, documentos, histórico |
| Folha, incentivos e notas | Lançamento agrupado por planilha (NF, RPA com INSS de 11%, incentivo), lista de RPA, conferência de notas do portal (cancelada, falta lançar), provisões → valor real |
| Contas a receber | Bruto, retenções e líquido; parcelamento (30;70); recebimento com conta; inadimplência por cliente |
| Conferência do banco | Importar extrato (com pré-visualização e sem duplicar), extrato × sistema em duas colunas, sugestão de par, item a item do lançamento agrupado, volta do Pix, classificação para a contabilidade, exceção, diferença extrato × sistema, saldo do mês, fechamento do mês e planilha da contabilidade |
| Cadastros | Empresas e unidades, centros de custo, plano de contas com linha do DRE, fornecedores (CNPJ validado), clientes, contas bancárias, formas de pagamento, projetos (do Connect), importação de teste do SGE4B |
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
| `telas/*.js` | Uma tela por arquivo |
| `lucide.min.js` | Ícones (cópia local) |
