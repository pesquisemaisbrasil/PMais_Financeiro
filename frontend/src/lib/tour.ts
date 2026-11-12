/** Passeio de introdução do sistema: os passos, o texto e o "já vi" guardado no navegador. */

/** Guarda que este navegador já viu (ou fechou) o passeio: ele só abre sozinho uma vez. */
export const TOUR_SEEN_KEY = "financeiro:passeio-visto";

export interface TourStep {
  /** O `data-tour` do elemento destacado; sem ele, o balão fica no meio da tela. */
  target: string | null;
  title: string;
  text: string;
}

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
    text: "Quando quiser rever, é só clicar aqui.",
  },
];

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
