import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileCheck2,
  Filter,
  Layers3,
  Printer,
  RefreshCcw,
  Scale,
  WalletCards,
} from "lucide-react";
import {
  DemoEmpty,
  DemoMetric,
  DemoPageShell,
  DemoPanel,
  DemoStatus,
} from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import {
  formatBrl,
  formatDemoDate,
  pendingCents,
  settledCents,
  shiftDate,
  sumCents,
  titleStatus,
  todayInSaoPaulo,
  type DemoTitle,
} from "@/lib/demoModel";

type ViewKey =
  | "titles"
  | "realized"
  | "forecast"
  | "projects"
  | "aging"
  | "reconciliation";
type PeriodKey = "todos" | "mes-atual" | "ultimos-30" | "proximos-30" | "personalizado";
type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";

type DateRange = { from: string; to: string };
type ExportCell = string | number;

const DEMO_CSV_BANNER = "MOCKUP DEMO — DADOS SINTÉTICOS; NÃO É RELATÓRIO FINANCEIRO REAL";
const EMPTY_PROJECT = "__sem_projeto__";

const views: Array<{ key: ViewKey; label: string; shortLabel: string }> = [
  { key: "titles", label: "Pagar / receber", shortLabel: "Pagar / receber" },
  { key: "realized", label: "Realizado", shortLabel: "Realizado" },
  { key: "forecast", label: "Previsto", shortLabel: "Previsto" },
  { key: "projects", label: "Resultado por projeto", shortLabel: "Por projeto" },
  { key: "aging", label: "Carteira / aging", shortLabel: "Carteira / aging" },
  { key: "reconciliation", label: "Conciliação pendente", shortLabel: "Conciliação" },
];

function dateAtStartOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function dateAtEndOfMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0, 12));
  return `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDay.getUTCDate()).padStart(2, "0")}`;
}

function rangeForPeriod(period: PeriodKey, from: string, to: string, today: string): DateRange {
  if (period === "mes-atual") {
    return { from: dateAtStartOfMonth(today), to: dateAtEndOfMonth(today) };
  }
  if (period === "ultimos-30") {
    return { from: shiftDate(today, -29), to: today };
  }
  if (period === "proximos-30") {
    return { from: today, to: shiftDate(today, 30) };
  }
  if (period === "personalizado") {
    return { from, to };
  }
  return { from: "", to: "" };
}

function inDateRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function projectLabel(
  projects: Array<{ id: string; code: string; name: string }>,
  projectId: string | null | undefined,
): string {
  if (!projectId) return "Sem projeto";
  const project = projects.find(item => item.id === projectId);
  return project ? `${project.code} • ${project.name}` : "Projeto não encontrado";
}

function titleStatusLabel(status: string): string {
  switch (status) {
    case "liquidado_simulado": return "Liquidado (simulado)";
    case "parcial": return "Parcial";
    case "vencido": return "Vencido";
    case "vence_hoje": return "Vence hoje";
    default: return "A vencer";
  }
}

function statusTone(status: string): StatusTone {
  if (["liquidado_simulado", "paga_simulada", "conciliada"].includes(status)) return "positive";
  if (["vencido", "pendente", "aberta", "aprovada_demo", "exceção"].includes(status)) return "warning";
  if (["parcial", "vence_hoje"].includes(status)) return "info";
  return "neutral";
}

function directionLabel(direction: "pagar" | "receber" | "saida" | "entrada"): string {
  return direction === "pagar" || direction === "saida" ? "Pagar / saída" : "Receber / entrada";
}

function directionTone(direction: "pagar" | "receber" | "saida" | "entrada"): StatusTone {
  return direction === "pagar" || direction === "saida" ? "warning" : "positive";
}

function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((fromUtc - toUtc) / 86_400_000);
}

function agingBucket(dueDate: string, today: string): string {
  if (dueDate < today) {
    const daysLate = daysBetween(today, dueDate);
    return daysLate <= 30 ? "Vencido há 1–30 dias" : "Vencido há mais de 30 dias";
  }
  const daysToDue = daysBetween(dueDate, today);
  if (daysToDue <= 7) return "Vence em 0–7 dias";
  if (daysToDue <= 30) return "Vence em 8–30 dias";
  return "Vence após 30 dias";
}

function csvCell(value: ExportCell): string {
  const raw = String(value);
  const protectedText = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

function csvDocument(headers: string[], rows: ExportCell[][]): string {
  return [
    DEMO_CSV_BANNER,
    headers.map(csvCell).join(";"),
    ...rows.map(row => row.map(csvCell).join(";")),
  ].join("\n");
}

function ReportTable({
  caption,
  headers,
  children,
  empty,
}: {
  caption: string;
  headers: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  if (empty) return <DemoEmpty title={empty}>Ajuste os filtros demo para consultar outros registros sintéticos.</DemoEmpty>;
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table">
        <caption>{caption}</caption>
        <thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function TableNumber({ children }: { children: React.ReactNode }) {
  return <td className="table-number">{children}</td>;
}

export default function DemoReportsPage() {
  const { state } = useDemoStore();
  const today = todayInSaoPaulo();
  const [activeView, setActiveView] = useState<ViewKey>("titles");
  const [period, setPeriod] = useState<PeriodKey>("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [feedback, setFeedback] = useState("");

  const range = useMemo(
    () => rangeForPeriod(period, dateFrom, dateTo, today),
    [dateFrom, dateTo, period, today],
  );

  const reportData = useMemo(() => {
    const matchesProject = (titleProjectId: string | null) => !projectId || titleProjectId === projectId;
    const matchesDate = (date: string) => !(range.from && range.to && range.from > range.to) && inDateRange(date, range);
    const matchesCategory = (id: string | undefined) => !categoryId || id === categoryId;
    const labelForProject = (id: string | null | undefined) => projectLabel(state.projects, id);

    const titleRows = state.titles
      .filter(title => matchesProject(title.projectId) && matchesCategory(title.categoryId) && matchesDate(title.dueDate))
      .map(title => ({
        title,
        settled: settledCents(title),
        pending: pendingCents(title),
        project: labelForProject(title.projectId),
        status: titleStatus(title, today),
      }))
      .sort((a, b) => a.title.dueDate.localeCompare(b.title.dueDate));

    const realizedRows = state.titles.flatMap(title => title.settlements.map(settlement => ({
      id: settlement.id,
      title,
      settlement,
      project: labelForProject(title.projectId),
    })))
      .filter(row => matchesProject(row.title.projectId) && matchesCategory(row.title.categoryId) && matchesDate(row.settlement.date))
      .sort((a, b) => a.settlement.date.localeCompare(b.settlement.date));

    const forecastRows = [
      ...state.titles
        .filter(title => matchesProject(title.projectId) && matchesCategory(title.categoryId) && pendingCents(title) > 0 && matchesDate(title.dueDate))
        .map(title => ({
          id: title.id,
          kind: "Título",
          description: title.description,
          project: labelForProject(title.projectId),
          dueDate: title.dueDate,
          amount: pendingCents(title),
          direction: title.direction,
          status: titleStatus(title, today),
        })),
      ...state.provisions
        .filter(provision => provision.status === "prevista" && matchesCategory(provision.categoryId) && (!projectId || provision.projectId === projectId) && matchesDate(provision.dueDate))
        .map(provision => ({
          id: provision.id,
          kind: "Provisão",
          description: provision.description,
          project: labelForProject(provision.projectId),
          dueDate: provision.dueDate,
          amount: provision.amountCents,
          direction: "pagar" as const,
          status: "prevista",
        })),
    ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const projectMap = new Map<string, { key: string; projectId: string | null; project: string; revenue: number; expense: number; records: number }>();
    state.titles
      .filter(title => matchesProject(title.projectId) && matchesCategory(title.categoryId) && matchesDate(title.competenceDate))
      .forEach(title => {
        const key = title.projectId ?? EMPTY_PROJECT;
        const current = projectMap.get(key) ?? {
          key,
          projectId: title.projectId,
          project: labelForProject(title.projectId),
          revenue: 0,
          expense: 0,
          records: 0,
        };
        current.records += 1;
        if (title.direction === "receber") current.revenue += title.amountCents;
        else current.expense += title.amountCents;
        projectMap.set(key, current);
      });
    const projectRows = [...projectMap.values()].sort((a, b) => b.revenue - b.expense - (a.revenue - a.expense));

    const agingMap = new Map<string, { bucket: string; payable: number; receivable: number; records: number }>();
    titleRows
      .filter(row => row.pending > 0)
      .forEach(row => {
        const bucket = agingBucket(row.title.dueDate, today);
        const current = agingMap.get(bucket) ?? { bucket, payable: 0, receivable: 0, records: 0 };
        current.records += 1;
        if (row.title.direction === "pagar") current.payable += row.pending;
        else current.receivable += row.pending;
        agingMap.set(bucket, current);
      });
    const agingOrder = [
      "Vencido há mais de 30 dias",
      "Vencido há 1–30 dias",
      "Vence em 0–7 dias",
      "Vence em 8–30 dias",
      "Vence após 30 dias",
    ];
    const agingRows = [...agingMap.values()].sort((a, b) => agingOrder.indexOf(a.bucket) - agingOrder.indexOf(b.bucket));

    const reconciliationRows = state.bankTransactions
      .filter(transaction => {
        const originTitle = state.titles.find(title => title.id === transaction.originTitleId);
        return (!projectId || originTitle?.projectId === projectId)
          && matchesCategory(originTitle?.categoryId) && matchesDate(transaction.date)
          && (!transaction.reconciled || Boolean(transaction.exceptionReason));
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const pendingFieldSheets = state.fieldSheets
      .filter(sheet => (sheet.status === "aberta" || sheet.status === "aprovada_demo")
        && (!projectId || sheet.projectId === projectId)
        && matchesDate(sheet.date) && (!categoryId || sheet.itemIds.some(id => state.fieldItems.find(item => item.id === id)?.categoryId === categoryId)))
      .map(sheet => !categoryId ? sheet : { ...sheet, itemIds: sheet.itemIds.filter(id => state.fieldItems.find(item => item.id === id)?.categoryId === categoryId), amountCents: sumCents(sheet.itemIds.map(id => state.fieldItems.find(item => item.id === id)).filter(item => item?.categoryId === categoryId).map(item => item?.amountCents ?? 0)) })
      .sort((a, b) => a.date.localeCompare(b.date));

    const titleIn = sumCents(titleRows.filter(row => row.title.direction === "receber").map(row => row.title.amountCents));
    const titleOut = sumCents(titleRows.filter(row => row.title.direction === "pagar").map(row => row.title.amountCents));
    const titlePending = sumCents(titleRows.map(row => row.pending));
    const realizedIn = sumCents(realizedRows.filter(row => row.title.direction === "receber").map(row => row.settlement.amountCents));
    const realizedOut = sumCents(realizedRows.filter(row => row.title.direction === "pagar").map(row => row.settlement.amountCents));
    const forecastIn = sumCents(forecastRows.filter(row => row.direction === "receber").map(row => row.amount));
    const forecastOut = sumCents(forecastRows.filter(row => row.direction === "pagar").map(row => row.amount));
    const projectIn = sumCents(projectRows.map(row => row.revenue));
    const projectOut = sumCents(projectRows.map(row => row.expense));
    const agingIn = sumCents(agingRows.map(row => row.receivable));
    const agingOut = sumCents(agingRows.map(row => row.payable));
    const reconciliationIn = sumCents(reconciliationRows.filter(row => row.flow === "entrada").map(row => row.amountCents));
    const reconciliationOut = sumCents(reconciliationRows.filter(row => row.flow === "saida").map(row => row.amountCents));

    const summaryByView: Record<ViewKey, { records: number; inCents: number; outCents: number; pendingCents: number }> = {
      titles: { records: titleRows.length, inCents: titleIn, outCents: titleOut, pendingCents: titlePending },
      realized: { records: realizedRows.length, inCents: realizedIn, outCents: realizedOut, pendingCents: 0 },
      forecast: { records: forecastRows.length, inCents: forecastIn, outCents: forecastOut, pendingCents: forecastOut + forecastIn },
      projects: { records: projectRows.length, inCents: projectIn, outCents: projectOut, pendingCents: 0 },
      aging: { records: agingRows.reduce((sum, row) => sum + row.records, 0), inCents: agingIn, outCents: agingOut, pendingCents: agingIn + agingOut },
      reconciliation: { records: reconciliationRows.length, inCents: reconciliationIn, outCents: reconciliationOut, pendingCents: reconciliationIn + reconciliationOut },
    };

    return {
      titleRows,
      realizedRows,
      forecastRows,
      projectRows,
      agingRows,
      reconciliationRows,
      pendingFieldSheets,
      summary: summaryByView[activeView],
    };
  }, [activeView, categoryId, projectId, range, state, today]);

  const activeViewLabel = views.find(view => view.key === activeView)?.label ?? "Relatório demo";
  const currentSummary = reportData.summary;
  const currentNet = currentSummary.inCents - currentSummary.outCents;

  const choosePeriod = (value: PeriodKey) => {
    setPeriod(value);
    if (value === "todos") {
      setDateFrom("");
      setDateTo("");
    } else if (value === "mes-atual") {
      setDateFrom(dateAtStartOfMonth(today));
      setDateTo(dateAtEndOfMonth(today));
    } else if (value === "ultimos-30") {
      setDateFrom(shiftDate(today, -29));
      setDateTo(today);
    } else if (value === "proximos-30") {
      setDateFrom(today);
      setDateTo(shiftDate(today, 30));
    }
  };

  const updateFrom = (value: string) => {
    setPeriod("personalizado");
    setDateFrom(value);
  };

  const updateTo = (value: string) => {
    setPeriod("personalizado");
    setDateTo(value);
  };

  const exportCurrentView = () => {
    if (range.from && range.to && range.from > range.to) { setFeedback("A data inicial deve ser anterior ou igual à final."); return; }
    let headers: string[] = [];
    let rows: ExportCell[][] = [];
    let totalRow: ExportCell[] = [];

    if (activeView === "titles") {
      headers = ["tipo", "descricao", "projeto", "vencimento", "valor_centavos", "liquidado_centavos", "saldo_pendente_centavos", "status"];
      rows = reportData.titleRows.map(row => [
        directionLabel(row.title.direction), row.title.description, row.project, row.title.dueDate,
        row.title.amountCents, row.settled, row.pending, titleStatusLabel(row.status),
      ]);
      totalRow = ["TOTAL FILTRADO", "", "", "", sumCents(reportData.titleRows.map(row => row.title.amountCents)), sumCents(reportData.titleRows.map(row => row.settled)), sumCents(reportData.titleRows.map(row => row.pending)), ""];
    } else if (activeView === "realized") {
      headers = ["tipo", "descricao", "projeto", "data_liquidacao", "valor_centavos"];
      rows = reportData.realizedRows.map(row => [directionLabel(row.title.direction), row.title.description, row.project, row.settlement.date, row.settlement.amountCents]);
      totalRow = ["TOTAL FILTRADO", "", "", "", sumCents(reportData.realizedRows.map(row => row.settlement.amountCents))];
    } else if (activeView === "forecast") {
      headers = ["origem", "descricao", "projeto", "vencimento", "tipo", "valor_centavos", "status"];
      rows = reportData.forecastRows.map(row => [row.kind, row.description, row.project, row.dueDate, directionLabel(row.direction), row.amount, row.status === "prevista" ? "Provisão prevista" : titleStatusLabel(row.status)]);
      totalRow = ["TOTAL FILTRADO", "", "", "", "", sumCents(reportData.forecastRows.map(row => row.amount)), ""];
    } else if (activeView === "projects") {
      headers = ["projeto", "registros", "receitas_centavos", "despesas_centavos", "resultado_centavos"];
      rows = reportData.projectRows.map(row => [row.project, row.records, row.revenue, row.expense, row.revenue - row.expense]);
      totalRow = ["TOTAL FILTRADO", sumCents(reportData.projectRows.map(row => row.records)), sumCents(reportData.projectRows.map(row => row.revenue)), sumCents(reportData.projectRows.map(row => row.expense)), currentNet];
    } else if (activeView === "aging") {
      headers = ["faixa", "registros", "pagar_centavos", "receber_centavos", "saldo_centavos"];
      rows = reportData.agingRows.map(row => [row.bucket, row.records, row.payable, row.receivable, row.receivable - row.payable]);
      totalRow = ["TOTAL FILTRADO", reportData.agingRows.reduce((sum, row) => sum + row.records, 0), sumCents(reportData.agingRows.map(row => row.payable)), sumCents(reportData.agingRows.map(row => row.receivable)), currentNet];
    } else {
      headers = ["data", "tipo", "descricao", "valor_centavos", "situacao"];
      rows = reportData.reconciliationRows.map(row => [row.date, directionLabel(row.flow), row.description, row.amountCents, row.exceptionReason ? "Exceção registrada" : "Aguardando conciliação"]);
      totalRow = ["TOTAL FILTRADO", "", "", sumCents(reportData.reconciliationRows.map(row => row.amountCents)), ""];
    }

    const document = csvDocument(headers, [[`FILTROS DEMO: de ${range.from || "início"} até ${range.to || "fim"}; projeto ${projectId || "todos"}; categoria ${categoryId || "todas"}`], ...rows, totalRow]);
    const blob = new Blob([document], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-demo-${activeView}-${today}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setFeedback(`CSV simulado exportado: ${anchor.download}. O arquivo contém apenas dados sintéticos filtrados.`);
  };

  const printCurrentView = () => {
    setFeedback("A impressão foi solicitada para este relatório demo; o conteúdo continua sendo simulado.");
    window.print();
  };

  const noResults = currentSummary.records === 0;

  return (
    <DemoPageShell
      module="M7 Relatórios"
      title="Relatórios e fluxo de caixa demo"
      description="Leituras navegáveis de títulos, liquidações, previsões, projetos, carteira e conciliação usando somente registros sintéticos locais."
      actions={(
        <div className="hero-actions no-print">
          <button type="button" className="button-secondary" onClick={exportCurrentView}>
            <Download size={16} aria-hidden="true" /> Exportar CSV demo
          </button>
          <button type="button" className="button-primary" onClick={printCurrentView}>
            <Printer size={16} aria-hidden="true" /> Imprimir demo
          </button>
        </div>
      )}
    >
      {range.from && range.to && range.from > range.to ? <div className="demo-feedback" role="alert">A data inicial deve ser anterior ou igual à data final. Ajuste os filtros.</div> : null}
      <div className="read-only-notice" role="note">
        <strong>Relatório simulado:</strong> os totais abaixo são calculados no navegador a partir de dados sintéticos filtrados. Não representam posição financeira real.
      </div>

      <DemoPanel
        title="Filtros da consulta demo"
        subtitle="O campo de data acompanha a lógica da visão: vencimento, liquidação, competência ou movimento bancário."
        className="no-print"
      >
        <div className="catalog-toolbar" aria-label="Filtros do relatório demo">
          <label className="filter-label" htmlFor="demo-period">
            <CalendarDays size={15} aria-hidden="true" /> Período
            <select id="demo-period" value={period} onChange={event => choosePeriod(event.target.value as PeriodKey)}>
              <option value="todos">Todos os períodos demo</option>
              <option value="mes-atual">Mês atual</option>
              <option value="ultimos-30">Últimos 30 dias</option>
              <option value="proximos-30">Próximos 30 dias</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </label>
          <label className="filter-label" htmlFor="demo-date-from">
            De
            <input id="demo-date-from" type="date" value={dateFrom} onChange={event => updateFrom(event.target.value)} aria-label="Data inicial demo" />
          </label>
          <label className="filter-label" htmlFor="demo-date-to">
            Até
            <input id="demo-date-to" type="date" value={dateTo} onChange={event => updateTo(event.target.value)} aria-label="Data final demo" />
          </label>
          <label className="filter-label" htmlFor="demo-project">
            <Layers3 size={15} aria-hidden="true" /> Projeto
            <select id="demo-project" value={projectId} onChange={event => setProjectId(event.target.value)}>
              <option value="">Todos os projetos demo</option>
              {state.projects.map(project => <option key={project.id} value={project.id}>{project.code} • {project.name}</option>)}
            </select>
          </label>
          <label className="filter-label" htmlFor="demo-category">Categoria DEMO<select id="demo-category" value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Todas as categorias DEMO</option>{state.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button
            type="button"
            className="button-quiet"
            onClick={() => { setPeriod("todos"); setDateFrom(""); setDateTo(""); setProjectId(""); setCategoryId(""); setFeedback("Filtros demo limpos. Todos os registros sintéticos estão novamente disponíveis."); }}
          >
            <RefreshCcw size={15} aria-hidden="true" /> Limpar filtros
          </button>
        </div>
        <p className="catalog-result-line" aria-live="polite">
          <Filter size={14} aria-hidden="true" /> Consulta <strong>{activeViewLabel}</strong> • referência {range.from || "início"} a {range.to || "fim"} • {projectId ? "projeto demo selecionado" : "todos os projetos demo"} • {categoryId ? "categoria demo selecionada" : "todas as categorias demo"}.
        </p>
      </DemoPanel>

      <div className="catalog-tabs no-print" role="group" aria-label="Visões do relatório demo">
        {views.map(view => (
          <button
            key={view.key}
            type="button"
            
            aria-pressed={activeView === view.key}
            aria-controls={`demo-report-${view.key}`}
            className={`catalog-tab ${activeView === view.key ? "is-selected" : ""}`}
            onClick={() => setActiveView(view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <section className="overview-stat-grid" aria-label={`Totais filtrados da visão ${activeViewLabel}`}>
        <DemoMetric label="Registros filtrados" value={String(currentSummary.records)} detail="Linhas ou grupos sintéticos nesta visão" icon={BarChart3} tone="blue" />
        <DemoMetric label="Entradas" value={formatBrl(currentSummary.inCents)} detail="Sempre calculadas em centavos" icon={CircleDollarSign} tone="green" />
        <DemoMetric label="Saídas" value={formatBrl(currentSummary.outCents)} detail="Sempre calculadas em centavos" icon={WalletCards} tone="amber" />
        <DemoMetric label="Saldo líquido" value={formatBrl(currentNet)} detail="Entradas menos saídas filtradas" icon={Scale} tone={currentNet >= 0 ? "cyan" : "purple"} />
      </section>

      {feedback ? <div className="status-summary-card" role="status" aria-live="polite">{feedback}</div> : null}

      <div id={`demo-report-${activeView}`} role="region" aria-label={activeViewLabel}>
        {activeView === "titles" ? (
          <DemoPanel title="Lista de pagar e receber" subtitle="Saldo pendente, liquidação acumulada e status de cada título demo filtrado por vencimento.">
            <ReportTable
              caption="Títulos sintéticos de pagar e receber"
              headers={["Tipo", "Descrição", "Projeto", "Vencimento", "Valor", "Liquidado", "Saldo pendente", "Status"]}
              empty={noResults ? "Nenhum título demo encontrado" : undefined}
            >
              {reportData.titleRows.map(row => (
                <tr key={row.title.id}>
                  <td><DemoStatus tone={directionTone(row.title.direction)}>{directionLabel(row.title.direction)}</DemoStatus></td>
                  <td>{row.title.description}</td>
                  <td>{row.project}</td>
                  <td>{formatDemoDate(row.title.dueDate)}</td>
                  <TableNumber>{formatBrl(row.title.amountCents)}</TableNumber>
                  <TableNumber>{formatBrl(row.settled)}</TableNumber>
                  <TableNumber>{formatBrl(row.pending)}</TableNumber>
                  <td><DemoStatus tone={statusTone(row.status)}>{titleStatusLabel(row.status)}</DemoStatus></td>
                </tr>
              ))}
            </ReportTable>
          </DemoPanel>
        ) : null}

        {activeView === "realized" ? (
          <DemoPanel title="Realizado por data de liquidação" subtitle="Cada settlement demo aparece na data em que foi liquidado; liquidações parciais permanecem separadas.">
            <ReportTable
              caption="Liquidações sintéticas por data"
              headers={["Tipo", "Descrição", "Projeto", "Data de liquidação", "Valor"]}
              empty={noResults ? "Nenhuma liquidação demo encontrada" : undefined}
            >
              {reportData.realizedRows.map(row => (
                <tr key={row.id}>
                  <td><DemoStatus tone={directionTone(row.title.direction)}>{directionLabel(row.title.direction)}</DemoStatus></td>
                  <td>{row.title.description}</td>
                  <td>{row.project}</td>
                  <td>{formatDemoDate(row.settlement.date)}</td>
                  <TableNumber>{formatBrl(row.settlement.amountCents)}</TableNumber>
                </tr>
              ))}
            </ReportTable>
          </DemoPanel>
        ) : null}

        {activeView === "forecast" ? (
          <DemoPanel title="Previsto por vencimento" subtitle="Saldo ainda pendente dos títulos mais provisões sintéticas previstas; provisões não liquidadas entram apenas como expectativa.">
            <ReportTable
              caption="Previsão sintética por data de vencimento"
              headers={["Origem", "Descrição", "Projeto", "Vencimento", "Tipo", "Valor", "Status"]}
              empty={noResults ? "Nenhum item previsto demo encontrado" : undefined}
            >
              {reportData.forecastRows.map(row => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{row.kind}</td>
                  <td>{row.description}</td>
                  <td>{row.project}</td>
                  <td>{formatDemoDate(row.dueDate)}</td>
                  <td><DemoStatus tone={directionTone(row.direction)}>{directionLabel(row.direction)}</DemoStatus></td>
                  <TableNumber>{formatBrl(row.amount)}</TableNumber>
                  <td><DemoStatus tone={statusTone(row.status)}>{row.status === "prevista" ? "Provisão prevista" : titleStatusLabel(row.status)}</DemoStatus></td>
                </tr>
              ))}
            </ReportTable>
          </DemoPanel>
        ) : null}

        {activeView === "projects" ? (
          <DemoPanel title="Resultado por projeto" subtitle="Competência dos títulos demo; receitas menos despesas por projeto, sem misturar data de liquidação.">
            <ReportTable
              caption="Resultado sintético por projeto e data de competência"
              headers={["Projeto", "Registros", "Receitas", "Despesas", "Resultado"]}
              empty={noResults ? "Nenhum resultado de projeto demo encontrado" : undefined}
            >
              {reportData.projectRows.map(row => (
                <tr key={row.key}>
                  <td>{row.project}</td>
                  <TableNumber>{row.records}</TableNumber>
                  <TableNumber>{formatBrl(row.revenue)}</TableNumber>
                  <TableNumber>{formatBrl(row.expense)}</TableNumber>
                  <TableNumber>{formatBrl(row.revenue - row.expense)}</TableNumber>
                </tr>
              ))}
            </ReportTable>
          </DemoPanel>
        ) : null}

        {activeView === "aging" ? (
          <DemoPanel title="Carteira e aging" subtitle="Saldo pendente dos títulos demo, agrupado pelo vencimento em relação a hoje; o filtro de data limita a carteira consultada.">
            <ReportTable
              caption="Aging sintético da carteira pendente"
              headers={["Faixa", "Registros", "Pagar", "Receber", "Saldo líquido"]}
              empty={noResults ? "Nenhuma pendência de carteira demo encontrada" : undefined}
            >
              {reportData.agingRows.map(row => (
                <tr key={row.bucket}>
                  <td>{row.bucket}</td>
                  <TableNumber>{row.records}</TableNumber>
                  <TableNumber>{formatBrl(row.payable)}</TableNumber>
                  <TableNumber>{formatBrl(row.receivable)}</TableNumber>
                  <TableNumber>{formatBrl(row.receivable - row.payable)}</TableNumber>
                </tr>
              ))}
            </ReportTable>
          </DemoPanel>
        ) : null}

        {activeView === "reconciliation" ? (
          <>
            <DemoPanel title="Pendências de conciliação" subtitle="Movimentos bancários sintéticos ainda sem conciliação ou marcados com exceção; nenhuma ação bancária real é executada aqui.">
              <ReportTable
                caption="Movimentos bancários sintéticos pendentes de conciliação"
                headers={["Data", "Tipo", "Descrição", "Valor", "Situação"]}
                empty={noResults ? "Nenhuma pendência de conciliação demo encontrada" : undefined}
              >
                {reportData.reconciliationRows.map(row => (
                  <tr key={row.id}>
                    <td>{formatDemoDate(row.date)}</td>
                    <td><DemoStatus tone={directionTone(row.flow)}>{directionLabel(row.flow)}</DemoStatus></td>
                    <td>{row.description}</td>
                    <TableNumber>{formatBrl(row.amountCents)}</TableNumber>
                    <td><DemoStatus tone={row.exceptionReason ? "warning" : "info"}>{row.exceptionReason ? "Exceção registrada" : "Aguardando conciliação"}</DemoStatus></td>
                  </tr>
                ))}
              </ReportTable>
            </DemoPanel>
            <DemoPanel title="Folhas de campo em aberto" subtitle="Pendência operacional demo relacionada ao fluxo de caixa, sem tratar a folha como movimento bancário conciliado.">
              {reportData.pendingFieldSheets.length ? (
                <div className="status-summary-grid" aria-label="Resumo de folhas de campo demo em aberto">
                  <div><span>Folhas abertas ou aprovadas</span><strong>{reportData.pendingFieldSheets.length}</strong></div>
                  <div><span>Valor operacional sintético</span><strong>{formatBrl(sumCents(reportData.pendingFieldSheets.map(sheet => sheet.amountCents)))}</strong></div>
                  <div><span>Estado</span><strong><DemoStatus tone="warning">Aguardando fluxo demo</DemoStatus></strong></div>
                </div>
              ) : <DemoEmpty title="Nenhuma folha de campo demo pendente">As folhas filtradas estão pagas em modo simulado ou não existem neste recorte.</DemoEmpty>}
            </DemoPanel>
          </>
        ) : null}
      </div>

      <div className="read-only-notice" role="note">
        <FileCheck2 size={16} aria-hidden="true" />
        <span>Todos os dados desta página são MOCKUP DEMO. Valores exibidos como BRL são apenas apresentação de inteiros em centavos; este conteúdo não é relatório financeiro real.</span>
      </div>
    </DemoPageShell>
  );
}
