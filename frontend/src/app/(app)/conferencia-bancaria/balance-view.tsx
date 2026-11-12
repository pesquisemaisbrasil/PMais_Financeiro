"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD, ErrorBox, NUM, TD, TH } from "@/components/finance";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { accountTypeLabel } from "@/lib/bank";
import { getBalances, monthLabel, type Balances } from "@/lib/bank-month";
import { brl } from "@/lib/payables";
import { cn } from "@/lib/utils";

/** Saldo do mês: por conta e consolidado, pelo extrato e pelo que já foi conferido no sistema. */
export function BalanceView({ month }: { month: string }) {
  const [data, setData] = useState<Balances | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getBalances(month));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o saldo");
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o mês muda
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner aria-label="Carregando o saldo" className="size-6 text-brand-cinza-escuro/70" />
      </div>
    );
  }
  if (!data.accounts.length) {
    return (
      <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
        Nenhuma conta bancária cadastrada.
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-brand-cinza-escuro">Saldo de {monthLabel(month)}</h2>
        <p className="text-xs text-muted-foreground">
          Por conta e consolidado. &quot;Pelo sistema&quot; soma só as linhas já conferidas, e &quot;A conferir&quot; é a diferença
          para o saldo do extrato.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH}>Conta</TableHead>
            <TableHead className={cn(TH, NUM)}>Saldo inicial</TableHead>
            <TableHead className={cn(TH, NUM)}>Entradas</TableHead>
            <TableHead className={cn(TH, NUM)}>Saídas</TableHead>
            <TableHead className={cn(TH, NUM)}>Saldo final (extrato)</TableHead>
            <TableHead className={cn(TH, NUM)}>Saldo pelo sistema</TableHead>
            <TableHead className={cn(TH, NUM)}>A conferir</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.accounts.map((account) => {
            const pending = Number(account.toCheck) !== 0;
            return (
              <TableRow key={account.id}>
                <TableCell className={cn(TD, "whitespace-normal")}>
                  <span className="block font-semibold text-brand-cinza-escuro">{account.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {account.company} · {accountTypeLabel(account.accountType)}
                    {account.imported ? "" : " · extrato não importado"}
                  </span>
                </TableCell>
                <TableCell className={cn(TD, NUM)}>{brl(account.opening)}</TableCell>
                <TableCell className={cn(TD, NUM, "text-[#047857]")}>{brl(account.income)}</TableCell>
                <TableCell className={cn(TD, NUM)}>{brl(account.expense)}</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(account.closing)}</TableCell>
                <TableCell className={cn(TD, NUM)}>{brl(account.bySystem)}</TableCell>
                <TableCell className={cn(TD, NUM, pending ? "font-semibold text-[#b45309]" : "text-muted-foreground")}>
                  {pending ? brl(account.toCheck) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className={cn(TD, "font-semibold")}>Consolidado</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.opening)}</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.income)}</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.expense)}</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.closing)}</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.bySystem)}</TableCell>
            <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.total.toCheck)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
