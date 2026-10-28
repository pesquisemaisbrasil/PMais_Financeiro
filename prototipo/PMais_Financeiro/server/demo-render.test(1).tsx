import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { DemoProvider } from "../client/src/contexts/DemoStore";
import DemoDashboard from "../client/src/pages/demo/DemoDashboard";
import DemoPaymentsPage from "../client/src/pages/demo/DemoPaymentsPage";
import DemoRegistryPage from "../client/src/pages/demo/DemoRegistryPage";
import DemoAccountsPage from "../client/src/pages/demo/DemoAccountsPage";
import DemoBudgetPage from "../client/src/pages/demo/DemoBudgetPage";
import DemoPayrollPage from "../client/src/pages/demo/DemoPayrollPage";
import DemoReconciliationPage from "../client/src/pages/demo/DemoReconciliationPage";
import DemoReportsPage from "../client/src/pages/demo/DemoReportsPage";

const pages = [
  ["/", DemoDashboard], ["/demo/pagamentos", DemoPaymentsPage], ["/demo/cadastros", DemoRegistryPage],
  ["/demo/contas", DemoAccountsPage], ["/demo/orcamento", DemoBudgetPage], ["/demo/folha", DemoPayrollPage],
  ["/demo/conciliacao", DemoReconciliationPage], ["/demo/relatorios", DemoReportsPage],
] as const;
describe("Renderização das oito telas de demonstração", () => {
  for (const [path, Page] of pages) {
    it(`renderiza ${path} com aviso e controles sem usar dados reais`, () => {
      const markup = renderToStaticMarkup(<DemoProvider><Router ssrPath={path}><Page /></Router></DemoProvider>);
      expect(markup).toContain("DADOS SINTÉTICOS");
      expect(markup).toContain("NENHUMA OPERAÇÃO REAL");
      expect(markup).toContain("<h1>");
      const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});
