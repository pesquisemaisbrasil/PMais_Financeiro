"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorBox, NUM, TD, TH, Tag } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import {
  RECURRENCE_KINDS,
  brl,
  formatDate,
  plural,
  type SeriesInfo,
  type SeriesOccurrence,
} from "@/lib/payables";

/**
 * A aba Repetir: todas as ocorrências da série da conta aberta, com a situação de cada uma.
 * Serve ao Contas a pagar e ao a receber; quem usa diz como buscar a lista e como mostrar a situação.
 */
export function SeriesPanel({
  currentId,
  series,
  words,
  load,
  situation,
  actions,
  onOpen,
}: {
  currentId: number;
  series: SeriesInfo;
  /** "conta"/"contas" no Contas a pagar; "título"/"títulos" no a receber. */
  words: [string, string];
  load: (id: number) => Promise<SeriesOccurrence[]>;
  situation: (value: string) => ReactNode;
  /** Botões de alterar e cancelar a série, que o dono da tela sabe montar. */
  actions?: ReactNode;
  onOpen: (id: number) => void;
}) {
  const [rows, setRows] = useState<SeriesOccurrence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    load(currentId).then(
      (list) => live && setRows(list),
      (err) => live && setError(err instanceof ApiError ? err.message : "Não foi possível abrir a série."),
    );
    return () => {
      live = false;
    };
  }, [currentId, attempt, load]);

  const kind = RECURRENCE_KINDS.find((option) => option.id === series.kind)?.label ?? series.kind;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {kind} · {plural(series.count, ...words)}.
          {series.estimated && " Valor estimado: quando a fatura chegar, troque pelo valor real em “Só esta”."}
        </p>
        {actions}
      </div>
      {error ? (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
      ) : !rows ? (
        <div className="flex justify-center p-6">
          <Spinner aria-label="Carregando a série" className="size-5" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>Nº</TableHead>
              <TableHead className={TH}>Vencimento</TableHead>
              <TableHead className={`${TH} text-right`}>Valor</TableHead>
              <TableHead className={TH}>Situação</TableHead>
              <TableHead className={TH} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const here = row.id === currentId;
              return (
                <TableRow key={row.id} data-state={here ? "selected" : undefined}>
                  <TableCell className={`${TD} tabular-nums`}>
                    {row.index}/{series.count}
                  </TableCell>
                  <TableCell className={TD}>{formatDate(row.dueDate)}</TableCell>
                  <TableCell className={`${TD} ${NUM}`}>{brl(row.amount)}</TableCell>
                  <TableCell className={TD}>{situation(row.situation)}</TableCell>
                  <TableCell className={`${TD} text-right`}>
                    {here ? (
                      <Tag color="azul">Aberta aqui</Tag>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => onOpen(row.id)}>
                        Abrir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
