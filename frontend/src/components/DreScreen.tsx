"use client";

import { CalendarRange, FileSpreadsheet, Scale } from "lucide-react";
import Link from "next/link";
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
  SIGNS,
  exportDre,
  getDre,
  isEmpty,
  shortMonthYear,
  yearToDate,
  type DreAccount,
  type DreBasis,
  type DreLine,
  type DreQuery,
  type DreReport,
  type DreStatement,
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
      "Receita líquida, lucro bruto e resultado por mês, pela competência. O plano de contas diz em que linha cada grupo ou conta entra. Provisões e títulos cancelados ficam de fora.",
  },
  caixa: {
    title: "Fluxo mensal",
    screen: "fluxo-mensal",
    icon: CalendarRange,
    name: "o fluxo mensal",
    file: "fluxo-mensal",
    subtitle:
      "Entradas e saídas por mês, pela data do pagamento, com cada grupo do plano de contas e as contas dele. Contam as baixas e os recebimentos que valem, nas contas do fluxo de caixa.",
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

/** Os grupos de uma linha, com as contas quando a pessoa pede. */
function Groups({ groups, showAccounts, strong }: { groups: DreLine[]; showAccounts: boolean; strong?: boolean }) {
  return groups.map((group) => (
    <Fragment key={group.label}>
      <TableRow>
        <TableCell className={cn(TD, STICKY, "pl-8 text-brand-cinza-escuro", strong && "font-semibold")}>
          {group.label}
        </TableCell>
        <Values row={group} />
      </TableRow>
      {showAccounts &&
        group.accounts.map((account) => (
          <TableRow key={account.label}>
            <TableCell className={cn(TD, STICKY, "pl-14 text-muted-foreground")}>{account.label}</TableCell>
            <Values row={account} className="text-muted-foreground" />
          </TableRow>
        ))}
    </Fragment>
  ));
}

/** A faixa de um bloco ou de um subtotal. */
function Band({ label, row }: { label: string; row: DreAccount }) {
  return (
    <TableRow className="bg-muted hover:bg-muted">
      <TableCell className={cn(TD, STICKY, "bg-muted font-semibold uppercase text-brand-cinza-escuro")}>
        {label}
      </TableCell>
      <Values row={row} strong />
    </TableRow>
  );
}

/** O DRE: as linhas com o sinal, os subtotais e, à parte, o que fica fora do resultado. */
function Statement({ data, showAccounts }: { data: DreStatement; showAccounts: boolean }) {
  return (
    <>
      {data.rows.map((row) =>
        row.kind === "linha" ? (
          <Fragment key={row.key}>
            <TableRow>
              <TableCell className={cn(TD, STICKY, "font-semibold text-brand-cinza-escuro")}>
                <span className="text-muted-foreground">{SIGNS[row.sign]} </span>
                {row.label}
              </TableCell>
              <Values row={row} strong />
            </TableRow>
            <Groups groups={row.groups} showAccounts={showAccounts} />
          </Fragment>
        ) : (
          <Band key={row.key} label={`${SIGNS[row.sign]} ${row.label}`} row={row} />
        )
      )}
      {data.outside && (
        <>
          <TableRow>
            <TableCell className={cn(TD, STICKY, "pt-8 font-semibold text-brand-cinza-escuro")}>
              {data.outside.label}
              <span className="block text-xs font-normal text-muted-foreground">Não soma no resultado</span>
            </TableCell>
            <Values row={data.outside} className="pt-8" />
          </TableRow>
          <Groups groups={data.outside.groups} showAccounts={showAccounts} />
        </>
      )}
    </>
  );
}

/** O fluxo mensal: receitas, despesas e o resultado. */
function Blocks({ data, showAccounts }: { data: DreReport; showAccounts: boolean }) {
  return (
    <>
      {data.blocks.map((block) => (
        <Fragment key={block.kind}>
          <Band label={block.label} row={block} />
          <Groups groups={block.lines} showAccounts={showAccounts} strong />
        </Fragment>
      ))}
      <Band label="Resultado" row={data.result} />
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
  const [data, setData] = useState<DreStatement | DreReport | null>(null);
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
  const empty = data && isEmpty(data);
  const unmapped = data && "rows" in data ? data.unmapped : 0;
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

      {data && !empty && unmapped > 0 && (
        <p className="mb-4 rounded-lg border border-[#f5c56b] bg-[#fef6e7] px-4 py-3 text-sm text-[#8a5200]">
          {unmapped === 1 ? "1 conta com lançamento está" : `${unmapped} contas com lançamento estão`} sem linha do DRE.
          Escolha a linha do grupo ou da conta em{" "}
          <Link href="/cadastros?aba=categories" className="font-semibold underline">
            Cadastros → Plano de contas
          </Link>
          .
        </p>
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
              {"rows" in data ? (
                <Statement data={data} showAccounts={showAccounts} />
              ) : (
                <Blocks data={data} showAccounts={showAccounts} />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
