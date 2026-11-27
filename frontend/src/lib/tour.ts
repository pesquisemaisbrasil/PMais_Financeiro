/** Passeios do sistema: os passos, o texto e o "já vi" guardado no navegador. */

/** Guarda que este navegador já viu (ou fechou) o passeio geral: ele só abre sozinho uma vez. */
export const TOUR_SEEN_KEY = "financeiro:passeio-visto";

export interface TourStep {
  /** O `data-tour` do elemento destacado; sem ele, o balão fica no meio da tela. */
  target: string | null;
  title: string;
  text: string;
}

/** O passeio geral: o menu e o que cada parte faz. Abre sozinho na primeira visita ao Início. */
export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Bem-vindo ao Financeiro",
    text: "Este passeio rápido mostra onde fica cada coisa. Dura menos de um minuto e dá para sair a qualquer hora.",
  },
  {
    target: "menu",
    title: "Menu principal",
    text: "Todas as telas ficam aqui. O botão no alto do menu recolhe e abre a barra.",
  },
  {
    target: "menu-inicio",
    title: "Início",
    text: "O resumo do dia: o que vence hoje, o que está atrasado e o que pede a sua atenção.",
  },
  {
    target: "menu-financeiro",
    title: "Financeiro",
    text: "O dia a dia: Contas a pagar e a receber, onde você lança, dá baixa e anexa documentos, e as Divergências, quando o Connect recusa uma baixa. O aviso laranja mostra quantas contas pedem atenção.",
  },
  {
    target: "menu-relatorios",
    title: "Relatórios",
    text: "O Relatório do projeto mostra quanto cada projeto lançou, pagou e falta pagar, com os documentos de todos os lançamentos. Incentivos traz cada data de pagamento dos incentivos, com as pessoas, e é onde se importa a planilha deles. Os outros relatórios estão chegando.",
  },
  {
    target: "menu-cadastros",
    title: "Cadastros",
    text: "Empresas, unidades, centros de custo, clientes, fornecedores, plano de contas e projetos. Os projetos vêm do Connect: use Atualizar do Connect.",
  },
  {
    target: "avisos",
    title: "Avisos",
    text: "O sino mostra o que precisa de atenção, como comprovantes de pessoas fora do projeto.",
  },
  {
    target: "passeio",
    title: "Ver o passeio de novo",
    text: "Quando quiser rever, é só clicar aqui. Em cada tela, este botão mostra o passeio daquela tela.",
  },
];

/**
 * O passeio de cada tela, pelo endereço dela. O primeiro passo é sempre o cabeçalho (`tela`), e os
 * demais destacam o que a pessoa vê e usa ali. Tela sem passeio próprio mostra o geral.
 */
export const SCREEN_TOURS: Record<string, TourStep[]> = {
  "/contas-a-pagar": [
    {
      target: "tela",
      title: "Contas a pagar",
      text: "Aqui ficam todas as contas que a empresa tem a pagar. Use Nova conta a pagar para lançar uma (dá para dividir entre projetos e repetir todo mês) e Importar planilha para lançar várias de uma vez (incentivos, folha de campo ou o relatório do sistema antigo). A empresa, no alto, fica lembrada: a lista abre nela da próxima vez.",
    },
    {
      target: "indicadores",
      title: "Cartões de resumo",
      text: "Cada cartão soma as contas de uma situação: total, pagas, pendentes, vencidas, de hoje, a vencer, provisões e canceladas. Clique num cartão para ver só aquelas contas; a lista e os totais acompanham.",
    },
    {
      target: "barra",
      title: "Período, filtros e exportação",
      text: "Escolha o período por dia, semana, mês, ano ou tudo, ou clique na data para marcar uma data inicial e uma final. Filtros abre o painel lateral, e cada filtro aceita mais de uma opção. Exportar gera Excel ou CSV, Imprimir abre a folha com todos os resultados e Colunas escolhe o que aparece.",
    },
    {
      target: "busca",
      title: "Busca",
      text: "Digite o nome da conta, o fornecedor ou o número da nota para achar na lista.",
    },
    {
      target: "lista",
      title: "A lista de contas",
      text: "Clique em qualquer lugar da linha para abrir a conta: detalhes, baixas, documentos, histórico e repetição. Marque as caixas para dar baixa, reclassificar, duplicar ou excluir várias de uma vez. A seta da linha mostra as pessoas de um incentivo ou de uma folha.",
    },
  ],
  "/contas-a-receber": [
    {
      target: "tela",
      title: "Contas a receber",
      text: "Aqui ficam os valores que os clientes devem à empresa. Use Nova conta a receber para lançar um título (dá para parcelar e repetir) e Inadimplência para ver o que está vencido, por cliente e por faixa de atraso. A empresa, no alto, é a mesma de Contas a pagar.",
    },
    {
      target: "indicadores",
      title: "Cartões de resumo",
      text: "Total, recebidos, pendentes, vencidos, de hoje e a vencer. Clique num cartão para ver só aqueles títulos; a lista e os totais acompanham.",
    },
    {
      target: "barra",
      title: "Período, filtros e exportação",
      text: "O período e os Filtros funcionam como em Contas a pagar. Exportar gera Excel ou CSV do que está na tela, e Imprimir abre a folha com todos os resultados.",
    },
    {
      target: "busca",
      title: "Busca",
      text: "Digite o título, o cliente ou o contrato para achar na lista.",
    },
    {
      target: "lista",
      title: "A lista de títulos",
      text: "Em cada linha, Registrar recebimento aceita o valor todo ou só uma parte. Clique na linha para abrir o título: recebimentos (com estorno, que pede o motivo), documentos, repetição e histórico.",
    },
  ],
  "/conferencia-bancaria": [
    {
      target: "tela",
      title: "Conferência bancária",
      text: "Aqui o extrato do banco é conferido com o sistema. Importar extrato lê um arquivo OFX (ou um CSV) e mostra uma prévia: nada é gravado até você confirmar.",
    },
    {
      target: "abas",
      title: "As quatro visões",
      text: "Conferência liga cada linha do extrato a uma conta que já tem baixa. Extrato × sistema compara o que o banco pagou com o que o sistema baixou, dia a dia. Saldo do mês mostra entradas, saídas e saldo de cada conta. Fechamento fecha o mês por empresa e baixa a planilha da contabilidade.",
    },
    {
      target: "conta",
      title: "Conta bancária",
      text: "Escolha a conta: cada conta tem o seu extrato. As contas se cadastram em Cadastros, em Contas bancárias.",
    },
    {
      target: "extrato",
      title: "As linhas do extrato",
      text: "Da mais nova para a mais antiga. De e Até limitam o período, e as abas separam as linhas Pendentes, Conciliadas e Exceções. Conciliar liga a linha a uma conta paga, do mesmo valor. Se nenhuma servir, marque como exceção e escreva o motivo. Desfazer devolve a linha a Pendente.",
    },
  ],
  "/divergencias": [
    {
      target: "tela",
      title: "Divergências",
      text: "Aqui aparecem as baixas que o Connect recusou. O Pix já saiu do banco, mas o Connect não aceitou marcar as entrevistas como pagas. Nada é corrigido sozinho: confira com o time do Connect e decida o que fazer.",
    },
    {
      target: "lista",
      title: "O que o Connect disse",
      text: "Cada baixa recusada vira uma linha com o projeto, de quem veio o Pix, o valor, o dia e a resposta do Connect. A referência ajuda o time do Connect a achar a baixa. Sem linhas, toda baixa foi aceita.",
    },
  ],
  "/cadastros": [
    {
      target: "tela",
      title: "Cadastros",
      text: "Aqui ficam as listas que o sistema usa nos lançamentos: empresas, unidades, centros de custo, clientes, fornecedores, plano de contas, projetos, contas bancárias e formas de pagamento. Escolha a lista no menu Cadastros. O botão do alto cria um registro novo; em Projetos, Novo projeto cadastra o projeto com a unidade e o centro de custo que o lançamento preenche sozinho.",
    },
    {
      target: "totais",
      title: "Quatro totais",
      text: "Mostram quantos registros aparecem agora (muda com a busca), o total da lista, os ativos e os inativos. Em Projetos, são os em andamento e os encerrados.",
    },
    {
      target: "lista",
      title: "A lista",
      text: "Busque pelo campo do alto e clique no nome de uma coluna para ordenar. Um cadastro que já tem lançamento não se exclui: inative. O inativo some das listas de escolha e continua nos relatórios.",
    },
  ],
  "/relatorios/projeto": [
    {
      target: "tela",
      title: "Relatório do projeto",
      text: "Escolha um projeto para ver quanto foi lançado, pago e falta pagar, com os documentos de todos os lançamentos dele. Aqui não se paga: para pagar, abra a conta em Contas a pagar.",
    },
    {
      target: "lista",
      title: "Os projetos",
      text: "Cada linha é um projeto do Connect, com o que foi lançado, o que foi pago e o que falta pagar. Abrir relatório mostra o detalhe do projeto.",
    },
    {
      target: "cartoes",
      title: "Cartões do projeto",
      text: "Orçamento e saldo vêm do Connect e ficam em traço até o Financeiro ler o orçamento de lá. Lançado, pago e a pagar vêm das contas do projeto. As provisões em aberto ficam à parte, porque ainda não são gasto.",
    },
    {
      target: "lancamentos",
      title: "Lançamentos",
      text: "Cada conta de Contas a pagar com a parte que cabe a este projeto, quando a conta é dividida entre projetos. Abrir leva à conta em Contas a pagar.",
    },
    {
      target: "documentos",
      title: "Documentos",
      text: "Planilhas, comprovantes e notas anexados às contas do projeto. Dá para baixar daqui, e cada download fica no histórico da conta.",
    },
  ],
  "/relatorios/fluxo-de-caixa": [
    {
      target: "tela",
      title: "Fluxo de caixa",
      text: "Quanto entra e quanto sai em cada data, para saber quanto vai precisar. Previsto é o que está em aberto em Contas a pagar e a receber, pelo vencimento; realizado são as baixas e os recebimentos, pela data do dinheiro.",
    },
    {
      target: "periodo",
      title: "O período",
      text: "Escolha as datas e se quer ver por dia, por semana ou por mês. Exportar Excel leva a mesma tabela para a planilha.",
    },
    {
      target: "saldos",
      title: "Os saldos",
      text: "O saldo das contas bancárias no começo do período, o que já estava em atraso antes dele e o saldo projetado no fim. O atrasado entra no saldo, para não sumir da conta.",
    },
    {
      target: "periodos",
      title: "Cada período",
      text: "Entradas e saídas previstas e realizadas, e o saldo projetado acumulado. Ver abre os títulos e as baixas do período, com o link para cada um.",
    },
    {
      target: "contas",
      title: "Por conta bancária",
      text: "Só o realizado de cada conta. O previsto ainda não tem conta: ela é escolhida na hora da baixa. Contas fora do fluxo de caixa, como o cartão, não entram.",
    },
  ],
  "/relatorios/dre": [
    {
      target: "tela",
      title: "DRE",
      text: "Receitas, despesas e resultado de cada mês, pela competência. Cada linha é um grupo do plano de contas. Provisões e títulos cancelados ficam de fora.",
    },
    {
      target: "filtros",
      title: "Os filtros",
      text: "Escolha o período e, se quiser, a empresa, a unidade, o projeto ou o centro de custo. Com o projeto, a conta dividida entre projetos entra só com a parte dele. Mostrar as contas abre as contas de cada grupo.",
    },
    {
      target: "quadro",
      title: "O DRE",
      text: "Cada grupo soma as contas dele, e o Resultado é receitas menos despesas. O grupo de cada conta muda em Cadastros, Plano de contas. Exportar Excel leva a tabela, com os filtros, para a planilha.",
    },
  ],
  "/notas-e-rpa": [
    {
      target: "tela",
      title: "Notas e RPA",
      text: "Acompanha os documentos fiscais das pessoas da folha de campo. Nada é pago aqui: a baixa e os anexos ficam no lançamento, em Contas a pagar.",
    },
    {
      target: "rpa",
      title: "Lista de RPA",
      text: "Quem recebe por RPA e foi paga no mês, com bruto, INSS e líquido. As setas trocam o mês, e Exportar leva a lista para a contabilidade emitir os recibos.",
    },
    {
      target: "nf",
      title: "NF pendente",
      text: "Quem recebe por NF e ainda não mandou a nota. É só aviso: o pagamento continua liberado. Quando a nota chegar, Registrar NF pede o número e a data de emissão, e fica no histórico do lançamento quem registrou.",
    },
  ],
  "/relatorios/fluxo-mensal": [
    {
      target: "tela",
      title: "Fluxo mensal",
      text: "Quanto entrou e saiu em cada mês, pela data do pagamento, com as mesmas linhas do DRE. O DRE olha a competência; aqui vale o dia em que o dinheiro se mexeu.",
    },
    {
      target: "filtros",
      title: "Os filtros",
      text: "Escolha o período e, se quiser, a empresa, a unidade, o projeto ou o centro de custo. Com o projeto, a baixa de uma conta dividida entra só com a parte dele. Favoritos guarda os filtros com um nome.",
    },
    {
      target: "quadro",
      title: "O quadro",
      text: "Contam as baixas e os recebimentos que valem, nas contas que entram no fluxo de caixa: estornos e o cartão ficam de fora. Exportar Excel leva a tabela para a planilha.",
    },
  ],
  "/relatorios/recebimentos-projetos": [
    {
      target: "tela",
      title: "Recebimentos × ano",
      text: "O que entrou de cada projeto em cada mês do ano, pela data do recebimento.",
    },
    {
      target: "filtros",
      title: "Os filtros",
      text: "Escolha o ano e, se quiser, a empresa. Favoritos guarda a empresa com um nome.",
    },
    {
      target: "quadro",
      title: "O quadro",
      text: "Uma linha por projeto e o total de cada mês embaixo. O título sem projeto aparece em Sem projeto, no fim. Exportar Excel leva a tabela, com a linha de total, para a planilha.",
    },
  ],
};

/** O passeio da tela em que a pessoa está. O endereço pode vir com barra no fim (site exportado). */
export function tourFor(pathname: string | null | undefined): TourStep[] {
  const path = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return SCREEN_TOURS[path] ?? TOUR_STEPS;
}

/** O endereço do elemento destacado na tela. */
export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}

/** Só os passos cujo elemento está na tela: tela estreita ou menu diferente não quebra o passeio. */
export function availableSteps(exists: (selector: string) => boolean, steps: TourStep[] = TOUR_STEPS): TourStep[] {
  return steps.filter((step) => step.target === null || exists(tourSelector(step.target)));
}

/** Sem armazenamento (navegação privada), o passeio não abre sozinho: só pelo botão. */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // sem armazenamento, o passeio só não lembra que já foi visto
  }
}
