"use client";

import { Download, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { brl, formatDate, plural, type PayableRow, type Reference } from "@/lib/payables";
import {
  PAYMENT_LABELS,
  RECEIPT_TABS,
  cancelBatch,
  confirmBatch,
  countByTab,
  discardReceipt,
  getBatch,
  listFinanceProjects,
  openBatch,
  splitPdf,
  syncFinanceProjects,
  tabOf,
  totalToPayCents,
  uploadPart,
  type BatchDetail,
  type ConfirmResult,
  type FinanceProject,
  type PdfPart,
  type ReceiptRow,
  type ReceiptTab,
} from "@/lib/receipts";
import { useFormAction } from "@/lib/use-form-action";

type Step = "choose" | "sending" | "review" | "done";

const EMPTY: Record<ReceiptTab, string> = {
  batem: "Nenhum comprovante bate com o que há a pagar.",
  divergentes: "Nada divergente.",
  fora: "Ninguém recebeu fora do projeto.",
  sem_chave: "Todas as chaves estão cadastradas.",
  erros: "Nenhum erro de leitura nem Pix repetido.",
  descartados: "Você não descartou nenhum comprovante.",
};

function Situation({ row }: { row: ReceiptRow }) {
  if (row.payment) {
    const color = row.payment === "aplicada" ? "verde" : row.payment === "recusada" ? "vermelho" : "ambar";
    return (
      <div className="flex flex-col gap-1">
        <Tag color={color}>{PAYMENT_LABELS[row.payment]}</Tag>
        {row.paymentMessage && <span className="text-xs text-muted-foreground">{row.paymentMessage}</span>}
      </div>
    );
  }
  if (row.error) return <span className="text-xs text-red-700">{row.error}</span>;
  if (row.group === "duplicado") return <span className="text-xs text-red-700">Esse Pix já foi pago</span>;
  if (row.group === "fora_do_projeto") return <span className="text-xs">Recebeu sem estar no projeto. Nunca é pago.</span>;
  if (row.group === "chave_nao_cadastrada") return <span className="text-xs">Ninguém tem essa chave no Connect.</span>;
  if (row.reconcileStatus === "bate") {
    return <Tag color="verde">{`Bate com ${plural(row.itemsToPay, "item", "itens")}`}</Tag>;
  }
  return <span className="text-xs">{row.message}</span>;
}

export function ReceiptsDialog({
  payable,
  reference,
  onClose,
  onDone,
}: {
  payable: PayableRow;
  reference: Reference;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [projects, setProjects] = useState<FinanceProject[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [tab, setTab] = useState<ReceiptTab>("batem");
  // Pix e a conta, quando só há uma da empresa, já vêm escolhidos
  const company = reference.companies.find((c) => c.name === payable.companyName);
  const accounts = reference.bankAccounts.filter((a) => a.companyId === company?.id);
  const [bankAccountId, setBankAccountId] = useState(accounts.length === 1 ? String(accounts[0].id) : "");
  const [methodId, setMethodId] = useState(
    String(reference.paymentMethods.find((m) => m.name === "Pix")?.id ?? ""),
  );
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  // O envio em andamento: a parte que falhou é a única reenviada.
  const sending = useRef<{ batchId: number; parts: PdfPart[]; next: number } | null>(null);

  const project = projects?.find((p) => String(p.id) === projectId);

  useEffect(() => {
    let live = true;
    listFinanceProjects()
      .then((list) => live && setProjects(list))
      .catch(() => live && setProjects([]));
    return () => {
      live = false;
    };
  }, []);

  async function bringProjects() {
    await run(async () => {
      const list = await syncFinanceProjects();
      setProjects(list);
      if (list.length === 0) setLocalError("O Connect não trouxe nenhum projeto.");
    });
  }

  async function reload(pid: number, batchId: number) {
    setBatch(await getBatch(pid, batchId));
  }

  async function send() {
    const pid = Number(projectId);
    await run(async () => {
      setStep("sending");
      try {
        if (!sending.current) {
          const parts = await splitPdf(await (file as File).arrayBuffer());
          const opened = await openBatch(pid, parts.length, payable.id);
          sending.current = { batchId: opened.id, parts, next: 0 };
        }
        const current = sending.current;
        setProgress({ done: current.next, total: current.parts.length });
        while (current.next < current.parts.length) {
          await uploadPart(pid, current.batchId, current.next, current.parts[current.next]);
          current.next += 1;
          setProgress({ done: current.next, total: current.parts.length });
        }
        await reload(pid, current.batchId);
        setStep("review");
      } catch (err) {
        // volta para a escolha; reenviar retoma da parte que falhou
        setStep("choose");
        throw err;
      }
    });
  }

  function start() {
    if (!projectId) return setLocalError("Escolha o projeto.");
    if (!file) return setLocalError("Escolha o PDF de comprovantes.");
    setLocalError(null);
    void send();
  }

  async function toggleDiscard(row: ReceiptRow) {
    await run(async () => {
      if (!batch) return;
      await discardReceipt(Number(projectId), batch.id, row.id, row.status !== "descartado");
      await reload(Number(projectId), batch.id);
    });
  }

  async function cancel() {
    await run(async () => {
      if (batch && batch.status !== "confirmado") await cancelBatch(Number(projectId), batch.id);
      onClose();
    });
  }

  async function confirm() {
    setConfirming(false);
    await run(async () => {
      if (!batch) return;
      const done = await confirmBatch(Number(projectId), batch.id, {
        code: code.trim() || undefined,
        bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
        paymentMethodId: methodId ? Number(methodId) : undefined,
      });
      setResult(done);
      await reload(Number(projectId), batch.id);
      setStep("done");
      onDone();
      if (done.paidReceipts > 0) toast.success(`Baixa feita em ${plural(done.paidReceipts, "Pix", "Pix")}.`);
    });
  }

  const rows = batch?.receipts ?? [];
  const counts = countByTab(rows);
  const shown = rows.filter((row) => tabOf(row) === tab);
  const toPayCents = totalToPayCents(rows);
  const outside = counts.fora + counts.sem_chave;
  const needsCode = Boolean(user?.mfaEnabled);
  const ready = Boolean(bankAccountId && methodId && (!needsCode || code.trim()));

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && step !== "sending" && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Enviar comprovantes</DialogTitle>
          <DialogDescription>
            {payable.description}. O PDF é lido e não fica guardado: só valem o que bate com o que há a pagar.
          </DialogDescription>
        </DialogHeader>
        <FormError message={localError ?? error} />

        {step === "choose" && (
          <div className="flex flex-col gap-3.5 py-2">
            <Field label="Projeto *" id="r-proj" hint="Os projetos vêm do Connect.">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Choice
                    id="r-proj"
                    value={projectId}
                    onChange={setProjectId}
                    placeholder={projects === null ? "Carregando…" : "Escolha o projeto"}
                    options={(projects ?? []).map((p) => ({ id: p.id, label: p.title }))}
                  />
                </div>
                <Button type="button" variant="outline" disabled={submitting} onClick={bringProjects}>
                  <Download size={14} /> Trazer do Connect
                </Button>
              </div>
            </Field>
            <Field label="PDF de comprovantes *" id="r-file" hint="O do banco (Comprovante de Transferência). Pode ter centenas de páginas.">
              <FilePicker
                id="r-file"
                accept="application/pdf,.pdf"
                status={file?.name}
                onPick={(files) => {
                  setFile(files[0] ?? null);
                  sending.current = null;
                }}
              />
            </Field>
          </div>
        )}

        {step === "sending" && (
          <div className="flex flex-col gap-3 py-6" role="status">
            <span className="text-sm font-medium">
              Lendo o PDF… parte {Math.min(progress.done + 1, Math.max(progress.total, 1))} de {Math.max(progress.total, 1)}
            </span>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
          </div>
        )}

        {(step === "review" || step === "done") && batch && (
          <div className="flex flex-col gap-3">
            {batch.partErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Algumas partes do PDF não foram lidas</AlertTitle>
                <AlertDescription>
                  {batch.partErrors.map((e) => `Parte ${e.partIndex + 1}: ${e.error}`).join(" · ")}
                </AlertDescription>
              </Alert>
            )}
            {outside > 0 && step === "review" && (
              <Alert>
                <AlertTitle>
                  {plural(outside, "comprovante", "comprovantes")} de {outside === 1 ? "pessoa" : "pessoas"} fora do projeto{project ? ` ${project.title}` : ""}
                </AlertTitle>
                <AlertDescription>Eles nunca são pagos. Confira quem recebeu sem estar na equipe.</AlertDescription>
              </Alert>
            )}
            {step === "done" && result && (
              <Alert>
                <AlertTitle>Envio confirmado</AlertTitle>
                <AlertDescription>
                  {result.paidReceipts === 0
                    ? "Nenhum Pix foi pago."
                    : `${plural(result.paidReceipts, "Pix pago", "Pix pagos")} (${brl(result.paidTotal)}), ${plural(result.paidItems, "item", "itens")}.`}
                  {result.awaitingConnect > 0 &&
                    ` ${plural(result.awaitingConnect, "baixa espera", "baixas esperam")} o Connect responder e ${result.awaitingConnect === 1 ? "será enviada" : "serão enviadas"} de novo sozinha${result.awaitingConnect === 1 ? "" : "s"}.`}
                  {result.refused > 0 &&
                    ` ${plural(result.refused, "baixa foi recusada", "baixas foram recusadas")} pelo Connect: veja a situação de cada Pix abaixo.`}
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={tab} onValueChange={(value) => setTab(value as ReceiptTab)}>
              <TabsList className="h-auto flex-wrap justify-start">
                {RECEIPT_TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label} ({counts[t.id]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{EMPTY[tab]}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Pág.</TableHead>
                    <TableHead className={TH}>Quem recebeu</TableHead>
                    <TableHead className={TH}>Chave</TableHead>
                    <TableHead className={`${TH} text-right`}>Valor</TableHead>
                    <TableHead className={TH}>Pix em</TableHead>
                    <TableHead className={TH}>Situação</TableHead>
                    <TableHead className={TH} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={TD}>{row.page}</TableCell>
                      <TableCell className={TD}>{row.name ?? "—"}</TableCell>
                      <TableCell className={TD}>{row.keyMasked ?? "—"}</TableCell>
                      <TableCell className={`${TD} ${NUM}`}>{row.amount ? brl(row.amount) : "—"}</TableCell>
                      <TableCell className={TD}>{row.paidOn ? formatDate(row.paidOn) : "—"}</TableCell>
                      <TableCell className={TD}>
                        <Situation row={row} />
                      </TableCell>
                      <TableCell className={`${TD} text-right`}>
                        {step === "review" && row.status !== "pago" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={submitting}
                            onClick={() => toggleDiscard(row)}
                          >
                            {row.status === "descartado" ? (
                              <>
                                <RotateCcw size={14} /> Restaurar
                              </>
                            ) : (
                              <>
                                <Undo2 size={14} /> Descartar
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {step === "review" && (
              <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
                <Field label="Conta de onde saiu o dinheiro *" id="r-conta">
                  <Choice
                    id="r-conta"
                    value={bankAccountId}
                    onChange={setBankAccountId}
                    options={accounts.map((a) => ({ id: a.id, label: a.name }))}
                  />
                </Field>
                <Field label="Forma de pagamento *" id="r-forma">
                  <Choice
                    id="r-forma"
                    value={methodId}
                    onChange={setMethodId}
                    options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </Field>
                {needsCode && (
                  <Field label="Código do autenticador *" id="r-code" hint="Para confirmar um pagamento.">
                    <Input
                      id="r-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "choose" && (
            <>
              <Button variant="outline" disabled={submitting} onClick={cancel}>
                Cancelar
              </Button>
              <Button disabled={submitting} onClick={start}>
                Ler comprovantes
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" disabled={submitting} onClick={cancel}>
                Cancelar envio
              </Button>
              <Button disabled={submitting || !ready} onClick={() => setConfirming(true)}>
                Confirmar baixa
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={onClose}>Fechar</Button>}
        </DialogFooter>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar baixa?</AlertDialogTitle>
              <AlertDialogDescription>
                {toPayCents > 0
                  ? `Vamos dar baixa em ${plural(counts.batem, "Pix", "Pix")}, total ${brl(toPayCents / 100)}. Quem não bate, está fora do projeto ou foi descartado não é pago. Depois de confirmar, não dá para desfazer aqui.`
                  : "Nenhum comprovante bate com o que há a pagar. O envio será encerrado sem pagar nada."}
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
