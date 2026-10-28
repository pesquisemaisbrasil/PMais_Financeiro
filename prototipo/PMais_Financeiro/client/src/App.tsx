import { lazy, Suspense } from "react";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import DemoConfirmationHost from "./components/DemoConfirmationHost";
import { DemoProvider } from "./contexts/DemoStore";
import { useDemoAccess } from "./contexts/DemoAccess";
import Login from "./pages/Login";
import Access from "./pages/Access";
import Deployment from "./pages/Deployment";
import Documentation from "./pages/Documentation";
import ModuleGuide from "./pages/ModuleGuide";
import ModulesCatalog from "./pages/ModulesCatalog";
import NotFound from "./pages/NotFound";
import Overview from "./pages/Overview";
import Security from "./pages/Security";
const DemoDashboard = lazy(() => import("./pages/demo/DemoDashboard"));
const DemoPaymentsPage = lazy(() => import("./pages/demo/DemoPaymentsPage"));
const DemoRegistryPage = lazy(() => import("./pages/demo/DemoRegistryPage"));
const DemoAccountsPage = lazy(() => import("./pages/demo/DemoAccountsPage"));
const DemoBudgetPage = lazy(() => import("./pages/demo/DemoBudgetPage"));
const DemoPayrollPage = lazy(() => import("./pages/demo/DemoPayrollPage"));
const DemoReconciliationPage = lazy(() => import("./pages/demo/DemoReconciliationPage"));
const DemoReportsPage = lazy(() => import("./pages/demo/DemoReportsPage"));

function Loading() { return <div className="demo-empty" role="status">Verificando acesso à demonstração…</div>; }
function ShellRoute({ children }: { children: React.ReactNode }) {
  const { status } = useDemoAccess();
  if (status === "loading") return <Loading />;
  if (status !== "authenticated") return <Redirect to="/login" />;
  return <AppShell>{children}</AppShell>;
}
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/"><ShellRoute><DemoDashboard /></ShellRoute></Route>
      <Route path="/demo/pagamentos"><ShellRoute><DemoPaymentsPage /></ShellRoute></Route>
      <Route path="/demo/cadastros"><ShellRoute><DemoRegistryPage /></ShellRoute></Route>
      <Route path="/demo/contas"><ShellRoute><DemoAccountsPage /></ShellRoute></Route>
      <Route path="/demo/orcamento"><ShellRoute><DemoBudgetPage /></ShellRoute></Route>
      <Route path="/demo/folha"><ShellRoute><DemoPayrollPage /></ShellRoute></Route>
      <Route path="/demo/conciliacao"><ShellRoute><DemoReconciliationPage /></ShellRoute></Route>
      <Route path="/demo/relatorios"><ShellRoute><DemoReportsPage /></ShellRoute></Route>
      <Route path="/fundacao"><ShellRoute><Overview /></ShellRoute></Route>
      <Route path="/modulos"><ShellRoute><ModulesCatalog /></ShellRoute></Route>
      <Route path="/modulos/:id"><ShellRoute><ModuleGuide /></ShellRoute></Route>
      <Route path="/implantacao"><ShellRoute><Deployment /></ShellRoute></Route>
      <Route path="/seguranca"><ShellRoute><Security /></ShellRoute></Route>
      <Route path="/acesso"><ShellRoute><Access /></ShellRoute></Route>
      <Route path="/documentacao"><ShellRoute><Documentation /></ShellRoute></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}
export default function App() {
  const { status } = useDemoAccess();
  const routes = <Suspense fallback={<Loading />}><Router /></Suspense>;
  return <ErrorBoundary>{status === "authenticated" ? <DemoProvider>{routes}<DemoConfirmationHost /></DemoProvider> : routes}</ErrorBoundary>;
}
