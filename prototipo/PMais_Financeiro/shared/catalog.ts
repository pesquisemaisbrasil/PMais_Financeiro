export type ModuleGroup = "operacao" | "planejamento" | "analise";
export type Readiness = "integracao" | "decisao" | "dependencia";

export type ProductModule = {
  id: string;
  number: string;
  title: string;
  shortTitle: string;
  description: string;
  group: ModuleGroup;
  readiness: Readiness;
  prerequisite: string;
  flow: string[];
  safeguards: string[];
  capabilities: string[];
};

/** Product documentation only. No financial, personal or demonstration records. */
export const modules: ProductModule[] = [
  {
    id: "pagamentos", number: "01", title: "Pagamento de entrevistadores", shortTitle: "Pagamentos",
    description: "Do valor devido à comprovação do pagamento, com conferência e confirmação humana.",
    group: "operacao", readiness: "integracao", prerequisite: "API e contrato de integração do P+ Connect validados.",
    flow: ["Receber os itens elegíveis do Connect", "Preparar a planilha com acesso auditado", "Conferir os comprovantes e as divergências", "Confirmar a baixa pelo contrato idempotente"],
    safeguards: ["O comprovante não cria uma entrevista.", "O valor do Pix deve ser igual à soma exata dos itens.", "Divergências e duplicidades nunca geram baixa automática.", "A chave Pix completa não é mantida no Financeiro."],
    capabilities: ["Itens a pagar", "Planilha de pagamentos", "Conferência de comprovantes", "Baixa confirmada"],
  },
  {
    id: "cadastros", number: "02", title: "Cadastros e dimensões", shortTitle: "Cadastros",
    description: "Organização de fornecedores, clientes e dimensões que dão contexto aos lançamentos.",
    group: "operacao", readiness: "decisao", prerequisite: "Campos, categorias e política de dados aprovados; exportação do legado para migração.",
    flow: ["Definir os campos e as dimensões", "Validar as informações antes de importar", "Revisar erros e confirmar a gravação", "Preservar histórico e inativar cadastros"],
    safeguards: ["Cadastro com histórico não é excluído.", "Projetos e pessoas de campo têm origem no Connect.", "Dados pessoais exigem finalidade e política de proteção.", "Migração precisa de reconciliação e autorização."],
    capabilities: ["Fornecedores e clientes", "Categorias", "Centros de custo", "Preparação da migração"],
  },
  {
    id: "contas", number: "03", title: "Contas a pagar e a receber", shortTitle: "Contas a pagar e receber",
    description: "Controle de títulos, vencimentos e liquidações com histórico financeiro consistente.",
    group: "operacao", readiness: "dependencia", prerequisite: "Cadastros, dimensões e regras de baixa validados.",
    flow: ["Classificar o título e seus itens", "Conferir parcelas e rateios", "Acompanhar vencimentos e autorizações", "Registrar a baixa e preservar o histórico"],
    safeguards: ["Parcelas e rateios fecham exatamente ao total.", "Baixa efetivada é corrigida por estorno, não por edição.", "Títulos com baixa não podem ser excluídos.", "Períodos fechados não recebem alterações retroativas."],
    capabilities: ["Títulos e vencimentos", "Parcelas e rateios", "Recorrências", "Baixas e histórico"],
  },
  {
    id: "orcamento", number: "04", title: "Projetos e orçamento", shortTitle: "Projetos e orçamento",
    description: "Visão do orçamento, provisões e consumo por projeto, sem duplicar a fonte de origem.",
    group: "planejamento", readiness: "integracao", prerequisite: "Contrato de orçamento do Connect e autoridade do ciclo de vida definidos.",
    flow: ["Receber o orçamento do Connect", "Organizar provisões por categoria e data", "Acompanhar consumo e autorizações", "Conferir pendências antes do fechamento"],
    safeguards: ["O Connect permanece dono do orçamento.", "Provisão é previsão e nunca um pagamento.", "Excessos aplicáveis aguardam autorização auditada.", "Fechamento depende da resolução das pendências."],
    capabilities: ["Orçamento por categoria", "Provisões", "Consumo e limites", "Fechamento do projeto"],
  },
  {
    id: "folha", number: "05", title: "Folha e lotes de campo", shortTitle: "Folha de campo",
    description: "Ciclos de pagamento organizados por regras versionadas, documentação e aprovação.",
    group: "operacao", readiness: "decisao", prerequisite: "Regras de folha, alçadas e dependências dos módulos anteriores aprovadas.",
    flow: ["Aplicar a regra vigente aos itens", "Revisar exceções e documentação", "Aprovar a folha com rastreabilidade", "Conferir o lote e confirmar sua baixa"],
    safeguards: ["Folha aprovada é imutável.", "Exceções pendentes impedem o pagamento.", "Naturezas diferentes não são misturadas sem regra aprovada.", "Envio bancário depende de contrato e autorização específicos."],
    capabilities: ["Regras versionadas", "Folha por ciclo", "Tratamento de exceções", "Lotes de pagamento"],
  },
  {
    id: "conciliacao", number: "06", title: "Conciliação bancária", shortTitle: "Conciliação",
    description: "Conferência linha a linha entre extrato, itens e baixas para um fechamento confiável.",
    group: "operacao", readiness: "dependencia", prerequisite: "Títulos e baixas confiáveis; formatos e regras de conciliação aprovados.",
    flow: ["Validar e importar o extrato", "Revisar as sugestões de correspondência", "Classificar e confirmar cada linha", "Resolver diferenças e fechar o período"],
    safeguards: ["A transação importada permanece imutável.", "Reimportação não pode duplicar movimentações.", "Sugestão de correspondência não é confirmação.", "Desfazer uma conciliação exige motivo e auditoria."],
    capabilities: ["Importação de extrato", "Correspondência por item", "Diferenças e devoluções", "Fechamento do período"],
  },
  {
    id: "relatorios", number: "07", title: "Relatórios e fluxo de caixa", shortTitle: "Relatórios",
    description: "Dados reconciliados transformados em leitura financeira e apoio à decisão.",
    group: "analise", readiness: "dependencia", prerequisite: "Contas, orçamento e conciliação consistentes, com dimensões validadas.",
    flow: ["Selecionar período e dimensões", "Separar competência, previsão e realizado", "Conferir as linhas e seus totais", "Consultar ou exportar dentro do escopo permitido"],
    safeguards: ["Totais correspondem às linhas e filtros aplicados.", "O realizado usa a data da baixa; o previsto usa vencimento.", "Indicadores dependem de registros reais e reconciliados.", "Relatórios não exibem CPF nem chave Pix completa."],
    capabilities: ["Fluxo de caixa", "Resultado por projeto", "DRE e análises", "Exportações controladas"],
  },
];

export const groupLabels: Record<ModuleGroup, string> = {
  operacao: "Operação", planejamento: "Planejamento", analise: "Análise",
};

export const readinessLabels: Record<Readiness, string> = {
  integracao: "Aguarda integração", decisao: "Aguarda definição", dependencia: "Aguarda módulos anteriores",
};

export const securityRequirements = [
  { title: "Identidade e acesso", description: "Login próprio por e-mail e senha, MFA obrigatório e papéis definidos no servidor.", state: "Adiado • requer chaves" },
  { title: "Confirmação humana", description: "Nenhum pagamento ou baixa sem conferência e confirmação explícita.", state: "Regra preservada" },
  { title: "Dados mínimos", description: "Não copiar CPF ou chave Pix; não guardar PDF de comprovante sem política aprovada.", state: "Regra preservada" },
  { title: "Trilha de auditoria", description: "Histórico das operações e autorizações, com controle contra alteração ou exclusão.", state: "Adiada • requer acesso" },
  { title: "Separação do Connect", description: "Integração exclusiva por API, sem acesso ao banco ou ao armazenamento do Connect.", state: "Sem integração ativa" },
  { title: "Precisão financeira", description: "Valores decimais exatos, datas coerentes e totais derivados das mesmas linhas.", state: "Módulos futuros" },
];
