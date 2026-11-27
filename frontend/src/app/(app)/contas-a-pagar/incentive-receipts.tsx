"use client";

import { CheckCheck, X } from "lucide-react";
import { useState } from "react";
import { Field, FormError, NUM, TD, TH, Tag } from "@/components/finance";
import { FilePicker } from "@/components/FilePicker";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { confirmIncentiveReceipts, previewIncentiveReceipts } from "@/lib/api";
import { brl, formatDate, plural, type PayableRow, type ReceiptMatch, type Reference } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

const STATUS_COLOR = {
  bate: "verde",
  valor_diferente: "vermelho",
  sem_comprovante: "ambar",
  sem_chave: "vermelho",
} as const;

/**
 * Baixa do lançamento de incentivos pelos comprovantes Pix (pedido do Bruno, 27/11/2026): os PDFs do Itaú são
 * conferidos contra as pessoas, pela chave e pelo valor, e a baixa só libera quando todas batem e a soma fecha com a
 * conta. Confirmar grava um Pix por pessoa e anexa o comprovante de cada uma nela. O PDF é lido e não fica guardado
 * inteiro: fica só a página de cada pessoa, nos documentos da conta.
 */
export function IncentiveReceiptsDialog({
  row,
  reference,
  onClose,
  onDone,
}: {
  row: PayableRow;
  reference: Reference;
  onClose: () => void;
  onDone: (count: number, total: string) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [files, setFiles] = useState<File[]>([]);
  const [match, setMatch] = useState<ReceiptMatch | null>(null);
  const [confirming, setConfirming] = useState(false);
  const companyId = reference.companies.find((company) => company.name === row.companyName)?.id;
  const accounts = reference.bankAccounts.filter((account) => account.companyId === companyId);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? String(accounts[0].id) : "");

  function pick(chosen: File[]) {
    // outro arquivo muda a conferência: ela é refeita
    setFiles((current) => [...current, ...chosen.filter((file) => !current.some((f) => f.name === file.name))]);
    setMatch(null);
  }

  function remove(name: string) {
    setFiles((current) => current.filter((file) => file.name !== name));
    setMatch(null);
  }

  async function check() {
    await run(async () => setMatch(await previewIncentiveReceipts(row.id, files)));
  }

  async function confirm() {
    setConfirming(false);
    await run(async () => {
      const result = await confirmIncentiveReceipts(row.id, files, Number(accountId));
      onDone(result.count, result.total);
    });
  }

  const ready = Boolean(match?.ready) && Boolean(accountId);

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Baixar pelos comprovantes</DialogTitle>
          <DialogDescription>
            {row.description} · {brl(row.pending)} em aberto. Envie os comprovantes Pix do Itaú: cada um é casado com a
            pessoa pela chave, e a baixa só sai quando todas as pessoas em aberto batem.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 py-2">
          <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
            <Field label="Comprovantes Pix (PDF) *" id="ir-arquivos" hint="Um ou mais PDFs, até 25 MB juntos">
              <FilePicker
                id="ir-arquivos"
                accept=".pdf"
                multiple
                disabled={submitting}
                status={files.length ? plural(files.length, "arquivo", "arquivos") : undefined}
                onPick={pick}
              />
            </Field>
            <Field label="Conta bancária *" id="ir-conta">
              <Choice
                id="ir-conta"
                value={accountId}
                onChange={setAccountId}
                options={accounts.map((account) => ({ id: account.id, label: account.name }))}
              />
            </Field>
          </div>
          {files.length > 0 && (
            <ul aria-label="Arquivos escolhidos" className="flex flex-wrap gap-2">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs">
                  {file.name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Tirar ${file.name}`}
                    disabled={submitting}
                    onClick={() => remove(file.name)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {match && (
            <>
              <p className="text-[13px]">
                <strong>
                  {match.matched} de {plural(match.count, "pessoa batem", "pessoas batem")}
                </strong>{" "}
                · comprovantes somam {brl(match.receiptsTotal)} de {brl(match.pending)}
              </p>
              {Boolean(match.ignored) && (
                <p className="text-xs text-muted-foreground">
                  {plural(match.ignored ?? 0, "comprovante", "comprovantes")} de quem já foi pago neste lançamento
                  {match.ignored === 1 ? " ficou" : " ficaram"} de fora da conferência.
                </p>
              )}
              {match.ready ? (
                <Alert>
                  <AlertTitle>Tudo bate</AlertTitle>
                  <AlertDescription>Cada pessoa tem o seu comprovante, e a soma fecha com a conta.</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>A baixa ainda não pode sair</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {match.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <Table aria-label="Pessoas do lançamento">
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Pessoa</TableHead>
                    <TableHead className={TH}>Chave Pix</TableHead>
                    <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                    <TableHead className={cn(TH, NUM)}>Comprovante</TableHead>
                    <TableHead className={TH}>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {match.items.map((item) => (
                    <TableRow key={item.itemId}>
                      <TableCell className={cn(TD, "min-w-[130px] whitespace-normal")}>{item.name}</TableCell>
                      <TableCell className={TD}>{item.pixMasked ?? "—"}</TableCell>
                      <TableCell className={cn(TD, NUM)}>{brl(item.amount)}</TableCell>
                      <TableCell className={cn(TD, NUM, "whitespace-normal")}>
                        {item.receiptAmount ? brl(item.receiptAmount) : "—"}
                        {item.file && (
                          <span className="block text-xs text-muted-foreground">
                            <span className="break-all">{item.file}</span>, pág. {item.page}
                            {item.paidOn && <span className="whitespace-nowrap"> · {formatDate(item.paidOn)}</span>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={TD}>
                        <Tag color={STATUS_COLOR[item.status]}>{item.statusText}</Tag>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {match.extras.length > 0 && (
                <Table aria-label="Comprovantes que não entram">
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Comprovante que não entra</TableHead>
                      <TableHead className={TH}>Chave Pix</TableHead>
                      <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      <TableHead className={TH}>Por quê</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {match.extras.map((extra) => (
                      <TableRow key={`${extra.file}-${extra.page}`}>
                        <TableCell className={cn(TD, "min-w-[160px] whitespace-normal break-all")}>
                          {extra.file}, pág. {extra.page}
                          {extra.payeeName && <span className="block text-xs text-muted-foreground">{extra.payeeName}</span>}
                        </TableCell>
                        <TableCell className={TD}>{extra.pixMasked ?? "—"}</TableCell>
                        <TableCell className={cn(TD, NUM)}>{extra.amount ? brl(extra.amount) : "—"}</TableCell>
                        <TableCell className={cn(TD, "min-w-[180px] whitespace-normal")}>{extra.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          {!match?.ready && (
            <Button type="button" disabled={submitting || files.length === 0} onClick={check}>
              {submitting ? "Conferindo…" : "Conferir comprovantes"}
            </Button>
          )}
          {match?.ready && (
            <Button
              type="button"
              disabled={!ready || submitting}
              className="bg-brand-verde text-[#053d27] hover:bg-[#00b56b]"
              onClick={() => setConfirming(true)}
            >
              <CheckCheck size={16} />
              {submitting ? "Baixando…" : "Confirmar baixa"}
            </Button>
          )}
        </DialogFooter>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar baixa?</AlertDialogTitle>
              <AlertDialogDescription>
                {match
                  ? `Vamos dar baixa em ${plural(match.count, "pessoa", "pessoas")}, total ${brl(match.pending)}, um Pix para cada uma, e anexar o comprovante de cada pessoa nela. Depois, só estornando.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={confirm}>Confirmar baixa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
