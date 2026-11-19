"use client";

import { FileUp } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Field, FormError, NUM, TD, TH, Tag } from "@/components/finance";
import { FilePicker } from "@/components/FilePicker";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importReport, previewReport } from "@/lib/api";
import {
  openForLaunch,
  brl,
  expenseCategories,
  formatDate,
  plural,
  type Reference,
  type ReportPreview,
  type ReportResult,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

/** Nenhum padrão marcado: vale só o que o relatório diz. */
const NONE = "nenhum";

function Count({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">{label}</span>
      <span className="block text-[15px] font-bold tabular-nums">{value}</span>
      {detail && <span className="block text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

/**
 * Importar o relatório "Lançamentos a Pagar" do sistema antigo: cada linha vira uma conta e a paga entra com
 * a baixa. Os campos da tela são padrões, para o que o relatório não diz (ou diz com um nome que não existe
 * nos cadastros). Conferir antes não grava nada; reenviar o relatório só cria o que faltava.
 */
export function ReportImport({
  reference,
  typeField,
  onClose,
  onDone,
}: {
  reference: Reference;
  /** O campo Tipo da janela de importação, para a pessoa poder voltar aos outros tipos. */
  typeField: ReactNode;
  onClose: () => void;
  onDone: (result: ReportResult) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [form, setForm] = useState({
    paymentMethodId: "",
    unitId: "",
    costCenterId: "",
    categoryId: "",
    projectId: "",
    bankAccountId: "",
    registerPayments: true,
  });
  const choose = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value === NONE ? "" : value }));

  function formData(): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (key === "registerPayments") data.set(key, String(value));
      else if (value) data.set(key, String(value));
    }
    if (file) data.set("file", file);
    return data;
  }

  async function read(event: FormEvent) {
    event.preventDefault();
    if (!file) return setLocalError("Escolha o relatório.");
    setLocalError(null);
    await run(async () => setPreview(await previewReport(formData())));
  }

  const companyName = (companyId: number) => reference.companies.find((c) => c.id === companyId)?.name ?? "";
  const optional = (label: string) => [{ id: NONE, label }];
  const lines = preview?.lines ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", preview ? "sm:max-w-[1040px]" : "sm:max-w-[820px]")}>
        {!preview ? (
          <form onSubmit={read} noValidate>
            <DialogHeader>
              <DialogTitle>Importar planilha</DialogTitle>
              <DialogDescription>
                O relatório “Lançamentos a Pagar” do sistema antigo vira uma conta por linha. Ele é conferido antes de
                criar qualquer conta, é lido e não fica guardado.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">{typeField}</div>
              <p className="text-xs text-muted-foreground">
                Os campos abaixo são <strong>padrões</strong>: valem quando o relatório não traz a informação ou traz um
                nome que não existe nos cadastros. A empresa vem da unidade. Fornecedor que não existe entra só com o
                nome, e projeto que não existe fica em branco, para você completar depois.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Forma de pagamento"
                  id="r-forma"
                  hint="Marque uma: o relatório do sistema antigo não traz essa coluna."
                >
                  <Choice
                    id="r-forma"
                    value={form.paymentMethodId || NONE}
                    onChange={choose("paymentMethodId")}
                    options={[...optional("Nenhuma marcada"), ...reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))]}
                  />
                </Field>
                <Field label="Conta bancária" id="r-conta" hint="Das linhas já pagas, quando a conta do relatório não existe.">
                  <Choice
                    id="r-conta"
                    searchable
                    value={form.bankAccountId || NONE}
                    onChange={choose("bankAccountId")}
                    options={[
                      ...optional("Só a que o relatório diz"),
                      ...reference.bankAccounts.map((a) => ({ id: a.id, label: `${a.name} · ${companyName(a.companyId)}` })),
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Unidade" id="r-unidade" hint="A empresa vem dela.">
                  <Choice
                    id="r-unidade"
                    searchable
                    value={form.unitId || NONE}
                    onChange={choose("unitId")}
                    options={[
                      ...optional("Só a que o relatório diz"),
                      ...reference.units.map((u) => ({ id: u.id, label: `${u.name} · ${companyName(u.companyId)}` })),
                    ]}
                  />
                </Field>
                <Field label="Centro de custo" id="r-centro">
                  <Choice
                    id="r-centro"
                    searchable
                    value={form.costCenterId || NONE}
                    onChange={choose("costCenterId")}
                    options={[...optional("Só o que o relatório diz"), ...reference.costCenters.map((c) => ({ id: c.id, label: c.label }))]}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plano de contas" id="r-plano">
                  <Choice
                    id="r-plano"
                    searchable
                    value={form.categoryId || NONE}
                    onChange={choose("categoryId")}
                    options={[
                      ...optional("Só o que o relatório diz"),
                      ...expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` })),
                    ]}
                  />
                </Field>
                <Field label="Projeto" id="r-projeto" hint="Sem padrão, projeto que não existe fica em branco.">
                  <Choice
                    id="r-projeto"
                    searchable
                    value={form.projectId || NONE}
                    onChange={choose("projectId")}
                    options={[
                      ...optional("Só o que o relatório diz"),
                      ...reference.projects
                        .filter(openForLaunch)
                        .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
                    ]}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="r-baixas"
                  checked={form.registerPayments}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, registerPayments: checked === true }))}
                />
                <Label htmlFor="r-baixas" className="flex-col items-start gap-0.5 text-[13px] font-semibold">
                  Registrar a baixa das contas já pagas
                  <span className="text-xs font-normal text-muted-foreground">
                    A linha com R$ Pago cria também a baixa, com a data de Pagamento e a conta bancária. Desligado, tudo
                    entra a pagar.
                  </span>
                </Label>
              </div>
              <Field
                label="Relatório *"
                id="r-arq"
                hint="O arquivo do relatório Lançamentos a Pagar, do jeito que o sistema antigo exporta (.xls), ou salvo como .xlsx ou .csv. O título pode vir em cima do cabeçalho."
              >
                <FilePicker
                  id="r-arq"
                  accept=".xls,.xlsx,.csv,.html,.htm"
                  status={file?.name}
                  onPick={(files) => setFile(files[0] ?? null)}
                />
              </Field>
              <FormError message={localError ?? error} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                <FileUp size={16} />
                {submitting ? "Lendo…" : "Ler relatório"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Conferir antes de importar</DialogTitle>
              <DialogDescription>{file?.name} · Relatório do sistema antigo</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-2">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                <Count label="Linhas lidas" value={String(lines.length)} />
                <Count label="Entram" value={String(preview.goodCount)} detail={brl(preview.total)} />
                <Count label="Pagas" value={String(preview.paidCount)} detail={`${brl(preview.paidTotal)} com baixa`} />
                <Count label="A pagar" value={String(preview.pendingCount)} detail={brl(preview.pendingTotal)} />
                <Count label="Com erro" value={String(preview.errorCount)} detail="ficam de fora" />
                {preview.alreadyCount > 0 && (
                  <Count label="Já importadas" value={String(preview.alreadyCount)} detail="não se repetem" />
                )}
                {preview.cancelledCount > 0 && (
                  <Count label="Canceladas" value={String(preview.cancelledCount)} detail="ficam de fora" />
                )}
                {preview.supplierOnlyNameCount > 0 && (
                  <Count label="Só com o nome" value={String(preview.supplierOnlyNameCount)} detail="fornecedor sem cadastro" />
                )}
                {preview.noProjectCount > 0 && (
                  <Count label="Sem projeto" value={String(preview.noProjectCount)} detail="completar depois" />
                )}
                {preview.usedDefaultCount > 0 && (
                  <Count label="Padrão usado" value={String(preview.usedDefaultCount)} detail="nome que não existe" />
                )}
              </div>
              {preview.goodCount === 0 && (
                <Alert variant="destructive">
                  <AlertTitle>Nenhuma linha pode entrar</AlertTitle>
                  <AlertDescription>
                    Veja o motivo de cada linha abaixo. Corrija o relatório, cadastre o que falta ou marque um padrão, e
                    leia de novo.
                  </AlertDescription>
                </Alert>
              )}
              <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Linha</TableHead>
                      <TableHead className={TH}>Programação</TableHead>
                      <TableHead className={TH}>Fornecedor</TableHead>
                      <TableHead className={cn(TH, NUM)}>R$ Líquido</TableHead>
                      <TableHead className={TH}>Situação</TableHead>
                      <TableHead className={TH} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.line}>
                        <TableCell className={TD}>{line.line}</TableCell>
                        <TableCell className={cn(TD, "whitespace-nowrap")}>{formatDate(line.scheduled)}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>
                          <span className="font-semibold">{line.supplier || "—"}</span>
                          {line.classification && (
                            <span className="block text-[11px] text-muted-foreground">{line.classification}</span>
                          )}
                          {line.description && (
                            <span className="block text-[11px] text-muted-foreground">{line.description}</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, NUM)}>{line.net ? brl(line.net) : "—"}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal text-xs")}>
                          {line.willPay ? (
                            <>
                              Paga em {formatDate(line.paidOn)}
                              <span className="block text-[11px] text-muted-foreground">
                                {brl(line.paid)} · {line.account}
                              </span>
                            </>
                          ) : (
                            "A pagar"
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>
                          {line.errors.length ? (
                            <span className="text-xs font-semibold text-[#b91c1c]">{line.errors.join("; ")}</span>
                          ) : line.skipped ? (
                            <Tag color="cinza">{line.skipped}</Tag>
                          ) : (
                            <Tag color="verde">Ok</Tag>
                          )}
                          {line.notes.map((note) => (
                            <span key={note} className="mt-0.5 block text-[11px] text-muted-foreground">
                              {note}
                            </span>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <FormError message={error} />
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={submitting} onClick={() => setPreview(null)}>
                Voltar
              </Button>
              <Button
                disabled={preview.goodCount === 0 || submitting}
                onClick={() => run(async () => onDone(await importReport(formData())))}
              >
                <FileUp size={16} />
                Importar {plural(preview.goodCount, "conta", "contas")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
