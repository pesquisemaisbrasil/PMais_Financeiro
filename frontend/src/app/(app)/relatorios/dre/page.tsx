"use client";

import { FileSpreadsheet, Scale } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { CARD, ErrorBox, Field, NUM, PageHeader, TD, TH } from "@/components/finance";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getReference } from "@/lib/api";
import { todayInSaoPaulo } from "@/lib/cashFlow";
import { saveBlob } from "@/lib/documents";
import { exportDre, getDre, yearToDate, type DreAccount, type DreQuery, type DreReport } from "@/lib/dre";
import { place } from "@/lib/nav";
import { brl, type Reference } from "@/lib/payables";
import { cn } from "@/lib/utils";

type Option = { id: number | string; label: string };

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
          className={cn(TD, NUM, strong && "font-semibold", Number(value) < 0 && "text-[#b91c1c]", className)}
        >
          {Number(value) ? brl(value) : "—"}
        </TableCell>
      ))}
      <TableCell className={cn(TD, NUM, "font-semibold", Number(row.total) < 0 && "text-[#b91c1c]", className)}>
        {brl(row.total)}
      </TableCell>
    </>
  );
}

export default function DrePage() {
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
      const result = await getDre(query);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o DRE");
    }
  }, [query]);

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
      saveBlob(await exportDre(query), `dre-${query.start}-a-${query.end}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar o DRE");
    } finally {
      setExporting(false);
    }
  }

  const units = (reference?.units ?? []).filter((unit) => !query.company || String(unit.companyId) === query.company);
  const empty = data && data.blocks.every((block) => !block.lines.length);

  return (
    <>
      <PageHeader
        {...place("/relatorios/dre")}
        icon={Scale}
        subtitle="Receitas, despesas e resultado por mês, pela competência. Cada linha é um grupo do plano de contas, com as contas dele. Provisões e títulos cancelados ficam de fora."
        actions={
          <Button variant="outline" onClick={handleExport} disabled={exporting || !data}>
            <FileSpreadsheet aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar Excel"}
          </Button>
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
          <Spinner aria-label="Carregando o DRE" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}

      {data && empty && (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhum lançamento nesse período e nesses filtros.
        </div>
      )}

      {data && !empty && (
        <div data-tour="dre" className={cn(CARD, "overflow-x-auto")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Linha</TableHead>
                {data.months.map((month) => (
                  <TableHead key={month.month} className={cn(TH, NUM)}>
                    {month.label}
                  </TableHead>
                ))}
                <TableHead className={cn(TH, NUM)}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.blocks.map((block) => (
                <Fragment key={block.kind}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell className={cn(TD, "font-semibold uppercase text-brand-cinza-escuro")}>{block.label}</TableCell>
                    <Values row={block} strong />
                  </TableRow>
                  {block.lines.map((line) => (
                    <Fragment key={`${block.kind}-${line.label}`}>
                      <TableRow>
                        <TableCell className={cn(TD, "pl-8 font-semibold text-brand-cinza-escuro")}>{line.label}</TableCell>
                        <Values row={line} />
                      </TableRow>
                      {showAccounts &&
                        line.accounts.map((account) => (
                          <TableRow key={`${block.kind}-${line.label}-${account.label}`}>
                            <TableCell className={cn(TD, "pl-14 text-muted-foreground")}>{account.label}</TableCell>
                            <Values row={account} className="text-muted-foreground" />
                          </TableRow>
                        ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className={cn(TD, "font-semibold uppercase text-brand-cinza-escuro")}>Resultado</TableCell>
                <Values row={data.result} strong />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
