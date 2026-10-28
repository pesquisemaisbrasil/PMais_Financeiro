# Análise — Cadastros e migração para o P+ Financeiro

**Base:** exclusivamente `cadastros-e-dimensoes.md`, `papeis-e-escopo-ampliados.md`, `roadmap.md`, `visao-geral.md` e `perguntas-abertas.md`. Esta análise separa especificações, propostas e decisões pendentes; não usa o prompt antigo de protótipo como autorização para produto. Números fictícios daquele prompt não são dados reais. A solicitação atual é software funcional com entrega incremental, sob stack gerenciada React/Vite/Express/tRPC/Drizzle/MySQL aceita pelo usuário, sem autorização para decisões de produto, migração de dados reais, novos papéis, pagamento bancário ou integração simulada.

## Requisitos e comportamento descritos

- Dimensões: Empresa (CNPJ, razão social, nome fantasia) contém Unidade, que contém Centro de custo. Empresa, unidade, projeto e centro de custo são dimensões independentes em cada lançamento; projeto sugere unidade e centro de custo, mas é permitido alterar a sugestão.
- Plano de contas hierárquico: código, descrição, natureza receita/despesa e tipo sintético/analítico. Apenas conta analítica recebe lançamento e deve estar vinculada a uma linha ordenada do DRE. Cada rubrica aponta para conta analítica padrão.
- Fornecedor: apelido e nome obrigatórios segundo a ficha SGE4B; documento, razão social/fantasia, contato responsável, referências, telefones, e-mails, endereço, dados bancários/Pix, condição de pagamento, status e anexos. Tipos empresa ou pessoa. Cliente tem campos equivalentes, contatos de cobrança, condições comerciais e lista de projetos.
- Contrato: número, parte cliente/fornecedor, vigência, valor e anexo; lançamento o trata como opcional, pendente validação frente ao SGE4B.
- Pessoa de campo não é cadastrada no Financeiro: Connect é sistema de registro; Financeiro referencia `connect_interviewer_id` e só lê nome e chave mascarada via API. O sistema Financeiro não acessa banco/MinIO Connect.
- Listas precisam de pesquisa, filtros, ordenação, paginação configurável, impressão/exportação e indicação de últimos alterados. Importação CSV/XLSX requer prévia, erros por linha e confirmação explícita antes de gravar.
- Cadastro utilizado em lançamentos não pode ser excluído: deve ser inativado; não aparece em novos lançamentos, mas permanece em relatórios. Alteração de vínculo conta–linha DRE vale prospectivamente e não altera períodos encerrados.

## Campos, validações, estados e transições

- CPF/CNPJ com dígito verificador; unicidade descrita entre fornecedores ativos. CPF de fornecedor pessoa física: especificação sugere hash + quatro últimos dígitos, mas condiciona à validação DPO; exigência fiscal de CPF em claro para pagamento está em aberto. Telefone E.164 (`+55` + DDD + número), e-mail válido.
- Estados explícitos de cadastro: ativo/inativo. Transição para inativo preserva referência histórica e bloqueia seleção em novos lançamentos; exclusão de registro em uso resulta em conflito 409.
- Conta sintética no lançamento e conta analítica sem linha DRE são recusadas (422). Documento duplicado de fornecedor ativo, excluir cadastro com lançamentos, e tentativa de violar segregação especificada retornam 409; papel insuficiente 403, registro fora do escopo 404, validação de obrigatório 422.
- Importação: arquivo → pré-visualização/validação → correção ou confirmação → gravação; erros devem identificar linha e motivo. Exemplo de aceite exige 100 fornecedores, três linhas inválidas identificadas e gravação apenas após confirmação.
- Migração proposta em etapas com relatórios de conferência: (1) empresas, unidades, centros, plano e linhas DRE; (2) clientes, fornecedores e contratos com deduplicação documental; (3) projetos SGE4B + planilha de controle desde ago/2024 conciliados com ID Connect; (4) títulos em aberto, inclusive baixas parciais; (5) histórico de pagos/recebidos e fechamentos somente leitura. Critério: saldo em aberto por empresa e fornecedor/cliente bate 100% na data de corte; operação paralela até corte.

## Permissões e escopo

A especificação ampliada propõe usuário com papel e escopo de empresas/unidades e, opcionalmente, projetos; fora do escopo, respostas devem ocultar registro (404). Na matriz proposta, cadastro/dimensões: financeiro C/E/V; direção, gestora, comercial e auditor apenas leitura; supervisor sem acesso. Porém esses papéis ampliados não estão aprovados. Requisitos vigentes para a entrega inicial preservam autenticação e-mail/senha, MFA obrigatório e papéis `financeiro` e `admin`; não criar papéis novos sem decisão. Administração de usuários, contas de serviço e auditoria é atribuída ao admin na visão geral. Os detalhes de autorização devem ser implementados somente conforme decisão confirmada, sem inferir alçadas novas.

## Regras críticas e riscos

1. Não criar, importar ou migrar dados reais nesta etapa; exportação completa do SGE4B, levantamento das 11 bases e relatórios usados são pré-requisitos. O roadmap marca a migração como bloqueada pela exportação.
2. Não simular API do Connect nem assumir sua disponibilidade/contrato: referência de pessoa/projeto depende de API validada; baixa real fica bloqueada até validação da integração. Projeto novo vem do Connect, não deve ser recadastrado manualmente no Financeiro.
3. Não expor CPF completo nem chave Pix em telas; chave deve ser mascarada. A regra geral de visão geral diz CPF nunca aparece e existe apenas como hash no Connect; a ficha de fornecedor local exige revisão de privacidade/fiscal antes de definir tratamento documental.
4. Imutabilidade de período fechado para DRE e retenção histórica de cadastros inativados são necessárias à auditabilidade.
5. Não inferir novos papéis, escopos organizacionais, pagamento bancário ou permissões de exportação além das decisões autorizadas.

## Contradições e decisões abertas

- **Papéis:** matriz ampliada inclui direção, gestor de projeto, supervisor, comercial e auditor, mas visão geral diz supervisor não entra e demais papéis permanecem pendentes F11; perguntas abertas registra como situação atual somente financeiro/admin. Tratar matriz como proposta não aprovada.
- **Contrato:** spec de cadastro diz opcional no lançamento; observa que no SGE4B aparece obrigatório. Confirmar regra antes de impor validação.
- **Documento de pessoa física:** CPF hash + últimos quatro dígitos é sugestão sob validação DPO, enquanto perguntas abertas N3/D7 registram CPF/PIS-NIT para RPA e ausência de coleta no Connect. Não definir armazenamento ou disponibilização sem decisão DPO/contabilidade.
- **Multiempresa e escopo:** spec propõe escopo por empresa/unidade/projeto, mas F8 ainda requer identificar empresas/unidades e decidir segregação. Não criar matriz de acesso presumida.
- **Detalhes cadastrais:** campos completos da ficha SGE4B e referência são a validar; N3 está pendente, incluindo regime tributário e outros campos fiscais. Unicidade está especificada entre fornecedores ativos, mas não define regra para inativos, clientes ou compartilhamento entre os cadastros.
- **DRE/categorias:** quantidade e lista oficial de contas/categorias e vínculo com DRE e categorias de orçamento estão pendentes F3. Não cristalizar plano nem rubricas sem validação do financeiro/direção.
- **Cadastro de projeto:** spec de cadastros inclui projetos na migração, enquanto decisões registradas dizem projeto permanece no Connect e projeto novo não é cadastrado no Financeiro; migração e espelho devem respeitar essa fronteira e contrato ampliado N4.
- **Migração operacional:** falta exportação SGE4B e levantamento das 11 bases; sem eles não há mapeamento/transformação confiável nem validação de saldo. A execução real e corte ficam para etapa própria e autorizada.

## Dependências e recomendação de fase

Dependências: fundação do repositório; exportação integral SGE4B e reunião de levantamento; decisão de F3/F8/F11 e validações DPO/contabilidade; definição das empresas e escopos; contrato/API Connect validada quando referências a projeto/pessoa forem necessárias. Arquitetura final segue adaptação autorizada para stack gerenciada, sem alterar regras de produto.

**Fase recomendada para esta entrega:** fundação, design funcional, login por e-mail/senha com MFA obrigatório, contas e permissões existentes (`financeiro`/`admin`) e trilha de auditoria, com isolamento de dados e arquitetura pronta para evolução. A construção funcional de cadastros deve avançar somente com campos/regras aprovados; usar dados de demonstração identificados como fictícios apenas se necessários à interface e não como migração. CSV/XLSX e regras de validação podem ser desenvolvidos após definição dos esquemas. Migração real permanece fase posterior, bloqueada até exportação e autorização explícita; conectar/desbloquear baixa real somente após API Connect validada. O protótipo visual anterior é etapa de validação de telas do roadmap, não substitui nem amplia esta solicitação de software funcional incremental.
