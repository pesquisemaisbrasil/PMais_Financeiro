"use client";

import { FileSpreadsheet, Landmark } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { CARD, ErrorBox, Field, NUM, PageHeader, ProvisionTag, TD, TH } from "@/components/finance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import {
  defaultRange,
  exportCashFlow,
  getCashFlow,
  getCashFlowDetail,
  GROUPS,
  titleHref,
  todayInSaoPaulo,
  type CashFlowDetail,
  type CashFlowGroup,
  type CashFlowLine,
  type CashFlowPeriod,
  type CashFlowQuery,
  type CashFlowReport,
} from "@/lib/cashFlow";
import { saveBlob } from "@/lib/documents";
import { place } from "@/lib/nav";
import { brl, formatDate } from "@/lib/payables";
import { cn } from "@/lib/utils";

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-lg font-semibold tabular-nums text-brand-cinza-escuro">{value}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Zero fica em traço, para o que tem valor saltar aos olhos. */
function amount(value: string): string {
  return Number(value) ? brl(value) : "—";
}

export default function CashFlowPage() {
  const [query, setQuery] = useState<CashFlowQuery>(() => ({
    ...defaultRange(todayInSaoPaulo()),
    group: "semana",
  }));
  const [data, setData] = useState<CashFlowReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<CashFlowPeriod | null>(null);
  const [exporting, setExporting] = useState(false);
  // a busca mais recente: a resposta de um período que já mudou é descartada
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!query.start || !query.end) return;
    const mine = ++latest.current;
    setError(null);
    try {
      const result = await getCashFlow(query);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o fluxo de caixa");
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o período muda
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      saveBlob(await exportCashFlow(query), `fluxo-de-caixa-${query.start}-a-${query.end}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar o fluxo de caixa");
    } finally {
      setExporting(false);
    }
  }

  const late = data ? Number(data.lateIn) || Number(data.lateOut) : 0;

  return (
    <>
      <PageHeader
        {...place("/relatorios/fluxo-de-caixa")}
        icon={Landmark}
        subtitle="Quanto entra e quanto sai em cada data. Previsto é o que está em aberto em Contas a pagar e a receber, pelo vencimento; realizado são as baixas e os recebimentos, pela data do dinheiro."
        actions={
          <Button variant="outline" onClick={handleExport} disabled={exporting || !data}>
            <FileSpreadsheet aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar Excel"}
          </Button>
        }
      />

      <div data-tour="periodo" className={cn(CARD, "mb-4 flex flex-wrap items-end gap-3 px-4 py-4")}>
        <Field label="De" id="fluxo-de">
          <DateInput
            id="fluxo-de"
            value={query.start}
            onChange={(event) => setQuery((current) => ({ ...current, start: event.target.value }))}
          />
        </Field>
        <Field label="Até" id="fluxo-ate">
          <DateInput
            id="fluxo-ate"
            value={query.end}
            onChange={(event) => setQuery((current) => ({ ...current, end: event.target.value }))}
          />
        </Field>
        <Field label="Agrupar por" id="fluxo-grupo">
          <Select
            value={query.group}
            onValueChange={(group) => setQuery((current) => ({ ...current, group: group as CashFlowGroup }))}
          >
            <SelectTrigger id="fluxo-grupo" className="w-[140px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando o fluxo de caixa" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}

      {data && (
        <>
          <div data-tour="saldos" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              label={`Saldo em ${formatDate(data.start)}`}
              value={brl(data.opening)}
              hint="Contas bancárias que entram no fluxo de caixa"
            />
            <Tile
              label="Em atraso antes do período"
              value={
                late ? (
                  <>
                    <span className="block">A pagar: {brl(data.lateOut)}</span>
                    <span className="block text-base">A receber: {brl(data.lateIn)}</span>
                  </>
                ) : (
                  "Nada em atraso"
                )
              }
              hint="Já entra no saldo projetado"
            />
            <Tile label={`Saldo projetado em ${formatDate(data.end)}`} value={brl(data.closing)} />
          </div>

          <div data-tour="periodos" className={cn(CARD, "mb-6 overflow-hidden")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Período</TableHead>
                  <TableHead className={cn(TH, NUM)}>Entradas previstas</TableHead>
                  <TableHead className={cn(TH, NUM)}>Saídas previstas</TableHead>
                  <TableHead className={cn(TH, NUM)}>Entradas realizadas</TableHead>
                  <TableHead className={cn(TH, NUM)}>Saídas realizadas</TableHead>
                  <TableHead className={cn(TH, NUM)}>Saldo projetado</TableHead>
                  <TableHead className={TH}>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.periods.map((row) => (
                  <TableRow key={row.start}>
                    <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{row.label}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{amount(row.forecastIn)}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{amount(row.forecastOut)}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{amount(row.actualIn)}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{amount(row.actualOut)}</TableCell>
                    <TableCell
                      className={cn(TD, NUM, "font-semibold", Number(row.balance) < 0 && "text-[#b91c1c]")}
                    >
                      {brl(row.balance)}
                    </TableCell>
                    <TableCell className={TD}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpened(row)}
                        aria-label={`Ver o que compõe ${row.label}`}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <section data-tour="contas" className={cn(CARD, "mb-6 overflow-hidden")}>
            <div className="px-4 pt-4">
              <h2 className="text-sm font-semibold text-brand-cinza-escuro">Realizado por conta bancária</h2>
              <p className="text-xs text-muted-foreground">
                Só o que já entrou e saiu. O previsto não tem conta: ela é escolhida na baixa.
              </p>
            </div>
            {data.accounts.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Conta</TableHead>
                    <TableHead className={cn(TH, NUM)}>Saldo no início</TableHead>
                    <TableHead className={cn(TH, NUM)}>Entradas</TableHead>
                    <TableHead className={cn(TH, NUM)}>Saídas</TableHead>
                    <TableHead className={cn(TH, NUM)}>Saldo no fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{account.name}</TableCell>
                      <TableCell className={cn(TD, NUM)}>{brl(account.opening)}</TableCell>
                      <TableCell className={cn(TD, NUM)}>{amount(account.inflow)}</TableCell>
                      <TableCell className={cn(TD, NUM)}>{amount(account.outflow)}</TableCell>
                      <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(account.closing)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhuma conta bancária ativa entra no fluxo de caixa. Veja em Cadastros, Contas bancárias.
              </p>
            )}
          </section>
        </>
      )}

      {opened && <PeriodDetail period={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

function PeriodDetail({ period, onClose }: { period: CashFlowPeriod; onClose: () => void }) {
  const [detail, setDetail] = useState<CashFlowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getCashFlowDetail(period.start, period.end).then(setDetail, (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o período")
    );
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca do período ao abrir a janela
    load();
  }, [load]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Fluxo de caixa · {period.label}</DialogTitle>
          <DialogDescription>
            O previsto são os títulos em aberto que vencem no período; o realizado, as baixas e os recebimentos
            feitos nele.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBox message={error} onRetry={load} />}
        {!detail && !error && (
          <div className="flex justify-center p-6">
            <Spinner aria-label="Carregando o período" className="size-6 text-brand-cinza-escuro/70" />
          </div>
        )}
        {detail && (
          <>
            <Lines
              title="Previsto"
              empty="Nenhum título em aberto vence neste período."
              lines={detail.forecast}
              entrada={period.forecastIn}
              saida={period.forecastOut}
            />
            <Lines
              title="Realizado"
              empty="Nenhuma baixa nem recebimento neste período."
              lines={detail.actual}
              entrada={period.actualIn}
              saida={period.actualOut}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Lines({
  title,
  empty,
  lines,
  entrada,
  saida,
}: {
  title: string;
  empty: string;
  lines: CashFlowLine[];
  entrada: string;
  saida: string;
}) {
  return (
    <section aria-label={title} className="mt-2">
      <h3 className="mb-1 text-sm font-semibold text-brand-cinza-escuro">{title}</h3>
      {lines.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>Data</TableHead>
              <TableHead className={TH}>Quem</TableHead>
              <TableHead className={TH}>Descrição</TableHead>
              <TableHead className={cn(TH, NUM)}>Entrada</TableHead>
              <TableHead className={cn(TH, NUM)}>Saída</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={`${line.kind}-${line.titleId}-${line.date}-${line.amount}`}>
                <TableCell className={TD}>{formatDate(line.date)}</TableCell>
                <TableCell className={TD}>{line.name}</TableCell>
                <TableCell className={TD}>
                  <Link href={titleHref(line)} className="underline-offset-2 hover:underline">
                    {line.description}
                  </Link>
                  {line.provision && (
                    <span className="ml-2">
                      <ProvisionTag />
                    </span>
                  )}
                  {line.account && <span className="block text-xs text-muted-foreground">{line.account}</span>}
                </TableCell>
                <TableCell className={cn(TD, NUM)}>{line.kind === "receber" ? brl(line.amount) : ""}</TableCell>
                <TableCell className={cn(TD, NUM)}>{line.kind === "pagar" ? brl(line.amount) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className={cn(TD, "font-semibold")} colSpan={3}>
                Total
              </TableCell>
              <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(entrada)}</TableCell>
              <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(saida)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
