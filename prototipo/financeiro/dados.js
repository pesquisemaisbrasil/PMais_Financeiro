// Dados de exemplo, 100% fictícios. Dinheiro em centavos (inteiro), datas em "aaaa-mm-dd".
// "Hoje" do protótipo é fixo para os números não mudarem de um dia para o outro.
const HOJE = "2026-10-28";
const USUARIO = "Bruna";

// Monta um título a pagar com os campos padrão; cada exemplo só diz o que muda.
function tituloPagar(t) {
  return {
    tipo: "real", empresa: "pplus", unidade: 1, centroCusto: 2, fornecedor: null, favorecido: null, categoria: 6, forma: 1,
    data: "2026-10-01", competencia: "2026-10", descricao: "", vencimento: HOJE, valor: 0, rateio: [], codigoBarras: "",
    documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "" }, serie: null, transferencia: false,
    docsRecebidosEm: null, cancelado: false, autorizacao: null, substituidaPor: null, itemOrcamento: null,
    itens: null, anexos: [], baixas: [], observacao: "", ...t,
  };
}
function baixa(id, data, valor, conta = 1, forma = 1, extra = {}) {
  return { id, data, valor, conta, forma, tipo: "pagamento", motivo: "", origem: "Lançamento", ...extra };
}
function item(id, nome, doc, valor, extra = {}) {
  return { id, nome, doc, bruto: valor, valor, nf: null, nfStatus: null, pago: null, ...extra };
}

const DADOS_INICIAIS = {
  empresas: [
    { id: "pplus", nome: "PPlus", cnpjFinal: "0001-10" },
    { id: "mc", nome: "MC", cnpjFinal: "0001-20" },
    { id: "log", nome: "P Plus Log", cnpjFinal: "0001-30" },
    { id: "medtrek", nome: "Medtrek", cnpjFinal: "0001-40" },
  ],
  unidades: [
    { id: 1, empresa: "pplus", nome: "Consumo SP", ativo: true },
    { id: 2, empresa: "pplus", nome: "CATI Curitiba", ativo: true },
    { id: 3, empresa: "pplus", nome: "Health", ativo: true },
    { id: 4, empresa: "mc", nome: "Matriz", ativo: true },
    { id: 5, empresa: "log", nome: "Logística", ativo: true },
    { id: 6, empresa: "medtrek", nome: "Medtrek", ativo: true },
  ],
  centrosCusto: [
    { id: 1, nome: "Campo", ativo: true },
    { id: 2, nome: "Administrativo", ativo: true },
    { id: 3, nome: "Comercial", ativo: true },
    { id: 4, nome: "Tecnologia", ativo: true },
  ],
  linhasDre: [
    { id: 1, nome: "Receita bruta" },
    { id: 2, nome: "Deduções e retenções" },
    { id: 3, nome: "Custos diretos de campo" },
    { id: 4, nome: "Despesas operacionais" },
    { id: 5, nome: "Resultado financeiro" },
  ],
  gruposContas: [
    { codigo: "1", nome: "Receitas" },
    { codigo: "2", nome: "Custos de campo" },
    { codigo: "3", nome: "Despesas operacionais" },
    { codigo: "4", nome: "Financeiro" },
  ],
  // Plano de contas: só conta analítica recebe lançamento; cada uma aponta para uma linha do DRE.
  categorias: [
    { id: 1, codigo: "2.01", nome: "Pessoal de campo", grupo: "2", tipo: "Despesa", dre: 3, ativo: true },
    { id: 2, codigo: "2.02", nome: "Incentivos", grupo: "2", tipo: "Despesa", dre: 3, ativo: true },
    { id: 3, codigo: "2.03", nome: "Viagens e deslocamento", grupo: "2", tipo: "Despesa", dre: 3, ativo: true },
    { id: 8, codigo: "2.04", nome: "Material e gráfica", grupo: "2", tipo: "Despesa", dre: 3, ativo: true },
    { id: 4, codigo: "3.01", nome: "Aluguel e condomínio", grupo: "3", tipo: "Despesa", dre: 4, ativo: true },
    { id: 5, codigo: "3.02", nome: "Energia e telefonia", grupo: "3", tipo: "Despesa", dre: 4, ativo: true },
    { id: 6, codigo: "3.03", nome: "Serviços de terceiros", grupo: "3", tipo: "Despesa", dre: 4, ativo: true },
    { id: 7, codigo: "3.04", nome: "Software", grupo: "3", tipo: "Despesa", dre: 4, ativo: true },
    { id: 12, codigo: "3.05", nome: "Impostos e taxas", grupo: "3", tipo: "Despesa", dre: 4, ativo: true },
    { id: 9, codigo: "4.01", nome: "Tarifas bancárias", grupo: "4", tipo: "Despesa", dre: 5, ativo: true },
    { id: 11, codigo: "4.02", nome: "Rendimentos de aplicação", grupo: "4", tipo: "Receita", dre: 5, ativo: true },
    { id: 10, codigo: "1.01", nome: "Receita de pesquisa", grupo: "1", tipo: "Receita", dre: 1, ativo: true },
  ],
  formasPagamento: [
    { id: 1, nome: "Pix", ativo: true },
    { id: 2, nome: "Boleto", ativo: true },
    { id: 3, nome: "TED", ativo: true },
    { id: 4, nome: "Débito em conta", ativo: true },
    { id: 5, nome: "Cartão de crédito", ativo: true },
    { id: 6, nome: "Dinheiro", ativo: true },
  ],

  fornecedores: [
    { id: 1, apelido: "Batel", nome: "Imóveis Batel Administradora", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-55", contato: "Marta", telefone: "+55 41 3333-1000", email: "financeiro@batel.exemplo", pix: "fin***@batel.exemplo", condicao: "Dia 5", ativo: true },
    { id: 2, apelido: "Luz & Força", nome: "Luz & Força Distribuidora", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-01", contato: "Atendimento", telefone: "+55 41 0800-0000", email: "atendimento@luzforca.exemplo", pix: "", condicao: "Débito automático", ativo: true },
    { id: 3, apelido: "Conecta", nome: "Telefonia Conecta", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-77", contato: "Empresas", telefone: "+55 11 4000-0000", email: "empresas@conecta.exemplo", pix: "", condicao: "Boleto", ativo: true },
    { id: 4, apelido: "Ponto Certo", nome: "Gráfica Ponto Certo", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-32", contato: "Rui", telefone: "+55 41 3333-0000", email: "rui@pontocerto.exemplo", pix: "413***00", condicao: "28 dias", ativo: true },
    { id: 5, apelido: "Exata", nome: "Contabilidade Exata", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-90", contato: "Sônia", telefone: "+55 41 3222-9000", email: "contato@exata.exemplo", pix: "con***@exata.exemplo", condicao: "Dia 30", ativo: true },
    { id: 6, apelido: "Hotel Central", nome: "Hotel Central Curitiba", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-44", contato: "Reservas", telefone: "+55 41 3111-2222", email: "reservas@hotelcentral.exemplo", pix: "", condicao: "Cartão", ativo: true },
    { id: 7, apelido: "Rápida Sul", nome: "Viação Rápida Sul", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-66", contato: "Vendas", telefone: "+55 41 3222-1111", email: "vendas@rapidasul.exemplo", pix: "vem***@rapidasul.exemplo", condicao: "À vista", ativo: true },
    { id: 8, apelido: "Nuvem", nome: "Software Nuvem Ltda", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-88", contato: "Cobrança", telefone: "+55 11 3000-0000", email: "cobranca@nuvem.exemplo", pix: "", condicao: "Dia 10", ativo: true },
    { id: 9, apelido: "Papelaria", nome: "Papelaria Antiga", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-11", contato: "—", telefone: "", email: "", pix: "", condicao: "", ativo: false },
    { id: 10, apelido: "Henrique", nome: "Henrique Alves (supervisor)", pessoa: "Pessoa", documento: "CPF", docFinal: "**-21", contato: "Henrique", telefone: "+55 11 90000-5678", email: "henrique@email.exemplo", pix: "+55 11 9****-5678", condicao: "Por diária", ativo: true },
    { id: 11, apelido: "Guias", nome: "Guias de impostos (contabilidade)", pessoa: "Empresa", documento: "CNPJ", docFinal: "—", contato: "Contabilidade Exata", telefone: "", email: "", pix: "", condicao: "Vencimento da guia", ativo: true },
  ],

  clientes: [
    { id: 1, apelido: "Horizonte", nome: "Banco Horizonte", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-01", contato: "Compras", telefone: "+55 11 4000-1000", email: "compras@horizonte.exemplo", pix: "", condicao: "30 dias", ativo: true },
    { id: 2, apelido: "Bom Preço", nome: "Supermercados Bom Preço", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-02", contato: "Pesquisa", telefone: "+55 41 3000-2000", email: "pesquisa@bompreco.exemplo", pix: "", condicao: "30 dias", ativo: true },
    { id: 3, apelido: "Vida Saudável", nome: "Instituto Vida Saudável", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-03", contato: "Projetos", telefone: "+55 11 3000-3000", email: "projetos@vidasaudavel.exemplo", pix: "", condicao: "30 dias", ativo: true },
    { id: 4, apelido: "Serra Alta", nome: "Cervejaria Serra Alta", pessoa: "Empresa", documento: "CNPJ", docFinal: "0001-04", contato: "Marketing", telefone: "+55 47 3000-4000", email: "marketing@serraalta.exemplo", pix: "", condicao: "30% na aprovação, 70% na entrega", ativo: true },
  ],

  contasBancarias: [
    { id: 1, nome: "Itaú · PPlus", banco: "Itaú", agencia: "0000", conta: "12345-6", tipo: "Corrente", empresa: "pplus", saldoInicial: 8500000, dataSaldo: "2026-09-30", ativo: true },
    { id: 2, nome: "Bradesco · MC", banco: "Bradesco", agencia: "1111", conta: "98765-4", tipo: "Corrente", empresa: "mc", saldoInicial: 2240000, dataSaldo: "2026-09-30", ativo: true },
  ],

  // Projetos vêm do P+ Connect (o Financeiro só lê). "orcamento" é o teto de entrevistas;
  // "itens" é o orçamento por itens, com data estimada, que vira provisão.
  projetos: [
    { id: 1804, titulo: "Hábitos de consumo · Curitiba", cliente: 2, unidade: 2, situacao: "Ativo", orcamento: 70000, prazoPagamento: 30,
      itens: [{ item: "Deslocamento", categoria: 3, valor: 180000, data: "2026-11-10" }, { item: "Gráfica", categoria: 8, valor: 130000, data: "2026-10-28" }] },
    { id: 1790, titulo: "Satisfação de clientes · Banco Horizonte", cliente: 1, unidade: 1, situacao: "Ativo", orcamento: 300000, prazoPagamento: 30,
      itens: [{ item: "Supervisão de campo", categoria: 1, valor: 600000, data: "2026-11-05" }, { item: "Viagens", categoria: 3, valor: 200000, data: "2026-11-05" }] },
    { id: 1811, titulo: "Saúde e bem-estar 2026", cliente: 3, unidade: 3, situacao: "Pausado", orcamento: 120000, prazoPagamento: 15,
      itens: [{ item: "Incentivos", categoria: 2, valor: 240000, data: "2026-11-20" }] },
    { id: 1820, titulo: "Teste de embalagem · Serra Alta", cliente: 4, unidade: 1, situacao: "Ativo", orcamento: null, prazoPagamento: 30, itens: [] },
    { id: 1752, titulo: "Recall de marca · 1º semestre", cliente: 4, unidade: 1, situacao: "Encerrado", orcamento: 90000, prazoPagamento: 30, itens: [] },
  ],

  // Pessoas de campo (vêm do Connect). Sem CPF; chave Pix sempre mascarada. "modelo": como recebe (NF ou RPA).
  pessoas: [
    { id: 1, nome: "Ana Ribeiro", modelo: "NF", chave: "ana***@email.com", chaveCompleta: "ana.ribeiro@email.exemplo" },
    { id: 2, nome: "Bruno Lima", modelo: "NF", chave: "+55 41 9****-1234", chaveCompleta: "+5541900001234" },
    { id: 3, nome: "Carla Mendes", modelo: "RPA", chave: "car***@email.com", chaveCompleta: "carla.mendes@email.exemplo" },
    { id: 4, nome: "Diego Rocha", modelo: "NF", chave: "413***88", chaveCompleta: "41300000088" },
    { id: 5, nome: "Elisa Prado", modelo: "NF", chave: null, chaveCompleta: null },
    { id: 6, nome: "Fábio Nunes", modelo: "RPA", chave: "fab***@email.com", chaveCompleta: "fabio.nunes@email.exemplo" },
    { id: 7, nome: "Gabriela Torres", modelo: "RPA", chave: "gab***@email.com", chaveCompleta: "gabriela.t@email.exemplo" },
    { id: 8, nome: "Henrique Alves", modelo: "NF", chave: "+55 11 9****-5678", chaveCompleta: "+5511900005678" },
  ],

  // Entrevistas lançadas no Connect, por projeto e pessoa. "nf": situação da nota no Connect (não bloqueia o pagamento).
  entrevistas: [
    { projeto: 1804, pessoa: 1, lancadas: 6, pagas: 2, valor: 2000, nf: "Recebida" },
    { projeto: 1804, pessoa: 2, lancadas: 5, pagas: 0, valor: 2000, nf: "Pendente" },
    { projeto: 1804, pessoa: 3, lancadas: 4, pagas: 0, valor: 2000, nf: null },
    { projeto: 1804, pessoa: 5, lancadas: 3, pagas: 0, valor: 2000, nf: "Pendente" },
    { projeto: 1804, pessoa: 6, lancadas: 10, pagas: 10, valor: 2000, nf: null },
    { projeto: 1790, pessoa: 4, lancadas: 40, pagas: 25, valor: 4500, nf: "Recebida" },
    { projeto: 1790, pessoa: 7, lancadas: 22, pagas: 22, valor: 4500, nf: null },
    { projeto: 1790, pessoa: 8, lancadas: 18, pagas: 6, valor: 4500, nf: "Pendente" },
    { projeto: 1811, pessoa: 7, lancadas: 12, pagas: 12, valor: 3500, nf: null },
    { projeto: 1820, pessoa: 1, lancadas: 8, pagas: 0, valor: 2500, nf: "Pendente" },
    { projeto: 1752, pessoa: 2, lancadas: 30, pagas: 30, valor: 3000, nf: "Recebida" },
  ],

  // Comprovantes Pix que o "PDF do Itaú" de exemplo traz para o PRJ-1804.
  pdfExemplo: [
    { pessoa: 1, valor: 8000, data: "2026-10-27", pagina: 1 },
    { pessoa: 2, valor: 10000, data: "2026-10-27", pagina: 2 },
    { pessoa: 3, valor: 10000, data: "2026-10-27", pagina: 3 },
    { pessoa: 4, valor: 4000, data: "2026-10-27", pagina: 4 },
    { pessoa: 5, valor: 6000, data: "2026-10-27", pagina: 5 },
  ],
  envios: [
    { id: 1, projeto: 1804, data: "2026-10-10", situacao: "Confirmado", comprovantes: 2, fora: 0, totalPago: 24000 },
  ],
  // Pagamentos de entrevistador já baixados por comprovante (casam com o extrato).
  pagamentosCampo: [
    { id: 1, pessoa: 1, projeto: 1804, valor: 4000, data: "2026-10-09", conta: 1 },
    { id: 2, pessoa: 6, projeto: 1804, valor: 20000, data: "2026-10-09", conta: 1 },
  ],

  contasPagar: [
    tituloPagar({ id: 1, fornecedor: 1, categoria: 4, forma: 2, descricao: "Aluguel do escritório · outubro", vencimento: "2026-10-05", valor: 450000, documento: { tipo: "Boleto", numero: "", emissao: "", motivo: "" }, serie: { id: 1, n: 10, total: 12, tipo: "Mensal" }, baixas: [baixa(1, "2026-10-05", 450000, 1, 2)] }),
    tituloPagar({ id: 2, fornecedor: 2, categoria: 5, forma: 4, descricao: "Energia · outubro", vencimento: "2026-10-20", valor: 16340, serie: { id: 2, n: 10, total: 12, tipo: "Estimada", estimado: 15000 }, documento: { tipo: "Fatura", numero: "889122", emissao: "2026-10-05", motivo: "" }, baixas: [baixa(2, "2026-10-20", 16340, 1, 4)] }),
    tituloPagar({ id: 15, fornecedor: 2, categoria: 5, forma: 4, descricao: "Energia · novembro (estimada)", vencimento: "2026-11-20", valor: 15000, competencia: "2026-11", serie: { id: 2, n: 11, total: 12, tipo: "Estimada", estimado: 15000 } }),
    tituloPagar({ id: 16, fornecedor: 2, categoria: 5, forma: 4, descricao: "Energia · dezembro (estimada)", vencimento: "2026-12-20", valor: 15000, competencia: "2026-12", serie: { id: 2, n: 12, total: 12, tipo: "Estimada", estimado: 15000 } }),
    tituloPagar({ id: 3, fornecedor: 3, categoria: 5, forma: 2, descricao: "Telefonia e internet · outubro", vencimento: "2026-10-25", valor: 38990, codigoBarras: "34191.79001 01043.510047 91020.150008 1 96100000038990", documento: { tipo: "Boleto", numero: "", emissao: "", motivo: "" }, serie: { id: 3, n: 10, total: 12, tipo: "Mensal" } }),
    tituloPagar({ id: 4, unidade: 2, centroCusto: 1, fornecedor: 4, categoria: 8, forma: 2, descricao: "Impressão de questionários", vencimento: "2026-10-28", valor: 125000, rateio: [{ projeto: 1804, valor: 125000 }], codigoBarras: "23793.38128 60000.000003 00000.000400 1 96200000125000", documento: { tipo: "NF", numero: "4521", emissao: "2026-10-20", motivo: "" }, docsRecebidosEm: "2026-10-27", itemOrcamento: { projeto: 1804, item: "Gráfica" } }),
    tituloPagar({ id: 5, fornecedor: 5, categoria: 6, forma: 1, descricao: "Honorários contábeis · outubro", vencimento: "2026-10-30", valor: 280000, documento: { tipo: "NF", numero: "1203", emissao: "2026-10-26", motivo: "" }, serie: { id: 4, n: 10, total: 12, tipo: "Mensal" } }),
    tituloPagar({ id: 6, unidade: 2, centroCusto: 1, fornecedor: 6, categoria: 3, forma: 5, descricao: "Hospedagem da equipe de campo", vencimento: "2026-11-03", valor: 198000, rateio: [{ projeto: 1804, valor: 118800 }, { projeto: 1790, valor: 79200 }], documento: { tipo: "NF", numero: "889", emissao: "2026-10-18", motivo: "" } }),
    tituloPagar({ id: 7, centroCusto: 1, fornecedor: 7, categoria: 3, forma: 1, descricao: "Passagens de ônibus · campo", vencimento: "2026-11-05", valor: 64000, rateio: [{ projeto: 1790, valor: 64000 }], documento: { tipo: "Recibo", numero: "", emissao: "", motivo: "" }, baixas: [baixa(3, "2026-10-22", 32000)] }),
    tituloPagar({ id: 8, centroCusto: 4, fornecedor: 8, categoria: 7, forma: 5, descricao: "Licenças de software", vencimento: "2026-11-10", valor: 89900, serie: { id: 5, n: 10, total: 12, tipo: "Mensal" } }),
    tituloPagar({ id: 9, empresa: "mc", unidade: 4, fornecedor: 4, categoria: 8, forma: 2, descricao: "Banners para evento", vencimento: "2026-10-15", valor: 48000, documento: { tipo: "NF", numero: "4470", emissao: "2026-10-08", motivo: "" }, baixas: [baixa(4, "2026-10-15", 48000, 2, 2)] }),
    tituloPagar({ id: 10, empresa: "mc", unidade: 4, fornecedor: 1, categoria: 4, forma: 2, descricao: "Aluguel da sala de grupo · novembro", vencimento: "2026-11-12", valor: 210000, competencia: "2026-11", serie: { id: 6, n: 11, total: 12, tipo: "Mensal" } }),
    tituloPagar({ id: 11, unidade: 1, centroCusto: 1, fornecedor: 10, categoria: 1, forma: 1, descricao: "Diária de supervisão · 13/10", vencimento: "2026-10-14", valor: 15000, rateio: [{ projeto: 1790, valor: 15000 }], documento: { tipo: "NF", numero: "230", emissao: "2026-10-13", motivo: "" }, baixas: [baixa(5, "2026-10-14", 15000)] }),
    tituloPagar({ id: 12, unidade: 2, centroCusto: 1, favorecido: "14 entrevistados", categoria: 2, forma: 1, descricao: "Incentivos aos entrevistados · outubro", vencimento: "2026-10-31", valor: 280000, rateio: [{ projeto: 1804, valor: 280000 }],
      documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Incentivo" }, anexos: [{ id: 1, nome: "incentivos-outubro-PRJ-1804.xlsx", tipo: "Planilha", excluido: false }],
      itens: Array.from({ length: 14 }, (_, i) => item(i + 1, `Entrevistado ${String(i + 1).padStart(2, "0")}`, "Incentivo", 20000)) }),
    tituloPagar({ id: 13, unidade: 1, centroCusto: 1, favorecido: "Equipe de campo (10 pessoas)", categoria: 1, forma: 1, descricao: "Equipe de campo · PRJ-1790 · outubro", vencimento: "2026-11-05", valor: 580000, rateio: [{ projeto: 1790, valor: 580000 }],
      documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Ver itens" }, docsRecebidosEm: "2026-10-26",
      anexos: [{ id: 1, nome: "folha-PRJ-1790-outubro.xlsx", tipo: "Planilha", excluido: false }],
      itens: [
        item(1, "Gabriela Torres", "RPA", 89000, { bruto: 100000 }),
        item(2, "Fábio Nunes", "RPA", 71200, { bruto: 80000 }),
        item(3, "Diego Rocha", "NF", 149800, { nf: { numero: "101", emissao: "2026-10-20" }, nfStatus: "Recebida" }),
        item(4, "Ana Ribeiro", "NF", 50000, { nf: { numero: "55", emissao: "2026-10-21" }, nfStatus: "Recebida" }),
        item(5, "Bruno Lima", "NF", 50000, { nf: { numero: "77", emissao: "2026-10-22" }, nfStatus: "Recebida" }),
        item(6, "Henrique Alves", "NF", 50000, { nf: { numero: "231", emissao: "2026-10-22" }, nfStatus: "Recebida" }),
        item(7, "Carla Mendes", "NF", 50000, { nf: { numero: "12", emissao: "2026-10-23" }, nfStatus: "Recebida" }),
        item(8, "Elisa Prado", "NF", 50000, { nfStatus: "Pendente" }),
        item(9, "Respondente 01", "Incentivo", 10000),
        item(10, "Respondente 02", "Incentivo", 10000),
      ] }),
    tituloPagar({ id: 14, fornecedor: 11, categoria: 12, forma: 2, descricao: "ISS e PIS/Cofins · outubro (guia da contabilidade)", vencimento: "2026-11-20", valor: 325000, codigoBarras: "85800000032 5 50000001234 5 20261120001 1 00000000000 0", documento: { tipo: "Boleto", numero: "", emissao: "", motivo: "" } }),
    // Provisões: nascem do orçamento por itens do Connect, com a data estimada de pagamento.
    tituloPagar({ id: 20, tipo: "provisao", unidade: 1, centroCusto: 1, favorecido: "Provisão", categoria: 1, forma: 1, descricao: "Supervisão de campo · PRJ-1790", vencimento: "2026-11-05", valor: 600000, rateio: [{ projeto: 1790, valor: 600000 }], itemOrcamento: { projeto: 1790, item: "Supervisão de campo" } }),
    tituloPagar({ id: 21, tipo: "provisao", unidade: 2, centroCusto: 1, favorecido: "Provisão", categoria: 3, forma: 1, descricao: "Deslocamento · PRJ-1804", vencimento: "2026-11-10", valor: 180000, rateio: [{ projeto: 1804, valor: 180000 }], itemOrcamento: { projeto: 1804, item: "Deslocamento" } }),
    tituloPagar({ id: 22, tipo: "provisao", unidade: 3, centroCusto: 1, favorecido: "Provisão", categoria: 2, forma: 1, descricao: "Incentivos · PRJ-1811", vencimento: "2026-11-20", valor: 240000, rateio: [{ projeto: 1811, valor: 240000 }], itemOrcamento: { projeto: 1811, item: "Incentivos" } }),
  ],

  contasReceber: [
    { id: 1, empresa: "pplus", unidade: 1, centroCusto: 3, cliente: 1, projeto: 1790, categoria: 10, nf: "2026/118", dataNf: "2026-10-01", competencia: "2026-10", descricao: "Pesquisa de satisfação · entrega final", bruto: 4800000, abatimentos: 295200, vencimento: "2026-10-31", serie: null, anexos: [{ id: 1, nome: "NF-2026-118.pdf", tipo: "Nota", excluido: false }], recebimentos: [] },
    { id: 2, empresa: "pplus", unidade: 2, centroCusto: 3, cliente: 2, projeto: 1804, categoria: 10, nf: "2026/112", dataNf: "2026-09-15", competencia: "2026-09", descricao: "Hábitos de consumo · 1ª parcela", bruto: 3000000, abatimentos: 45000, vencimento: "2026-10-15", serie: null, anexos: [], recebimentos: [{ id: 1, data: "2026-10-16", valor: 2955000, conta: 1, forma: 3, tipo: "recebimento", origem: "Lançamento" }] },
    { id: 3, empresa: "pplus", unidade: 3, centroCusto: 3, cliente: 3, projeto: 1811, categoria: 10, nf: "2026/121", dataNf: "2026-10-20", competencia: "2026-10", descricao: "Saúde e bem-estar · etapa 1", bruto: 1800000, abatimentos: 0, vencimento: "2026-11-20", serie: null, anexos: [], recebimentos: [] },
    { id: 4, empresa: "mc", unidade: 4, centroCusto: 3, cliente: 4, projeto: 1752, categoria: 10, nf: "2026/097", dataNf: "2026-08-25", competencia: "2026-08", descricao: "Recall de marca · entrega", bruto: 2200000, abatimentos: 33000, vencimento: "2026-10-10", serie: null, anexos: [], recebimentos: [] },
    { id: 5, empresa: "pplus", unidade: 1, centroCusto: 3, cliente: 4, projeto: 1820, categoria: 10, nf: "2026/125", dataNf: "2026-09-20", competencia: "2026-09", descricao: "Teste de embalagem · 30% na aprovação", bruto: 600000, abatimentos: 9000, vencimento: "2026-10-20", serie: { id: 1, n: 1, total: 2 }, anexos: [], recebimentos: [] },
    { id: 6, empresa: "pplus", unidade: 1, centroCusto: 3, cliente: 4, projeto: 1820, categoria: 10, nf: "", dataNf: "", competencia: "2026-11", descricao: "Teste de embalagem · 70% na entrega", bruto: 1400000, abatimentos: 0, vencimento: "2026-11-30", serie: { id: 1, n: 2, total: 2 }, anexos: [], recebimentos: [] },
  ],

  // Extrato já importado (Bradesco). O do Itaú de outubro chega pelo botão "Importar extrato".
  extrato: [
    { id: 1, conta: 2, fitid: "BRA-0915", data: "2026-10-15", descricao: "BOLETO GRAFICA PONTO CERTO", valor: -48000, par: null, classe: null, excecao: null },
    { id: 2, conta: 2, fitid: "BRA-0920", data: "2026-10-20", descricao: "TARIFA MANUTENCAO CONTA", valor: -3500, par: null, classe: null, excecao: null },
  ],
  importacoes: [
    { id: 1, conta: 2, arquivo: "extrato-bradesco-mc-2026-10.csv", data: "2026-10-21", linhas: 2, novas: 2 },
  ],

  // Meses fechados por empresa. Setembro já foi fechado.
  fechamentos: [
    { empresa: "pplus", mes: "2026-09", em: "2026-10-05", por: "Bruna" },
    { empresa: "mc", mes: "2026-09", em: "2026-10-05", por: "Bruna" },
  ],

  auditoria: [
    { quando: "2026-10-05 09:12", quem: "Bruna", alvo: "fechamento", texto: "Fechou setembro/2026 da PPlus e da MC" },
  ],
};

// Arquivos de extrato que a pessoa pode "importar" no protótipo (nada sai do computador).
const ARQUIVOS_EXTRATO = [
  {
    nome: "extrato-itau-pplus-2026-10.ofx", conta: 1, formato: "OFX",
    linhas: [
      ["ITA-1005", "2026-10-05", "PIX ENVIADO IMOVEIS BATEL", -450000],
      ["ITA-1009A", "2026-10-09", "PIX ENVIADO ANA RIBEIRO", -4000],
      ["ITA-1009B", "2026-10-09", "PIX ENVIADO FABIO NUNES", -20000],
      ["ITA-1014", "2026-10-14", "PIX ENVIADO HENRIQUE ALVES", -15000],
      ["ITA-1015", "2026-10-15", "PIX DEVOLVIDO HENRIQUE ALVES", 15000],
      ["ITA-1016A", "2026-10-16", "TED RECEBIDA SUPERMERCADOS BOM PRECO", 2955000],
      ["ITA-1016B", "2026-10-16", "PIX ENVIADO HENRIQUE ALVES", -15000],
      ["ITA-1020", "2026-10-20", "DEB AUTOMATICO LUZ FORCA", -16340],
      ["ITA-1022", "2026-10-22", "PIX ENVIADO VIACAO RAPIDA SUL", -32000],
      ["ITA-1023", "2026-10-23", "TARIFA PACOTE DE SERVICOS", -8990],
      ["ITA-1024A", "2026-10-24", "PIX ENVIADO ENTREVISTADO 01", -20000],
      ["ITA-1024B", "2026-10-24", "PIX ENVIADO ENTREVISTADO 02", -20000],
      ["ITA-1024C", "2026-10-24", "PIX ENVIADO ENTREVISTADO 03", -20000],
      ["ITA-1024D", "2026-10-24", "PIX ENVIADO ENTREVISTADO 04", -20000],
      ["ITA-1024E", "2026-10-24", "PIX ENVIADO ENTREVISTADO 05", -20000],
      ["ITA-1026", "2026-10-26", "PIX RECEBIDO SEM IDENTIFICACAO", 150000],
      ["ITA-1027A", "2026-10-27", "PAGTO BOLETO TELEFONIA CONECTA", -38990],
      ["ITA-1027B", "2026-10-27", "PIX ENVIADO ANA RIBEIRO", -8000],
      ["ITA-1027C", "2026-10-27", "PIX ENVIADO BRUNO LIMA", -10000],
      ["ITA-1027D", "2026-10-27", "PIX ENVIADO CARLA MENDES", -10000],
      ["ITA-1028", "2026-10-28", "RENDIMENTO APLICACAO AUTOMATICA", 4532],
    ],
  },
  {
    nome: "extrato-bradesco-mc-2026-10.csv", conta: 2, formato: "CSV",
    linhas: [
      ["BRA-0915", "2026-10-15", "BOLETO GRAFICA PONTO CERTO", -48000],
      ["BRA-0920", "2026-10-20", "TARIFA MANUTENCAO CONTA", -3500],
    ],
  },
];

// Classificação que a contabilidade pede para cada linha do extrato.
const CLASSES_EXTRATO = [
  "Pagamento com NF", "RPA", "Sem NF", "Incentivo", "Pagamento de entrevistador", "Adiantamento", "Reembolso",
  "Tarifa", "Transferência", "Devolução (volta)", "Recebimento de cliente", "Rendimento", "Outro",
];

// Perguntas que o financeiro precisa responder (docs/planning/perguntas-abertas.md).
const PERGUNTAS_ABERTAS = [
  { id: "Q4", texto: "Cancelar uma baixa (estorno do banco, baixa errada) com dupla aprovação? No protótipo, qualquer pessoa do financeiro estorna com motivo." },
  { id: "Q9", texto: "O resumo de pagamentos para o financeiro deve ser diário ou semanal?" },
  { id: "Q12", texto: "Um comprovante que caiu \"fora do projeto\" pode ser baixado em outro projeto?" },
  { id: "Q13", texto: "Vamos receber comprovantes de outros bancos ou em imagem (foto)?" },
  { id: "N5", texto: "No lançamento agrupado, cada pessoa vira uma conta a pagar ou continua como item de um lançamento só?" },
  { id: "F2", texto: "Quando a mesma pessoa recebe entrevistas e outros valores, é um Pix para cada natureza?" },
  { id: "F3", texto: "Qual é a lista oficial de categorias (plano de contas)? A lista deste protótipo serve?" },
  { id: "F6", texto: "Precisamos guardar os comprovantes de incentivo e de folha?" },
  { id: "F14", texto: "Na invoice internacional, em que moeda fica o valor? Registramos o câmbio?" },
  { id: "F15", texto: "Precisamos marcar \"transferência entre empresas\" para o consolidado não contar duas vezes?" },
  { id: "F20", texto: "Gasto acima do orçamento do item: o Financeiro segura como \"pendente de autorização\" até um administrador liberar?" },
  { id: "NF-RPA", texto: "Entrevistador que recebe por RPA: a planilha de pagamentos já traz o valor líquido (−11% de INSS)?" },
];
