"use client";

import { FileSpreadsheet, HandCoins } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, Field, NUM, PageHeader, TD, TH } from "@/components/finance";
import { SavedFilters } from "@/components/SavedFilters";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getReference } from "@/lib/api";
import { todayInSaoPaulo } from "@/lib/cashFlow";
import { saveBlob } from "@/lib/documents";
import { brl, type Reference } from "@/lib/payables";
import {
  exportProjectReceipts,
  getProjectReceipts,
  shortMonth,
  yearOptions,
  type ProjectReceiptsReport,
  type ProjectReceiptsRow,
} from "@/lib/projectReceipts";
import { cn } from "@/lib/utils";

// a coluna do projeto fica parada ao rolar os meses para o lado
const STICKY = "sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--color-border)]";

function Values({ row, strong }: { row: ProjectReceiptsRow; strong?: boolean }) {
  return (
    <>
      {row.values.map((value, index) => (
        <TableCell key={index} className={cn(TD, NUM, strong && "font-semibold")}>
          {Number(value) ? brl(value) : "—"}
        </TableCell>
      ))}
      <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(row.total)}</TableCell>
    </>
  );
}

export default function ProjectReceiptsPage() {
  const today = todayInSaoPaulo();
  const [year, setYear] = useState(today.slice(0, 4));
  const [company, setCompany] = useState("");
  const [reference, setReference] = useState<Reference | null>(null);
  const [data, setData] = useState<ProjectReceiptsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // a busca mais recente: a resposta de um filtro que já mudou é descartada
  const latest = useRef(0);

  useEffect(() => {
    getReference().then(setReference, () => setReference(null));
  }, []);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    try {
      const result = await getProjectReceipts(year, company);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os recebimentos");
    }
  }, [year, company]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o filtro muda
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      saveBlob(await exportProjectReceipts(year, company), `recebimentos-de-projetos-${year}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar os recebimentos");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      <PageHeader
        section="Relatórios"
        title="Recebimentos × ano"
        icon={HandCoins}
        subtitle="O que entrou de cada projeto em cada mês do ano, pela data do recebimento. Recebimentos estornados e contas fora do fluxo de caixa não entram."
        actions={
          <>
            <SavedFilters
              screen="recebimentos-projetos"
              value={{ company }}
              onApply={(saved) => setCompany(saved.company)}
            />
            <Button variant="outline" onClick={handleExport} disabled={exporting || !data}>
              <FileSpreadsheet aria-hidden="true" />
              {exporting ? "Exportando…" : "Exportar Excel"}
            </Button>
          </>
        }
      />

      <div data-tour="filtros" className={cn(CARD, "mb-4 flex flex-wrap items-end gap-3 px-4 py-4")}>
        <Field label="Ano" id="recebimentos-ano">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="recebimentos-ano" className="w-[120px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions(today).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Empresa" id="recebimentos-empresa">
          <SearchSelect
            id="recebimentos-empresa"
            className="w-[200px]"
            value={company}
            onChange={setCompany}
            placeholder="Todas"
            options={[
              { id: "", label: "Todas" },
              ...(reference?.companies ?? []).map((c) => ({ id: c.id, label: c.name })),
            ]}
          />
        </Field>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando os recebimentos" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}

      {data && !data.rows.length && (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhum recebimento nesse ano e nesse filtro.
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div data-tour="quadro" className={cn(CARD, "overflow-x-auto")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(TH, STICKY)}>Projeto</TableHead>
                {data.months.map((month) => (
                  <TableHead key={month.month} className={cn(TH, NUM)} title={month.label}>
                    {shortMonth(month.label)}
                  </TableHead>
                ))}
                <TableHead className={cn(TH, NUM)}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.projectId ?? "sem-projeto"}>
                  <TableCell className={cn(TD, STICKY, "font-medium text-brand-cinza-escuro")}>{row.label}</TableCell>
                  <Values row={row} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className={cn(TD, STICKY, "bg-muted font-semibold uppercase text-brand-cinza-escuro")}>
                  Total
                </TableCell>
                <Values row={data.total} strong />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </main>
  );
}
