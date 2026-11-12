"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { FilePicker } from "@/components/FilePicker";
import { Field, FormError, NUM, TD, TH } from "@/components/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import {
  STATEMENT_ACCEPT,
  STATEMENT_HINT,
  checkStatement,
  importLabel,
  importStatement,
  previewStatement,
  type StatementPreview,
  type StatementResult,
} from "@/lib/bank";
import { brl, formatDate, formatDateTime } from "@/lib/payables";
import { cn } from "@/lib/utils";

function Count({ label, value, tone }: { label: string; value: string; tone?: "verde" | "vermelho" }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "block text-[15px] font-bold tabular-nums",
          tone === "verde" && "text-[#047857]",
          tone === "vermelho" && "text-[#b91c1c]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Importar o extrato de uma conta: escolher o arquivo, conferir o que entra (linhas novas e as que
 * já estavam) e só então gravar. Nada é gravado antes do botão final, e o arquivo não fica guardado.
 */
export function ImportStatementDialog({
  accountId,
  accountName,
  onClose,
  onDone,
}: {
  accountId: number;
  accountName: string;
  onClose: () => void;
  onDone: (result: StatementResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: File[]) {
    const chosen = files[0];
    if (!chosen) return;
    setError(null);
    setPreview(null);
    setFile(chosen);
    const refusal = checkStatement(chosen);
    if (refusal) return setError(refusal);
    setBusy("Lendo o extrato…");
    try {
      setPreview(await previewStatement(accountId, chosen));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível ler o extrato agora. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!file || !preview) return;
    setError(null);
    setBusy("Importando…");
    try {
      onDone(await importStatement(accountId, file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível importar o extrato agora. Tente de novo.");
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Importar extrato · {accountName}</DialogTitle>
          <DialogDescription>
            Escolha o arquivo do banco e confira o que entra. Nada é gravado antes do botão final, e as linhas que já
            estão na conta não se repetem.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 py-4">
          <Field label="Extrato do banco" id="extrato-arquivo" hint={`${STATEMENT_HINT}.`}>
            <FilePicker
              id="extrato-arquivo"
              accept={STATEMENT_ACCEPT}
              disabled={busy !== null}
              status={file?.name}
              onPick={(files) => void pick(files)}
            />
          </Field>

          {busy && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner aria-label="Aguarde" className="size-4" />
              {busy}
            </p>
          )}
          <FormError message={error} />

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Count label="Linhas no arquivo" value={String(preview.lines)} />
                <Count label="Linhas novas" value={String(preview.newLines)} />
                <Count label="Já estavam" value={String(preview.duplicateLines)} />
                <Count label="Período" value={`${formatDate(preview.periodStart)} a ${formatDate(preview.periodEnd)}`} />
              </div>
              {preview.newLines > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Count label="Entradas novas" value={brl(preview.income)} tone="verde" />
                  <Count label="Saídas novas" value={brl(preview.expense)} tone="vermelho" />
                </div>
              )}
              {preview.alreadyImportedAt && (
                <Alert>
                  <AlertDescription>
                    Este mesmo arquivo já foi importado em {formatDateTime(preview.alreadyImportedAt)}.
                  </AlertDescription>
                </Alert>
              )}
              {preview.warnings.map((warning) => (
                <Alert key={warning} variant="destructive">
                  <TriangleAlert size={16} aria-hidden />
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
              {preview.sample.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-brand-cinza-escuro">
                    {preview.newLines > preview.sample.length
                      ? `As ${preview.sample.length} primeiras linhas novas`
                      : "As linhas novas"}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={TH}>Data</TableHead>
                        <TableHead className={TH}>Descrição</TableHead>
                        <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sample.map((line, index) => (
                        <TableRow key={`${line.postedOn}-${index}`}>
                          <TableCell className={cn(TD, "whitespace-nowrap")}>{formatDate(line.postedOn)}</TableCell>
                          <TableCell className={cn(TD, "whitespace-normal")}>{line.description}</TableCell>
                          <TableCell className={cn(TD, NUM, Number(line.amount) < 0 && "text-[#b91c1c]")}>
                            {brl(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!preview || preview.newLines === 0 || busy !== null} onClick={() => void confirm()}>
            {preview ? importLabel(preview) : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
