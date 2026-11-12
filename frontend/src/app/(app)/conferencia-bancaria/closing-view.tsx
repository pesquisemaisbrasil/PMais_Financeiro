"use client";

import { FileSpreadsheet, Info, Lock, LockOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/ReasonDialog";
import { CARD, ErrorBox, TD, TH, Tag } from "@/components/finance";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  closeMonth,
  closingBlockers,
  downloadAccountingSheet,
  getClosingStatus,
  monthLabel,
  reopenMonth,
  sheetFileName,
  type ClosingCompany,
  type ClosingStatus,
} from "@/lib/bank-month";
import { saveBlob } from "@/lib/documents";
import { formatDate, plural } from "@/lib/payables";
import { cn } from "@/lib/utils";

/**
 * Fechamento do mês: por empresa, fecha quando todas as linhas do extrato estão conferidas (a
 * exceção conta) e classificadas. Fechado, ninguém dá baixa, estorna, recebe nem lança com data
 * daquele mês; só um administrador reabre, com motivo. A planilha da contabilidade sai a qualquer hora.
 */
export function ClosingView({ month }: { month: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<ClosingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<ClosingCompany | null>(null);
  const [reopening, setReopening] = useState<{ id: number; name: string; month: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getClosingStatus(month));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o fechamento");
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando o mês muda
    void load();
  }, [load]);

  async function confirmClose(company: ClosingCompany) {
    setBusy(`close-${company.id}`);
    try {
      await closeMonth(company.id, month);
      toast.success(`${monthLabel(month)} da ${company.name} fechado. Baixe a planilha para a contabilidade.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível fechar o mês agora");
    } finally {
      setBusy(null);
      setClosing(null);
      void load();
    }
  }

  async function sheet(company: { id: number; name: string }) {
    setBusy(`sheet-${company.id}`);
    try {
      saveBlob(await downloadAccountingSheet(company.id, month), sheetFileName(company.name, month));
      toast.success("Planilha da contabilidade baixada.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível baixar a planilha agora");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner aria-label="Carregando o fechamento" className="size-6 text-brand-cinza-escuro/70" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Info size={16} aria-hidden />
        <AlertTitle>Como fecha</AlertTitle>
        <AlertDescription>
          O mês fecha por empresa quando todas as linhas do extrato estão conferidas (ou são exceção) e classificadas.
          Fechado, ninguém dá baixa, estorna, recebe nem lança com data daquele mês. Só um administrador reabre, com motivo.
        </AlertDescription>
      </Alert>

      {data.companies.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.companies.map((company) => {
            const blockers = closingBlockers(company);
            return (
              <section key={company.id} aria-label={`${company.name} · ${monthLabel(month)}`} className={cn(CARD, "p-4")}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-brand-cinza-escuro">
                    {company.name} · {monthLabel(month)}
                  </h2>
                  {company.closed ? (
                    <Tag color="verde" icon={Lock}>
                      Fechado
                    </Tag>
                  ) : (
                    <Tag color="cinza" icon={LockOpen}>
                      Aberto
                    </Tag>
                  )}
                </div>

                <ul className="my-3 flex flex-col gap-1 pl-4 text-[13px] [&>li]:list-disc">
                  <li className={company.notImported.length ? "text-[#b91c1c]" : undefined}>
                    {company.notImported.length
                      ? `Extrato não importado: ${company.notImported.join(", ")}`
                      : plural(company.lines, "linha no extrato", "linhas no extrato")}
                  </li>
                  <li className={company.withoutPair ? "text-[#b45309]" : "text-[#047857]"}>
                    {company.withoutPair
                      ? plural(company.withoutPair, "linha sem conferir", "linhas sem conferir")
                      : "Todas conferidas"}
                  </li>
                  <li className={company.withoutClassification ? "text-[#b45309]" : "text-[#047857]"}>
                    {company.withoutClassification
                      ? plural(company.withoutClassification, "linha sem classificação", "linhas sem classificação")
                      : "Todas classificadas"}
                  </li>
                </ul>

                {company.closed && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Fechado em {formatDate(company.closedAt)} por {company.closedBy ?? "—"}.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {company.closed ? (
                    isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReopening({ id: company.id, name: company.name, month })}
                      >
                        <LockOpen size={14} />
                        Reabrir (administrador)
                      </Button>
                    )
                  ) : (
                    <Button
                      size="sm"
                      disabled={!company.ready || busy !== null}
                      onClick={() => setClosing(company)}
                    >
                      <Lock size={14} />
                      Fechar {monthLabel(month)}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void sheet(company)}
                  >
                    {busy === `sheet-${company.id}` ? (
                      <Spinner aria-label="Preparando" className="size-4" />
                    ) : (
                      <FileSpreadsheet size={14} />
                    )}
                    Planilha da contabilidade
                  </Button>
                </div>
                {!company.closed && !company.ready && (
                  <p role="status" className="mt-2 text-xs text-muted-foreground">
                    Resolva as pendências acima para fechar{blockers.length ? ` (${blockers.join("; ")})` : ""}.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhuma empresa tem conta bancária cadastrada.
        </div>
      )}

      <section aria-label="Meses fechados" className={CARD}>
        <h2 className="px-4 pt-4 text-sm font-semibold text-brand-cinza-escuro">Meses fechados</h2>
        {data.closings.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Empresa</TableHead>
                <TableHead className={TH}>Mês</TableHead>
                <TableHead className={TH}>Fechado em</TableHead>
                <TableHead className={TH}>Por</TableHead>
                <TableHead className={TH} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.closings.map((row) => (
                <TableRow key={`${row.companyId}-${row.month}`}>
                  <TableCell className={cn(TD, "font-semibold")}>{row.company}</TableCell>
                  <TableCell className={TD}>{monthLabel(row.month)}</TableCell>
                  <TableCell className={TD}>{formatDate(row.closedAt)}</TableCell>
                  <TableCell className={TD}>{row.closedBy ?? "—"}</TableCell>
                  <TableCell className={cn(TD, "text-right")}>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Reabrir ${monthLabel(row.month)} da ${row.company}`}
                        onClick={() => setReopening({ id: row.companyId, name: row.company, month: row.month })}
                      >
                        Reabrir (administrador)
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum mês fechado ainda.</p>
        )}
      </section>

      {closing && (
        <AlertDialog open onOpenChange={(open) => !open && busy === null && setClosing(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Fechar {monthLabel(month)} da {closing.name}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Depois de fechado, ninguém lança, baixa ou estorna com data de {monthLabel(month)} na {closing.name}. Só um
                administrador reabre.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy !== null}>Voltar</AlertDialogCancel>
              <Button disabled={busy !== null} onClick={() => void confirmClose(closing)}>
                Fechar o mês
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {reopening && (
        <ReasonDialog
          title={`Reabrir ${monthLabel(reopening.month)} da ${reopening.name}`}
          description="Só administrador. O motivo fica no histórico, com o seu nome."
          confirm="Reabrir"
          destructive
          onClose={() => setReopening(null)}
          onConfirm={async (reason) => {
            await reopenMonth(reopening.id, reopening.month, reason);
            toast.success(`${monthLabel(reopening.month)} reaberto.`);
            setReopening(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
