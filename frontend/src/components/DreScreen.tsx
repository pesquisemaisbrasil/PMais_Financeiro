"use client";

import { CalendarRange, FileSpreadsheet, Scale } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { CARD, ErrorBox, Field, NUM, PageHeader, TD, TH } from "@/components/finance";
import { SavedFilters } from "@/components/SavedFilters";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getReference } from "@/lib/api";
import { todayInSaoPaulo } from "@/lib/cashFlow";
import { saveBlob } from "@/lib/documents";
import {
  exportDre,
  getDre,
  shortMonthYear,
  yearToDate,
  type DreAccount,
  type DreBasis,
  type DreQuery,
  type DreReport,
} from "@/lib/dre";
import { brl, type Reference } from "@/lib/payables";
import { cn } from "@/lib/utils";

type Option = { id: number | string; label: string };

// a coluna da linha fica parada ao rolar os meses para o lado
const STICKY = "sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--color-border)]";
// os meses: menos folga dos lados, para caber mais na tela
const CELL = "px-3";

/** O que muda entre o DRE (competência) e o fluxo mensal (mês do pagamento). */
const SCREENS = {
  competencia: {
    title: "DRE",
    screen: "dre",
    icon: Scale,
    name: "o DRE",
    file: "dre",
    subtitle:
      "Receitas, despesas e resultado por mês, pela competência. Cada linha é um grupo do plano de contas, com as contas dele. Provisões e títulos cancelados ficam de fora.",
  },
  caixa: {
    title: "Fluxo mensal",
    screen: "fluxo-mensal",
    icon: CalendarRange,
    name: "o fluxo mensal",
    file: "fluxo-mensal",
    subtitle:
      "Entradas e saídas por mês, pela data do pagamento. As linhas são as do DRE: cada grupo do plano de contas, com as contas dele. Contam as baixas e os recebimentos que valem, nas contas do fluxo de caixa.",
  },
} as const;

/** A opção que limpa o filtro vem primeiro. */
function withAll(all: string, options: Option[]): Option[] {
  return [{ id: "", label: all }, ...options];
}

function Values({ row, strong, className }: { row: DreAccount; strong?: boolean; className?: string }) {
  return (
    <>
      {row.values.map((value, index) => (
        <TableCell
          key={index}
          className={cn(TD, NUM, CELL, strong && "font-semibold", Number(value) < 0 && "text-[#b91c1c]", className)}
        >
          {Number(value) ? brl(value) : "—"}
        </TableCell>
      ))}
      <TableCell className={cn(TD, NUM, CELL, "font-semibold", Number(row.total) < 0 && "text-[#b91c1c]", className)}>
        {brl(row.total)}
      </TableCell>
    </>
  );
}

export function DreScreen({ basis }: { basis: DreBasis }) {
  const screen = SCREENS[basis];
  const [query, setQuery] = useState<DreQuery>(() => ({
    ...yearToDate(todayInSaoPaulo()),
    company: "",
    unit: "",
    project: "",
    costCenter: "",
  }));
  const [reference, setReference] = useState<Reference | null>(null);
  const [data, setData] = useState<DreReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [exporting, setExporting] = useState(false);
  // a busca mais recente: a resposta de um filtro que já mudou é descartada
  const latest = useRef(0);

  useEffect(() => {
    getReference().then(setReference, () => setReference(null));
  }, []);

  const load = useCallback(async () => {
    if (!query.start || !query.end) return;
    const mine = ++latest.current;
    setError(null);
    try {
      const result = await getDre(query, basis);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : `Não foi possível carregar ${screen.name}`);
    }
  }, [query, basis, screen.name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o filtro muda
    void load();
  }, [load]);

  function set(key: keyof DreQuery, value: string) {
    setQuery((current) => ({
      ...current,
      [key]: value,
      // a unidade é de uma empresa: trocar a empresa limpa a unidade
      ...(key === "company" ? { unit: "" } : {}),
    }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      saveBlob(await exportDre(query, basis), `${screen.file}-${query.start}-a-${query.end}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Não foi possível exportar ${screen.name}`);
    } finally {
      setExporting(false);
    }
  }

  const units = (reference?.units ?? []).filter((unit) => !query.company || String(unit.companyId) === query.company);
  const empty = data && data.blocks.every((block) => !block.lines.length);
  const { company, unit, project, costCenter } = query;

  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      <PageHeader
        section="Relatórios"
        title={screen.title}
        icon={screen.icon}
        subtitle={screen.subtitle}
        actions={
          <>
            <SavedFilters
              screen={screen.screen}
              value={{ company, unit, project, costCenter, showAccounts }}
              onApply={({ showAccounts: shown, ...filters }) => {
                setQuery((current) => ({ ...current, ...filters }));
                setShowAccounts(shown);
              }}
            />
            <Button variant="outline" onClick={handleExport} disabled={exporting || !data}>
              <FileSpreadsheet aria-hidden="true" />
              {exporting ? "Exportando…" : "Exportar Excel"}
            </Button>
          </>
        }
      />

      <div data-tour="filtros" className={cn(CARD, "mb-4 flex flex-wrap items-end gap-3 px-4 py-4")}>
        <Field label="De" id="dre-de">
          <DateInput id="dre-de" value={query.start} onChange={(event) => set("start", event.target.value)} />
        </Field>
        <Field label="Até" id="dre-ate">
          <DateInput id="dre-ate" value={query.end} onChange={(event) => set("end", event.target.value)} />
        </Field>
        <Field label="Empresa" id="dre-empresa">
          <SearchSelect
            id="dre-empresa"
            className="w-[180px]"
            value={query.company}
            onChange={(value) => set("company", value)}
            placeholder="Todas"
            options={withAll("Todas", (reference?.companies ?? []).map((c) => ({ id: c.id, label: c.name })))}
          />
        </Field>
        <Field label="Unidade" id="dre-unidade">
          <SearchSelect
            id="dre-unidade"
            className="w-[180px]"
            value={query.unit}
            onChange={(value) => set("unit", value)}
            placeholder="Todas"
            options={withAll("Todas", units.map((u) => ({ id: u.id, label: u.name })))}
          />
        </Field>
        <Field label="Projeto" id="dre-projeto">
          <SearchSelect
            id="dre-projeto"
            className="w-[200px]"
            value={query.project}
            onChange={(value) => set("project", value)}
            placeholder="Todos"
            options={withAll(
              "Todos",
              (reference?.projects ?? []).map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))
            )}
          />
        </Field>
        <Field label="Centro de custo" id="dre-centro">
          <SearchSelect
            id="dre-centro"
            className="w-[220px]"
            value={query.costCenter}
            onChange={(value) => set("costCenter", value)}
            placeholder="Todos"
            options={withAll("Todos", (reference?.costCenters ?? []).map((c) => ({ id: c.id, label: c.label })))}
          />
        </Field>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={showAccounts}
          onClick={() => setShowAccounts((shown) => !shown)}
        >
          {showAccounts ? "Esconder as contas" : "Mostrar as contas"}
        </Button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && (
        <div className="flex justify-center p-8">
          <Spinner aria-label={`Carregando ${screen.name}`} className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}

      {data && empty && (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhum lançamento nesse período e nesses filtros.
        </div>
      )}

      {data && !empty && (
        <div data-tour="quadro" className={cn(CARD, "overflow-x-auto")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(TH, STICKY)}>Linha</TableHead>
                {data.months.map((month) => (
                  <TableHead key={month.month} className={cn(TH, NUM, CELL)} title={month.label}>
                    {shortMonthYear(month.label)}
                  </TableHead>
                ))}
                <TableHead className={cn(TH, NUM, CELL)}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.blocks.map((block) => (
                <Fragment key={block.kind}>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableCell className={cn(TD, STICKY, "bg-muted font-semibold uppercase text-brand-cinza-escuro")}>
                      {block.label}
                    </TableCell>
                    <Values row={block} strong />
                  </TableRow>
                  {block.lines.map((line) => (
                    <Fragment key={`${block.kind}-${line.label}`}>
                      <TableRow>
                        <TableCell className={cn(TD, STICKY, "pl-8 font-semibold text-brand-cinza-escuro")}>
                          {line.label}
                        </TableCell>
                        <Values row={line} />
                      </TableRow>
                      {showAccounts &&
                        line.accounts.map((account) => (
                          <TableRow key={`${block.kind}-${line.label}-${account.label}`}>
                            <TableCell className={cn(TD, STICKY, "pl-14 text-muted-foreground")}>{account.label}</TableCell>
                            <Values row={account} className="text-muted-foreground" />
                          </TableRow>
                        ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              <TableRow className="bg-muted hover:bg-muted">
                <TableCell className={cn(TD, STICKY, "bg-muted font-semibold uppercase text-brand-cinza-escuro")}>
                  Resultado
                </TableCell>
                <Values row={data.result} strong />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
