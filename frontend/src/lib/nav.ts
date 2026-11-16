import { BookUser, ChartColumn, House, Wallet, type LucideIcon } from "lucide-react";

/** O menu lateral: a única fonte das seções, dos nomes e dos endereços. O título de cada tela sai daqui. */

export type Leaf = {
  label: string;
  /** Sem endereço = tela que ainda não existe: aparece como "Em breve", sem link. */
  href?: string;
  counted?: boolean;
};
export type Entry = { id: string; label: string; icon: LucideIcon; href?: string; children?: Leaf[] };

export const NAV: Entry[] = [
  { id: "inicio", label: "Início", icon: House, href: "/" },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    children: [
      { href: "/contas-a-pagar", label: "Contas a pagar", counted: true },
      { href: "/contas-a-receber", label: "Contas a receber" },
      { label: "Notas e RPA" },
      { href: "/conferencia-bancaria", label: "Conferência bancária" },
      { href: "/divergencias", label: "Divergências" },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: ChartColumn,
    children: [
      { href: "/relatorios/projeto", label: "Relatório do projeto" },
      { href: "/incentivos", label: "Incentivos" },
      { label: "Fluxo de caixa" },
      { label: "DRE" },
      { label: "Resultado por projeto" },
      { label: "Extrato × despesas" },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: BookUser,
    children: [
      { href: "/cadastros?aba=companies", label: "Empresas" },
      { href: "/cadastros?aba=units", label: "Unidades" },
      { href: "/cadastros?aba=costCenters", label: "Centros de custo" },
      { href: "/cadastros?aba=customers", label: "Clientes" },
      { href: "/cadastros?aba=suppliers", label: "Fornecedores" },
      { href: "/cadastros?aba=categories", label: "Plano de contas" },
      { href: "/cadastros?aba=projects", label: "Projetos" },
      { href: "/cadastros?aba=bankAccounts", label: "Contas bancárias" },
      { href: "/cadastros?aba=paymentMethods", label: "Formas de pagamento" },
      { href: "/cadastros?aba=holidays", label: "Feriados" },
    ],
  },
];

/**
 * O endereço sem a barra do fim. O site exportado (a demonstração) abre /contas-a-pagar/, com barra, e o
 * menu comparava com /contas-a-pagar: nenhuma página aparecia como a atual.
 */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** A aba do Cadastros vem do endereço (?aba=); sem ela, vale a primeira. */
export function isActive(href: string | undefined, pathname: string, aba: string | null): boolean {
  if (!href) return false;
  const [path, query] = href.split("?");
  if (normalizePath(pathname) !== path) return false;
  return !query || (aba ?? "companies") === new URLSearchParams(query).get("aba");
}

/** A seção e o nome da página como estão no menu, para o título da tela: "Cadastros - Fornecedores". */
export function place(href: string): { section: string; title: string } {
  for (const entry of NAV) {
    const leaf = entry.children?.find((child) => child.href === href);
    if (leaf) return { section: entry.label, title: leaf.label };
  }
  throw new Error(`${href} não está no menu`);
}
