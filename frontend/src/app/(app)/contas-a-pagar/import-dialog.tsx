"use client";

import { Copy, FileUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field, FormError, NUM, TD, TH, Tag } from "@/components/finance";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importPayables, previewImport } from "@/lib/api";
import {
  addDays,
  brl,
  formatDate,
  plural,
  scheduleText,
  type ImportPreview,
  type ImportResult,
  type Reference,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "incentivos", label: "Incentivos" },
  { id: "folha", label: "Folha de campo" },
];

function Count({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">{label}</span>
      <span className="block text-[15px] font-bold tabular-nums">{value}</span>
      {detail && <span className="block text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

export function ImportDialog({
  reference,
  today,
  onClose,
  onDone,
}: {
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (result: ImportResult) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [form, setForm] = useState({
    kind: "incentivos",
    projectId: "",
    categoryId: "",
    companyId: "",
    unitId: "",
    costCenterId: "",
    paymentMethodId: "",
    description: "",
    dueDate: addDays(today, 10),
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const payroll = form.kind === "folha";
  const project = reference.projects.find((p) => String(p.id) === form.projectId);

  function formData(): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) {
      // Descrição e vencimento só existem na folha; o incentivo sai do cronograma.
      if (!payroll && (key === "description" || key === "dueDate")) continue;
      if (value) data.set(key, value);
    }
    if (file) data.set("file", file);
    return data;
  }

  async function read(event: FormEvent) {
    event.preventDefault();
    const required = [form.projectId, form.categoryId, form.companyId, form.unitId, form.costCenterId, form.paymentMethodId];
    if (required.some((value) => !value) || (payroll && (!form.description.trim() || !form.dueDate))) {
      return setLocalError("Preencha os campos com *.");
    }
    if (!file) return setLocalError("Escolha a planilha.");
    setLocalError(null);
    await run(async () => setPreview(await previewImport(formData())));
  }

  async function copySchedule(current: ImportPreview) {
    try {
      await navigator.clipboard.writeText(scheduleText(current, project?.code ?? "", project?.title ?? ""));
      toast.success("Cronograma copiado. Cole no e-mail ou no grupo do projeto.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const blocked = !preview || preview.goodCount === 0 || preview.missingDeadline;
  const payableCount = preview ? (payroll ? 1 : preview.groups.length) : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        {!preview ? (
          <form onSubmit={read} noValidate>
            <DialogHeader>
              <DialogTitle>Importar planilha</DialogTitle>
              <DialogDescription>
                A planilha é conferida antes de criar qualquer lançamento. Ela é lida e não fica guardada.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo *" id="i-tipo">
                  <Choice id="i-tipo" value={form.kind} onChange={set("kind")} options={KINDS} />
                </Field>
                <Field label="Projeto *" id="i-proj">
                  <Choice
                    id="i-proj"
                    value={form.projectId}
                    onChange={set("projectId")}
                    options={reference.projects
                      .filter((p) => p.status !== "encerrado")
                      .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Categoria *" id="i-cat">
                  <Choice
                    id="i-cat"
                    value={form.categoryId}
                    onChange={set("categoryId")}
                    options={reference.categories.map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
                  />
                </Field>
                <Field label="Forma de pagamento *" id="i-forma">
                  <Choice
                    id="i-forma"
                    value={form.paymentMethodId}
                    onChange={set("paymentMethodId")}
                    options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Empresa *" id="i-emp">
                  <Choice
                    id="i-emp"
                    value={form.companyId}
                    onChange={(value) => setForm((current) => ({ ...current, companyId: value, unitId: "" }))}
                    options={reference.companies.map((c) => ({ id: c.id, label: c.name }))}
                  />
                </Field>
                <Field label="Unidade *" id="i-uni">
                  <Choice
                    id="i-uni"
                    value={form.unitId}
                    onChange={set("unitId")}
                    placeholder={form.companyId ? "Selecione" : "Escolha a empresa"}
                    options={reference.units
                      .filter((u) => String(u.companyId) === form.companyId)
                      .map((u) => ({ id: u.id, label: u.name }))}
                  />
                </Field>
                <Field label="Centro de custo *" id="i-cc">
                  <Choice
                    id="i-cc"
                    value={form.costCenterId}
                    onChange={set("costCenterId")}
                    options={reference.costCenters.map((c) => ({ id: c.id, label: c.name }))}
                  />
                </Field>
              </div>
              {payroll && (
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Descrição *" id="i-desc">
                    <Input
                      id="i-desc"
                      maxLength={200}
                      placeholder="Ex.: Equipe de campo · novembro"
                      value={form.description}
                      onChange={(event) => set("description")(event.target.value)}
                    />
                  </Field>
                  <Field label="Vencimento *" id="i-venc">
                    <Input
                      id="i-venc"
                      type="date"
                      value={form.dueDate}
                      onChange={(event) => set("dueDate")(event.target.value)}
                    />
                  </Field>
                </div>
              )}
              <Field
                label="Planilha *"
                id="i-arq"
                hint={
                  payroll
                    ? "Arquivo .xlsx ou .csv, com as colunas: nome, documento (NF, RPA, Incentivo ou Sem NF), valor, número da NF e emissão."
                    : "Arquivo .xlsx ou .csv, com as colunas: nome, valor, data da pesquisa e, se já tiver, data de pagamento. Chave Pix e CPF não são lidos."
                }
              >
                <Input
                  id="i-arq"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
                {submitting ? "Lendo…" : "Ler planilha"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Conferir antes de importar</DialogTitle>
              <DialogDescription>
                {file?.name} · {payroll ? "Folha de campo" : "Incentivos"} · PRJ-{project?.code}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-2">
              {preview.alreadyImported && (
                <Alert>
                  <AlertTitle>Esta planilha já foi importada</AlertTitle>
                  <AlertDescription>Importar de novo cria lançamentos repetidos.</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                <Count label="Linhas lidas" value={String(preview.lines.length)} />
                <Count label="Entram" value={String(preview.goodCount)} detail={brl(preview.total)} />
                <Count label="Com erro" value={String(preview.errorCount)} detail="ficam de fora" />
                {!payroll && (
                  <Count label="Lançamentos" value={String(preview.groups.length)} detail="um por data de pagamento" />
                )}
              </div>
              {preview.missingDeadline && (
                <Alert variant="destructive">
                  <AlertTitle>Este projeto não tem incentivo ou prazo marcado</AlertTitle>
                  <AlertDescription>Defina o prazo do incentivo no projeto antes de importar a planilha.</AlertDescription>
                </Alert>
              )}
              {preview.groups.length > 0 && (
                <div className="rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={TH}>Pagar em</TableHead>
                        <TableHead className={TH}>Pesquisas de</TableHead>
                        <TableHead className={TH}>Data de pagamento</TableHead>
                        <TableHead className={cn(TH, NUM)}>Incentivos</TableHead>
                        <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.groups.map((group) => (
                        <TableRow key={group.payDate}>
                          <TableCell className={cn(TD, "font-semibold")}>{formatDate(group.payDate)}</TableCell>
                          <TableCell className={TD}>
                            {group.surveyDates.map((day) => formatDate(day).slice(0, 5)).join(" e ") || "—"}
                          </TableCell>
                          <TableCell className={cn(TD, "text-xs text-muted-foreground")}>{group.source}</TableCell>
                          <TableCell className={cn(TD, NUM)}>{group.count}</TableCell>
                          <TableCell className={cn(TD, NUM, "font-bold")}>{brl(group.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className={cn(TD, "font-bold")}>
                          {plural(preview.groups.length, "lançamento", "lançamentos")}
                        </TableCell>
                        <TableCell className={cn(TD, NUM, "font-bold")}>{preview.goodCount}</TableCell>
                        <TableCell className={cn(TD, NUM, "font-bold")}>{brl(preview.total)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
              <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Linha</TableHead>
                      <TableHead className={TH}>Pessoa</TableHead>
                      {payroll ? (
                        <TableHead className={TH}>Documento</TableHead>
                      ) : (
                        <TableHead className={TH}>Pagar em</TableHead>
                      )}
                      <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      <TableHead className={TH} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.map((line) => (
                      <TableRow key={line.line}>
                        <TableCell className={TD}>{line.line}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal font-semibold")}>{line.name || "—"}</TableCell>
                        <TableCell className={TD}>
                          {payroll ? (
                            <>
                              {line.documentType}
                              {line.documentType === "NF" &&
                                (line.invoiceNumber ? ` nº ${line.invoiceNumber}` : " pendente (não bloqueia)")}
                            </>
                          ) : line.payDate ? (
                            `${formatDate(line.payDate)} · ${line.payDateGiven ? "informada" : "calculada"}`
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, NUM)}>
                          {line.amount ? brl(line.amount) : "—"}
                          {line.gross && (
                            <span className="block text-[11px] text-muted-foreground">bruto {brl(line.gross)}, −11% INSS</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>
                          {line.errors.length ? (
                            <span className="text-xs font-semibold text-[#b91c1c]">{line.errors.join("; ")}</span>
                          ) : (
                            <Tag color="verde">Ok</Tag>
                          )}
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
              {preview.groups.length > 0 && (
                <Button variant="outline" onClick={() => copySchedule(preview)}>
                  <Copy size={16} />
                  Copiar cronograma para o projeto
                </Button>
              )}
              <Button
                disabled={blocked || submitting}
                onClick={() => run(async () => onDone(await importPayables(formData())))}
              >
                <FileUp size={16} />
                Criar {plural(payableCount, "lançamento", "lançamentos")} com {plural(preview.goodCount, "item", "itens")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
