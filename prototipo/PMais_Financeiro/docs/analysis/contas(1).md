# P+ Financeiro — Contas a pagar e a receber

**Base analisada:** `contas-a-pagar.md`, `contas-a-receber.md`, `baixas-recorrencia-e-anexos.md`, `documentos-fiscais.md`, `roadmap.md`, `visao-geral.md` e `perguntas-abertas.md`. Análise restrita a esses arquivos; números de exemplos de aceite são ilustrativos, não dados reais.

## Síntese e enquadramento

O Módulo 3 cobre títulos a pagar e receber, rateios, lançamentos agrupados com itens, ações em lote, baixas, recorrência, anexos e documentos fiscais. No roadmap, o módulo tem especificações prontas, protótipo ainda por fazer e dependência do Módulo 2 (cadastros, papéis e migração). A visão geral propõe validar protótipo de telas e regras com a equipe antes de construir; isso não equivale à solicitação atual de software funcional. A entrega incremental agora proposta é fundação, design, login/MFA, contas/permissões e auditoria, deixando os módulos financeiros posteriores para fases seguintes.

A stack-alvo documentada pode ser adaptada para React/Vite/Express/tRPC/Drizzle/MySQL, conforme autorização. Isso não autoriza decisões de produto, migração de dados reais, novos papéis, pagamento bancário ou simulações de integração. Preservar login por e-mail/senha, MFA obrigatório e apenas os papéis `financeiro` e `admin` nesta etapa. A API do Connect não foi fornecida nem validada; qualquer baixa real dependente dela deve permanecer bloqueada até validação. Nenhum valor fictício de exemplo constitui saldo, lançamento ou dado de produção.

## Requisitos funcionais identificados

- **Painel/lista:** visões por dia, semana, mês, ano ou período, navegação, hoje e atualização; indicadores de total, pagos/recebidos, pendentes, vencidos/inadimplência, hoje, a vencer e provisões. Filtros combináveis por contraparte, projeto, categoria/plano, DRE, texto, empresa, unidade, centro de custo, forma, situação, tipo e datas (vencimento, competência ou baixa). Lista ordenável e com colunas escolhidas pelo usuário; ícones de ação devem ter legenda acessível por mouse e teclado.
- **Contas a pagar:** campos obrigatórios documentados: data, fornecedor, projeto ou rateio, categoria, centro de custo, forma de pagamento, valor, vencimento e descrição. Campos opcionais: observações, contrato, documento e competência. Seletores com busca e lista.
- **Rateio:** um lançamento pode distribuir valor entre projetos por linhas coladas de código e valor; cada projeto recebe sua parte na carteira. Validar existência dos projetos e soma exata antes de salvar.
- **Lançamento agrupado:** um título com itens por pessoa, importados de planilha anexada; itens têm pessoa, valor, tipo/status de documento fiscal. Soma dos itens deve fechar com o título. Internos fixos são lançamentos individuais. A escolha entre itens e títulos separados permanece registrada como pergunta N5, embora o estado atual seja “itens de um lançamento”.
- **Contas a receber:** classificação documentada com cliente, contrato, empresa, unidade, projeto, centro de custo e plano de contas; descrição, documento, valor, emissão, competência, vencimento e condição. Recebimentos totais/parciais por conta e forma, com nota, contrato, comprovante e cobrança anexáveis. Parcelas da receita devem fechar o valor; títulos alimentam receita vendida do projeto e diferença ante a ficha gera aviso. Lista de inadimplência exibe cliente, dias e total vencido.
- **Baixas:** múltiplas por título, parciais ou totais, com data, valor, conta bancária, forma, identificador/transação, documento, juros, multa, desconto, tarifa e observação. Histórico inclui origem e tipo (pagamento, recebimento, estorno). Baixa em lote usa a mesma data/conta/forma em cada título e respeita o saldo individual. Estorno é nova baixa negativa vinculada à original e exige motivo; registros originais permanecem visíveis.
- **Devolução Pix:** registrar devolução sem apagar a baixa original, restaurar pendente e marcar título devolvido; sinalizar correção da chave no Connect. Novo pagamento é uma nova baixa com a data real de saída.
- **Repetição/parcelamento:** configurar periodicidade, quantidade, valor e início; simular tabela de ocorrências editável antes de salvar. Edição permite “só esta”, “esta e as seguintes” ou “todas em aberto”; nunca altera ocorrência paga ou parcialmente paga pela série. Recorrência estimada substitui apenas a ocorrência corrente pelo valor real.
- **Documentos:** enviar, listar, baixar, renomear e excluir logicamente; cada operação auditável. Regras descritas incluem tipos aceitos, limite de 20 MB/50 por título (a validar), validação do tipo real e antivírus. Anexos separados por empresa, cifrados, com metadados, checksum e controle de acesso; download auditado.
- **Documentos fiscais:** distinguir NF, RPA, incentivo sem documento e notas de fornecedores; número e data de emissão separados da data de pagamento. NF de prestador condiciona inclusão/conciliação; RPA é calculado líquido com alíquota configurável e vigência. Nota de fornecedor tem estado válida/cancelada; cancelamento na origem gera alerta. Exportação contábil mensal deve informar dados do pagamento e documento.
- **Auditoria e autorização:** alterações de valor, vencimento, classificação e situação auditadas antes/depois. Ação em lote mostra quantidade e total, pede confirmação e grava auditoria por título. Título acima do orçamento fica pendente de autorização de admin; projeto fechado impede lançamento e mudança de valor.

## Estados e transições

- Situação do título é derivada, não digitada: `pago` (pendente zero), `parcial`, `vencido`, `hoje`, `a_vencer`, `devolvido`, `cancelado` e `pendente_autorizacao`.
- Pendente calculado: valor + juros + multa − desconto − baixas. Baixa parcial reduz saldo; baixa final zera e torna pago/recebido; estorno reverte o efeito mantendo ambas as linhas. Devolução Pix devolve o valor ao pendente e o pagamento posterior gera nova baixa.
- Provisão manual ou originada do orçamento pode ser substituída por título real, vinculando ambos e encerrando a provisão. Título de projeto alimenta comprometido ao lançamento e realizado na baixa.
- Série gera títulos/parcelas ligados; edição de série tem escopo explícito e não modifica ocorrências pagas/parciais. Cancelar uma ocorrência não altera as demais.
- Documentos têm operações de inclusão, renomeação, download e exclusão lógica, sob retenção e autorização. NF cancelada na fonte causa alerta, não remoção do histórico.

## Regras críticas e bloqueios já especificados

1. Valores monetários em Decimal; pendente sempre calculado; exceder saldo é conflito, salvo juros/multa declarados conforme regra.
2. Rateios e itens/parcelas devem somar exatamente o total; erro impede salvar. Projeto de rateio precisa existir.
3. Não excluir título com baixa/recebimento: estornar antes ou cancelar quando aplicável. Baixa salva é imutável; correção por estorno e nova baixa.
4. Baixa em período fechado bloqueada; baixa retroativa exige observação. Recebimento retroativo em período fechado também é bloqueado.
5. Não programar/pagar título pendente de autorização; não lançar nem alterar valor em projeto fechado.
6. Item de prestador NF exige número e data de emissão antes da conciliação. Pessoa cadastrada como NF sem nota não entra na planilha de pagamento. RPA tem desconto calculado, não digitado.
7. Retenção e acesso de documentos dependem do tipo: NF de entrevistador fica no Connect por seis meses e na rede empresarial por cinco anos; o Financeiro recebe status, não arquivo. Notas de fornecedores seguem guarda de cinco anos no cofre segundo estado atual da Q17. Não guardar PDF de comprovante Pix de entrevistador.
8. A fronteira Connect exige API: Financeiro não acessa banco/MinIO do Connect. Dados pessoais e arquivos sob acesso mínimo e downloads auditados.
9. MFA/login e permissões devem seguir o escopo autorizado; não criar papéis adicionais sem decisão.
10. Baixa real não deve ser habilitada enquanto contrato/API do Connect não for fornecido e validado; não presumir integração real com banco nem executar pagamento bancário.

## Decisões abertas, contradições e dependências

- **Dependência estrutural:** Módulo 3 depende do Módulo 2 (cadastros, dimensões, papéis e migração); roadmap também lista ações prévias de acesso/exportação SGE4B e atualização do contrato Connect. Na entrega inicial incremental proposta, não migrar dados reais.
- **Connect/API:** N4 exige ampliar contrato para orçamento datado, modelo fiscal/status NF, consumo orçamentário e prazo/fim de projeto. API não fornecida/validada: bloqueia qualquer função que dependa de leitura/escrita efetiva no Connect, inclusive estados fiscais externos e baixa integrada.
- **Decisões pendentes:** retenções na receita e existência de receita sem projeto; prazo/aviso de inadimplência; definição de feriado/dia útil e ajuste (spec deixa anterior/próximo em aberto, regra atual aponta próximo dia útil); limites de anexos “a validar”; retenções/teto INSS e campos cadastrais RPA/fornecedor; retenção documental de fornecedores (Q17); guarda de comprovantes de folha/incentivos (F6); categorias oficiais e vínculos contábeis; estrutura multiempresa e segregação (F8); N5; captura automática de NF (N2). Não resolver por implementação sem decisão.
- **Tensão de escopo temporal:** roadmap coloca Módulo 1 antes do 2 e do 3; visão geral prevê protótipo validado antes de cada módulo. A entrega agora especificada é fundação/login/permissões/auditoria, não protótipo visual antigo nem Módulo 3 completo. Tratar o prompt de protótipo como histórico de validação visual, não como autorização para números fictícios, dados reais ou funcionalidades bancárias.
- **Contradição de interface/ações:** excluir título é permitido apenas sem baixa; título com baixa exige estorno. Para receber, o caso negado permite “estorne antes de excluir ou cancele”, oferecendo alternativa de cancelamento não detalhada como fluxo/estado. Esclarecer sem ampliar comportamento por conta própria.
- **Contradição/ambiguidade documental:** regra de soma diz baixas ≤ devido, mas admite exceder com juros/multa declarados; não está definida precisamente a base/limite de validação. Resolver antes da implementação de liquidação.
- **Conflitos de retenção:** anexos genéricos descrevem cofre, 20 MB e até 50 por título, com política DPO; fiscais definem tratamento distinto para NF de entrevistador e notas de fornecedores. Aplicar as regras específicas fiscais e não generalizar seis meses a outros documentos sem decisão.
- **Fronteira da primeira fase:** fundação, design, autenticação com MFA, contas/permissões e auditoria são recomendados como base. O cadastro operacional, regras de títulos, rateio, lote, baixa, recorrência, anexos e fiscais ficam para fases posteriores; a dependência do Connect deve ser validada antes da fase que os ativa.

## Recomendação de fase

**Fase inicial:** entregar fundação do repositório e arquitetura adaptada autorizada, design e navegação base, login e-mail/senha com MFA obrigatório, papéis exclusivos `financeiro`/`admin`, controles de permissão e trilha de auditoria. Construir sem dados reais, sem integração simulada, sem novos papéis e sem capacidade de baixa real. Manter módulos financeiros não operacionais ou bloqueados até validação dos requisitos e dependências.

**Fases seguintes:** validar protótipo com financeiro; concluir cadastros/dimensões e decisões abertas; validar formalmente contrato/API do Connect; só então implementar títulos e fluxos em fatias testáveis, com ambiente de teste e sem dinheiro real até autorização explícita. Pagamento bancário/Itaú permanece fora até pesquisa e decisão N1.
