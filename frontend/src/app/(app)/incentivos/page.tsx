"use client";

import { ArrowUpRight, CalendarClock, CalendarDays, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CARD, ErrorBox, NUM, PageHeader, SituationTag, TD, TH } from "@/components/finance";
import { IndicatorCard, type IndicatorTone } from "@/components/IndicatorCard";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { getIncentiveAgenda, groupByDay, overdueNotice, peopleText, type Agenda, type Bucket } from "@/lib/incentives";
import { brl, formatDate, monthRange, periodLabel, plural, type PeriodMode } from "@/lib/payables";
import { weekday } from "@/lib/holidays";
import { cn } from "@/lib/utils";

type Group = "a_vencer" | "hoje" | "vencido" | "pago";

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
  { id: "tudo", label: "Tudo" },
  { id: "periodo", label: "Período" },
];

const GROUPS: { id: Group; label: string; icon: LucideIcon; tone: IndicatorTone }[] = [
  { id: "vencido", label: "Vencidos", icon: TriangleAlert, tone: "vermelho" },
  { id: "hoje", label: "Vencem hoje", icon: CalendarClock, tone: "ambar" },
  { id: "a_vencer", label: "A vencer", icon: CalendarDays, tone: "neutro" },
  { id: "pago", label: "Pagos", icon: CircleCheck, tone: "verde" },
];

// Que situação da conta cai em qual grupo (a mesma regra do servidor)
const GROUP_OF: Record<string, Group> = {
  a_vencer: "a_vencer",
  parcial: "a_vencer",
  hoje: "hoje",
  vencido: "vencido",
  devolvido: "vencido",
  pago: "pago",
};

function bucketText(bucket: Bucket): string {
  return bucket.count ? `${plural(bucket.count, "lançamento", "lançamentos")} · ${peopleText(bucket.people)}` : " ";
}

export default function IncentiveAgendaPage() {
  const [mode, setMode] = useState<PeriodMode>("mes");
  const [ref, setRef] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filter, setFilter] = useState<Group | null>(null);
  const [data, setData] = useState<Agenda | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getIncentiveAgenda({ mode, ref, start: rangeStart, end: rangeEnd }));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar a agenda de incentivos");
    }
  }, [mode, ref, rangeStart, rangeEnd]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o período muda
    void load();
  }, [load]);

  function changeMode(next: PeriodMode) {
    // O período livre começa no mês que estava à vista, e a pessoa ajusta as duas datas.
    if (next === "periodo" && !rangeStart && data) {
      const month = monthRange(data.rangeStart ?? data.today);
      setRangeStart(month.start);
      setRangeEnd(month.end);
    }
    setMode(next);
    if (next === "periodo") setCalendarOpen(true);
  }

  function applyDates(start: string, end: string) {
    if (start === end) {
      setMode("dia");
      setRef(start);
    } else {
      setMode("periodo");
      setRangeStart(start);
      setRangeEnd(end);
    }
  }

  const shownRows = data ? data.rows.filter((row) => !filter || GROUP_OF[row.situation] === filter) : [];
  const days = data ? groupByDay(shownRows, data.today) : [];
  const notice = data ? overdueNotice(data.overdueAll, data.summary.vencido) : null;
  const viewLabel = data
    ? data.rangeStart && data.rangeEnd
      ? `${formatDate(data.rangeStart)} até ${formatDate(data.rangeEnd)}`
      : "Todo o período"
    : "";

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Agenda de incentivos"
        icon={CalendarClock}
        subtitle="Cada data de pagamento dos incentivos, com as pessoas e a situação. Quem paga e dá a baixa continua no Contas a pagar."
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      {notice && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {notice}{" "}
            <Button variant="link" className="h-auto p-0 font-semibold text-inherit" onClick={() => changeMode("tudo")}>
              Ver todos os períodos
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {GROUPS.map((option, index) => {
          const bucket = data?.summary[option.id];
          return (
            <IndicatorCard
              key={option.id}
              index={index}
              label={option.label}
              icon={option.icon}
              tone={option.tone}
              active={filter === option.id}
              danger={option.id === "vencido" && Boolean(bucket?.count)}
              value={bucket ? brl(bucket.total) : "—"}
              count={bucket ? bucketText(bucket) : " "}
              onClick={() => setFilter((current) => (current === option.id ? null : option.id))}
            />
          );
        })}
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-4">
          {data && (
            <PeriodPicker
              label={viewLabel}
              start={data.rangeStart}
              end={data.rangeEnd}
              today={data.today}
              open={calendarOpen}
              onOpenChange={setCalendarOpen}
              onApply={applyDates}
            />
          )}
          <Select value={mode} onValueChange={(next) => changeMode(next as PeriodMode)}>
            <SelectTrigger className="w-[120px] bg-card" aria-label="Visão por período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode !== "tudo" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (mode === "periodo") setMode("dia");
                setRef(null);
              }}
            >
              Hoje
            </Button>
          )}
          {filter && (
            <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
              Limpar filtro
            </Button>
          )}
        </div>

        {!data ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : days.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Lançamento</TableHead>
                <TableHead className={TH}>Projeto</TableHead>
                <TableHead className={cn(TH, NUM)}>Pessoas</TableHead>
                <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                <TableHead className={cn(TH, NUM)}>A pagar</TableHead>
                <TableHead className={TH}>Situação</TableHead>
                <TableHead className={TH} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.flatMap((day) => [
                <TableRow key={day.date} className="bg-brand-azul-deep/5 hover:bg-brand-azul-deep/5">
                  <TableCell colSpan={7} className={cn(TD, "font-semibold text-brand-cinza-escuro")}>
                    <span className={cn(day.late && "text-[#b91c1c]")}>
                      {formatDate(day.date)} · {weekday(day.date)}
                    </span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {peopleText(day.people)} · {day.pending > 0 ? `${brl(day.pending)} a pagar` : "tudo pago"}
                    </span>
                  </TableCell>
                </TableRow>,
                ...day.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className={cn(TD, "whitespace-normal pl-8")}>{row.description}</TableCell>
                    <TableCell className={cn(TD, "whitespace-nowrap")}>
                      {row.projectCodes.map((code) => `PRJ-${code}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className={cn(TD, NUM)}>{row.people}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{brl(row.amount)}</TableCell>
                    <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(row.pending)}</TableCell>
                    <TableCell className={TD}>
                      <SituationTag situation={row.situation} />
                    </TableCell>
                    <TableCell className={cn(TD, "text-right")}>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/contas-a-pagar?conta=${row.id}`}>
                          Abrir
                          <ArrowUpRight size={14} aria-hidden />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {filter
              ? "Nenhum incentivo nessa situação no período."
              : mode === "tudo"
                ? "Nenhum incentivo lançado ainda. Eles entram pela importação de planilha, no Contas a pagar."
                : `Nenhum incentivo com vencimento em ${periodLabel(mode, data.rangeStart ?? data.today)}. Veja outro período no seletor acima.`}
          </p>
        )}
      </div>
    </main>
  );
}
