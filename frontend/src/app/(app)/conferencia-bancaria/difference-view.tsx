"use client";

import { CircleHelp, FileQuestion, Scale, Undo2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CARD, ErrorBox, NUM, TD, TH } from "@/components/finance";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { getDifference, monthLabel, type Difference, type DifferenceGroup } from "@/lib/bank-month";
import { brl, formatDate, plural } from "@/lib/payables";
import { cn } from "@/lib/utils";

function Tile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "ambar" | "verde" }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "block text-lg font-semibold tabular-nums text-brand-cinza-escuro",
          tone === "ambar" && "text-[#b45309]",
          tone === "verde" && "text-[#047857]"
        )}
      >
        {value}
      </span>
      <span className="block text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function Reason({
  icon: Icon,
  title,
  group,
  empty,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  group: DifferenceGroup;
  empty: string;
  tone: string;
}) {
  const more = group.count - group.items.length;
  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", tone)}>
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 text-[13px]">
        <strong className="block text-brand-cinza-escuro">
          {title} · {brl(group.total)}
        </strong>
        {group.items.length ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {group.items.map((item, index) => (
              <li key={`${item.on}-${index}`}>
                {formatDate(item.on)} {item.description} · {brl(item.amount)}
                {item.note ? ` (${item.note})` : ""}
              </li>
            ))}
            {more > 0 && <li>e mais {more}</li>}
          </ul>
        ) : (
          <span className="text-xs text-muted-foreground">{empty}</span>
        )}
      </div>
    </li>
  );
}

/**
 * Extrato × sistema: as saídas do extrato contra as baixas do sistema, dia a dia, no mês, e o que
 * explica a diferença (saída sem par, baixa sem linha no extrato e Pix devolvido).
 */
export function DifferenceView({ accountId, month }: { accountId: number; month: string }) {
  const [data, setData] = useState<Difference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    setData(null);
    try {
      const result = await getDifference(accountId, month);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar a diferença");
    }
  }, [accountId, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando a conta ou o mês muda
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner aria-label="Carregando a diferença" className="size-6 text-brand-cinza-escuro/70" />
      </div>
    );
  }
  if (!data.imported && !data.byDay.length) {
    return (
      <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
        Nenhum extrato de {monthLabel(month)} nesta conta. Importe o extrato para comparar com o sistema.
      </div>
    );
  }
  const matches = Number(data.difference) === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Saídas no extrato" value={brl(data.extractTotal)} detail={monthLabel(month)} />
        <Tile label="Baixas no sistema" value={brl(data.systemTotal)} detail="pagamentos com data no mês" />
        <Tile
          label="Diferença"
          value={brl(data.difference)}
          detail={matches ? "bate" : "explicada ao lado"}
          tone={matches ? "verde" : "ambar"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <div className="px-4 pt-4">
            <h2 className="text-sm font-semibold text-brand-cinza-escuro">Por dia</h2>
            <p className="text-xs text-muted-foreground">Só saídas. Dias com diferença em destaque.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Dia</TableHead>
                <TableHead className={cn(TH, NUM)}>Extrato</TableHead>
                <TableHead className={cn(TH, NUM)}>Sistema</TableHead>
                <TableHead className={cn(TH, NUM)}>Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byDay.map((day) => (
                <TableRow key={day.day} className={cn(Number(day.difference) !== 0 && "bg-[#fffbeb] hover:bg-[#fffbeb]")}>
                  <TableCell className={TD}>{formatDate(day.day)}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(day.extract)}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(day.system)}</TableCell>
                  <TableCell className={cn(TD, NUM, "font-semibold", Number(day.difference) !== 0 && "text-[#b45309]")}>
                    {Number(day.difference) !== 0 ? brl(day.difference) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className={cn(TD, "font-semibold")}>Mês</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.extractTotal)}</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.systemTotal)}</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.difference)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 px-4 pt-4">
            <Scale size={16} className="text-brand-azul-deep" aria-hidden />
            <h2 className="text-sm font-semibold text-brand-cinza-escuro">O que explica a diferença</h2>
          </div>
          <ul className="mt-2" aria-label="O que explica a diferença">
            <Reason
              icon={CircleHelp}
              tone="bg-[#fef3c7] text-[#b45309]"
              title={plural(data.linesWithoutPair.count, "saída do extrato sem par", "saídas do extrato sem par")}
              group={data.linesWithoutPair}
              empty="Nenhuma"
            />
            <Reason
              icon={FileQuestion}
              tone="bg-brand-roxo/10 text-brand-roxo"
              title={plural(data.paymentsWithoutLine.count, "baixa sem linha no extrato", "baixas sem linha no extrato")}
              group={data.paymentsWithoutLine}
              empty="Nenhuma"
            />
            <Reason
              icon={Undo2}
              tone="bg-[#fee2e2] text-[#b91c1c]"
              title={plural(data.returns.count, "volta (Pix devolvido)", "voltas (Pix devolvidos)")}
              group={data.returns}
              empty="Nenhuma. Pix devolvido: a saída está no extrato, e a devolução entra como crédito."
            />
          </ul>
        </div>
      </div>
    </div>
  );
}
