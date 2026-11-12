"use client";

import { FileUp, Landmark } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/ReasonDialog";
import { CARD, ErrorBox, Field, NUM, PageHeader, TD, TH, Tag } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, listRecords } from "@/lib/api";
import {
  PAGE_SIZE,
  SITUATION_LABELS,
  bankLine,
  importedText,
  listStatements,
  listTransactions,
  situationOf,
  undoReconciliation,
  type LineSituation,
  type StatementRow,
  type Transaction,
  type TransactionList,
} from "@/lib/bank";
import { brl, formatDate, formatDateTime, plural, type RecordRow } from "@/lib/payables";
import { cn } from "@/lib/utils";
import { ImportStatementDialog } from "./import-statement-dialog";
import { ReconcileDialog } from "./reconcile-dialog";

function Tile({ label, value, tone }: { label: string; value: string; tone?: "verde" | "vermelho" }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "block text-lg font-semibold tabular-nums text-brand-cinza-escuro",
          tone === "verde" && "text-[#047857]",
          tone === "vermelho" && "text-[#b91c1c]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function BankReconciliationPage() {
  const [accounts, setAccounts] = useState<RecordRow[] | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransactionList | null>(null);
  const [history, setHistory] = useState<StatementRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [situation, setSituation] = useState<LineSituation | null>(null);
  const [reconciling, setReconciling] = useState<Transaction | null>(null);
  const [undoing, setUndoing] = useState<Transaction | null>(null);

  useEffect(() => {
    listRecords("bankAccounts").then(
      (rows) => {
        const active = rows.filter((row) => row.active);
        setAccounts(active);
        setAccountId((current) => current ?? active[0]?.id ?? null);
      },
      (err) => {
        setAccounts([]);
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar as contas bancárias");
      }
    );
  }, []);

  const load = useCallback(async () => {
    if (accountId === null) return;
    setError(null);
    try {
      const [transactions, statements] = await Promise.all([
        listTransactions(accountId, { start, end, page, situation }),
        listStatements(accountId),
      ]);
      setData(transactions);
      setHistory(statements);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o extrato");
    }
  }, [accountId, start, end, page, situation]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando a conta, o período ou a página muda
    void load();
  }, [load]);

  const account = accounts?.find((row) => row.id === accountId) ?? null;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Conferência bancária"
        icon={Landmark}
        subtitle="Importe o extrato do banco e veja as linhas de cada conta. A conciliação com as contas a pagar vem na próxima etapa."
        actions={
          <Button onClick={() => setImporting(true)} disabled={!account}>
            <FileUp size={16} />
            Importar extrato
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      {accounts === null ? (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      ) : !accounts.length ? (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhuma conta bancária ativa.{" "}
          <Link className="font-semibold text-brand-azul-deep underline" href="/cadastros?aba=bankAccounts">
            Cadastre uma conta
          </Link>{" "}
          para importar o extrato.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Conta bancária" id="conta-extrato">
              <Select
                value={accountId === null ? undefined : String(accountId)}
                onValueChange={(next) => {
                  setAccountId(Number(next));
                  setData(null);
                  setHistory([]);
                  setSituation(null);
                  setPage(1);
                }}
              >
                <SelectTrigger id="conta-extrato" className="w-[320px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((row) => (
                    <SelectItem key={row.id} value={String(row.id)}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {account && <p className="pb-2 text-xs text-muted-foreground">{bankLine(account)}</p>}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Linhas no período" value={data ? String(data.total) : "—"} />
            <Tile label="Entradas" value={data ? brl(data.income) : "—"} tone="verde" />
            <Tile label="Saídas" value={data ? brl(data.expense) : "—"} tone="vermelho" />
          </div>

          <div className={CARD}>
            <div className="flex flex-wrap items-end gap-3 px-4 py-4">
              <Field label="De" id="extrato-de">
                <Input
                  id="extrato-de"
                  type="date"
                  value={start}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
              <Field label="Até" id="extrato-ate">
                <Input
                  id="extrato-ate"
                  type="date"
                  value={end}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
              {(start || end) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStart("");
                    setEnd("");
                    setPage(1);
                  }}
                >
                  Limpar período
                </Button>
              )}
            </div>

            {data && (
              <Tabs
                value={situation ?? "todas"}
                onValueChange={(next) => {
                  setSituation(next === "todas" ? null : (next as LineSituation));
                  setPage(1);
                }}
                className="px-4 pb-3"
              >
                <TabsList>
                  <TabsTrigger value="todas">
                    Todas {data.counts.pending + data.counts.reconciled + data.counts.exceptions}
                  </TabsTrigger>
                  <TabsTrigger value="pendente">Pendentes {data.counts.pending}</TabsTrigger>
                  <TabsTrigger value="conciliada">Conciliadas {data.counts.reconciled}</TabsTrigger>
                  <TabsTrigger value="excecao">Exceções {data.counts.exceptions}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {!data ? (
              !error && (
                <div className="flex justify-center p-8">
                  <Spinner aria-label="Carregando o extrato" className="size-6 text-brand-cinza-escuro/70" />
                </div>
              )
            ) : data.items.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Data</TableHead>
                      <TableHead className={TH}>Descrição</TableHead>
                      <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      <TableHead className={TH}>Situação</TableHead>
                      <TableHead className={TH} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((line) => {
                      const state = situationOf(line);
                      const done = line.reconciliation;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className={cn(TD, "whitespace-nowrap")}>{formatDate(line.postedOn)}</TableCell>
                          <TableCell className={cn(TD, "whitespace-normal")}>{line.description}</TableCell>
                          <TableCell className={cn(TD, NUM, Number(line.amount) < 0 && "text-[#b91c1c]")}>
                            {brl(line.amount)}
                          </TableCell>
                          <TableCell className={cn(TD, "whitespace-normal")}>
                            <Tag color={state === "pendente" ? "ambar" : state === "conciliada" ? "verde" : "cinza"}>
                              {SITUATION_LABELS[state]}
                            </Tag>
                            {done && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {done.label}
                                {done.classificationLabel ? ` · ${done.classificationLabel}` : ""}
                                {done.nfNumber ? ` · NF ${done.nfNumber}` : ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={cn(TD, "text-right")}>
                            {done ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Desfazer a conciliação de ${line.description}`}
                                onClick={() => setUndoing(line)}
                              >
                                Desfazer
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Conciliar ${line.description}`}
                                onClick={() => setReconciling(line)}
                              >
                                Conciliar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
                  <span>
                    {plural(data.total, "linha", "linhas")} · página {data.page} de {pages}
                  </span>
                  <span className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pages}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Próxima
                    </Button>
                  </span>
                </div>
              </>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {situation
                  ? "Nenhuma linha nessa situação."
                  : start || end
                    ? "Nenhuma linha do extrato nesse período."
                    : "Nenhum extrato importado nesta conta ainda. Use Importar extrato."}
              </p>
            )}
          </div>

          {history.length > 0 && (
            <section className="mt-6" aria-label="Extratos importados">
              <h2 className="mb-2 text-sm font-semibold text-brand-cinza-escuro">Extratos importados</h2>
              <div className={CARD}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Arquivo</TableHead>
                      <TableHead className={TH}>Período</TableHead>
                      <TableHead className={cn(TH, NUM)}>Novas</TableHead>
                      <TableHead className={cn(TH, NUM)}>Já estavam</TableHead>
                      <TableHead className={TH}>Importado por</TableHead>
                      <TableHead className={TH}>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className={TD}>{row.filename}</TableCell>
                        <TableCell className={cn(TD, "whitespace-nowrap")}>
                          {formatDate(row.periodStart)} a {formatDate(row.periodEnd)}
                        </TableCell>
                        <TableCell className={cn(TD, NUM)}>{row.newLines}</TableCell>
                        <TableCell className={cn(TD, NUM)}>{row.duplicateLines}</TableCell>
                        <TableCell className={TD}>{row.importedBy ?? "—"}</TableCell>
                        <TableCell className={cn(TD, "whitespace-nowrap")}>{formatDateTime(row.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}

      {reconciling && (
        <ReconcileDialog
          line={reconciling}
          onClose={() => setReconciling(null)}
          onDone={(message) => {
            setReconciling(null);
            toast.success(message);
            void load();
          }}
        />
      )}

      {undoing && (
        <ReasonDialog
          title="Desfazer a conciliação"
          description={`A linha "${undoing.description}" volta a ficar pendente. Quem desfez e o motivo ficam no histórico.`}
          confirm="Desfazer"
          destructive
          onClose={() => setUndoing(null)}
          onConfirm={async (why) => {
            await undoReconciliation(undoing.id, why);
            setUndoing(null);
            toast.success("Conciliação desfeita.");
            void load();
          }}
        />
      )}

      {importing && account && (
        <ImportStatementDialog
          accountId={account.id}
          accountName={account.name}
          onClose={() => setImporting(false)}
          onDone={(result) => {
            setImporting(false);
            toast.success(importedText(result));
            setPage(1);
            void load();
          }}
        />
      )}
    </main>
  );
}
