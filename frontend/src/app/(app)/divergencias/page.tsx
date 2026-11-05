"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { CARD, ErrorBox, NUM, PageHeader, TD, TH } from "@/components/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { brl, formatDate } from "@/lib/payables";
import { listDivergences, type Divergence } from "@/lib/receipts";

export default function DivergencesPage() {
  const [rows, setRows] = useState<Divergence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listDivergences()
      .then((list) => {
        if (!live) return;
        setError(null);
        setRows(list);
      })
      .catch((err) => live && setError(err instanceof ApiError ? err.message : "Não foi possível carregar."));
    return () => {
      live = false;
    };
  }, [attempt]);

  function retry() {
    setRows(null);
    setAttempt((n) => n + 1);
  }

  return (
    <main className="p-6">
      <PageHeader
        overline="Financeiro"
        title="Divergências"
        icon={TriangleAlert}
        subtitle="Baixas que o P+ Connect recusou. O Pix já saiu do banco, mas o Connect não aceitou marcar as entrevistas como pagas: nada é corrigido sozinho. Confira com o time do Connect e decida o que fazer."
      />
      {error && <ErrorBox message={error} onRetry={retry} />}
      {!error && rows === null && <Skeleton className="h-32 w-full rounded-2xl" />}
      {rows && rows.length === 0 && (
        <div className={`${CARD} px-6 py-10 text-center text-sm text-muted-foreground`}>
          Nenhuma divergência. Toda baixa enviada ao Connect foi aceita.
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className={`${CARD} overflow-x-auto`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Projeto</TableHead>
                <TableHead className={TH}>Pix de</TableHead>
                <TableHead className={`${TH} text-right`}>Valor</TableHead>
                <TableHead className={TH}>Pix em</TableHead>
                <TableHead className={TH}>O que o Connect disse</TableHead>
                <TableHead className={TH}>Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.paymentRef}>
                  <TableCell className={TD}>{row.projectTitle}</TableCell>
                  <TableCell className={TD}>{row.keyMasked ?? "—"}</TableCell>
                  <TableCell className={`${TD} ${NUM}`}>{row.amount ? brl(row.amount) : "—"}</TableCell>
                  <TableCell className={TD}>{formatDate(row.paidOn)}</TableCell>
                  <TableCell className={TD}>{row.message}</TableCell>
                  <TableCell className={`${TD} font-mono text-xs`}>{row.paymentRef}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
