"use client";

import { Copy, FileUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field, FormError, NUM, TD, TH, Tag } from "@/components/finance";
import { FilePicker } from "@/components/FilePicker";
import { MultiSearchSelect } from "@/components/MultiSearchSelect";
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
import { choiceIds } from "@/lib/choices";
import {
  addDays,
  brl,
  expenseCategories,
  formatDate,
  plural,
  schedulesText,
  shiftNote,
  type ImportPreview,
  type ImportResult,
  type Reference,
} from "@/lib/payables";
import { missingFieldsMessage } from "@/lib/forms";
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
    // Cada campo guarda os ids marcados, separados por vírgula. Vazio = todos os da planilha.
    projectIds: "",
    categoryIds: "",
    paymentMethodIds: "",
    companyIds: "",
    unitIds: "",
    costCenterIds: "",
    description: "",
    dueDate: addDays(today, 10),
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const payroll = form.kind === "folha";

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
    const missing = payroll
      ? missingFieldsMessage([
          ["Descrição", form.description.trim()],
          ["Vencimento", form.dueDate],
        ])
      : null;
    if (missing) return setLocalError(missing);
    if (!file) return setLocalError("Escolha a planilha.");
    setLocalError(null);
    await run(async () => setPreview(await previewImport(formData())));
  }

  async function copySchedule(current: ImportPreview) {
    try {
      await navigator.clipboard.writeText(schedulesText(current));
      toast.success(
        current.projects.length > 1
          ? "Cronogramas copiados, um por projeto. Cole no e-mail ou no grupo de cada projeto."
          : "Cronograma copiado. Cole no e-mail ou no grupo do projeto."
      );
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const blocked = !preview || preview.goodCount === 0 || preview.missingDeadline;
  const manyProjects = (preview?.projects.length ?? 0) > 1;
  // Com mais de um projeto, ou com colunas de empresa, unidade etc., sai mais de um lançamento por data.
  const splitting = manyProjects || Boolean(preview?.hasClassificationColumns);
  const missingDeadline = preview?.projects.filter((p) => p.missingDeadline) ?? [];
  const payableCount = preview?.payableCount ?? 0;
  // Com empresas marcadas, a unidade marcada precisa ser de uma delas: ao mudar as empresas, as
  // unidades que ficaram sem a sua empresa saem da seleção.
  const chosenCompanies = choiceIds(form.companyIds);
  function changeCompanies(value: string) {
    const companies = choiceIds(value);
    const belongs = (unitId: string) => {
      const unit = reference.units.find((u) => String(u.id) === unitId);
      return !companies.length || (unit !== undefined && companies.includes(String(unit.companyId)));
    };
    setForm((current) => ({
      ...current,
      companyIds: value,
      unitIds: choiceIds(current.unitIds).filter(belongs).join(","),
    }));
  }

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
                <Field label="Projeto" id="i-proj">
                  <MultiSearchSelect
                    id="i-proj"
                    value={form.projectIds}
                    onChange={set("projectIds")}
                    allLabel="Todos os projetos da planilha"
                    options={reference.projects
                      .filter((p) => p.status !== "encerrado")
                      .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Categoria" id="i-cat">
                  <MultiSearchSelect
                    id="i-cat"
                    value={form.categoryIds}
                    onChange={set("categoryIds")}
                    allLabel="Todas as categorias da planilha"
                    options={expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
                  />
                </Field>
                <Field label="Forma de pagamento" id="i-forma">
                  <MultiSearchSelect
                    id="i-forma"
                    value={form.paymentMethodIds}
                    onChange={set("paymentMethodIds")}
                    allLabel="Todas as formas da planilha"
                    options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Empresa" id="i-emp">
                  <MultiSearchSelect
                    id="i-emp"
                    value={form.companyIds}
                    onChange={changeCompanies}
                    allLabel="Todas as empresas da planilha"
                    options={reference.companies.map((c) => ({ id: c.id, label: c.name }))}
                  />
                </Field>
                <Field label="Unidade" id="i-uni">
                  <MultiSearchSelect
                    id="i-uni"
                    value={form.unitIds}
                    onChange={set("unitIds")}
                    allLabel="Todas as unidades da planilha"
                    options={reference.units
                      .filter((u) => !chosenCompanies.length || chosenCompanies.includes(String(u.companyId)))
                      .map((u) => ({
                        id: u.id,
                        // sem empresa marcada, o nome dela ajuda a distinguir unidades de mesmo nome
                        label: chosenCompanies.length
                          ? u.name
                          : `${u.name} · ${reference.companies.find((c) => c.id === u.companyId)?.name ?? ""}`,
                      }))}
                  />
                </Field>
                <Field label="Centro de custo" id="i-cc">
                  <MultiSearchSelect
                    id="i-cc"
                    value={form.costCenterIds}
                    onChange={set("costCenterIds")}
                    allLabel="Todos os centros da planilha"
                    options={reference.costCenters.map((c) => ({ id: c.id, label: c.label }))}
                  />
                </Field>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                Em cada campo, marque um, vários ou deixe em “Todos”. Para valer linha a linha, a planilha traz uma
                coluna com o mesmo nome (projeto, categoria, forma de pagamento, empresa, unidade ou centro de custo)
                com o nome cadastrado. Sem a coluna, marque um só.
              </p>
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
                <FilePicker
                  id="i-arq"
                  accept=".xlsx,.csv"
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
                {submitting ? "Lendo…" : "Ler planilha"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Conferir antes de importar</DialogTitle>
              <DialogDescription>
                {file?.name} · {payroll ? "Folha de campo" : "Incentivos"} ·{" "}
                {preview.projects.map((p) => `PRJ-${p.code}`).join(", ") || "nenhum projeto"}
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
                {preview.skippedCount > 0 && (
                  <Count label="Fora da seleção" value={String(preview.skippedCount)} detail="de outro projeto" />
                )}
                {preview.projects.length > 1 && (
                  <Count label="Projetos" value={String(preview.projects.length)} detail="na planilha" />
                )}
                {!payroll && (
                  <Count
                    label="Lançamentos"
                    value={String(preview.groups.length)}
                    detail={splitting ? "por classificação e data de pagamento" : "um por data de pagamento"}
                  />
                )}
              </div>
              {preview.missingDeadline && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {missingDeadline.length > 1
                      ? "Estes projetos não têm incentivo ou prazo marcado"
                      : "Este projeto não tem incentivo ou prazo marcado"}
                  </AlertTitle>
                  <AlertDescription>
                    {missingDeadline.map((p) => `PRJ-${p.code}`).join(", ")}: defina o prazo do incentivo no projeto
                    antes de importar a planilha, ou use uma planilha com a data de pagamento.
                  </AlertDescription>
                </Alert>
              )}
              {(preview.shiftedCount ?? 0) > 0 && (
                <Alert>
                  <AlertTitle>
                    {plural(preview.shiftedCount ?? 0, "pessoa", "pessoas")} com data de pagamento em fim de semana ou
                    feriado
                  </AlertTitle>
                  <AlertDescription>
                    <span className="block">Essas datas vão para o próximo dia útil. Confira antes de criar:</span>
                    <ul className="mt-1 list-disc pl-5">
                      {preview.groups.flatMap((group) =>
                        (group.shifts ?? []).map((shift) => (
                          <li key={`${group.projectId}-${group.classification}-${group.payDate}-${shift.day}`}>
                            {manyProjects && <strong>PRJ-{group.projectCode}: </strong>}
                            {shiftNote(shift, group.payDate)}
                          </li>
                        ))
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {preview.groups.length > 0 && (
                <div className="rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {manyProjects && <TableHead className={TH}>Projeto</TableHead>}
                        {preview.hasClassificationColumns && <TableHead className={TH}>Classificação</TableHead>}
                        <TableHead className={TH}>Pagar em</TableHead>
                        <TableHead className={TH}>Pesquisas de</TableHead>
                        <TableHead className={TH}>Data de pagamento</TableHead>
                        <TableHead className={cn(TH, NUM)}>Incentivos</TableHead>
                        <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.groups.map((group) => (
                        <TableRow key={`${group.projectId}-${group.classification}-${group.payDate}`}>
                          {manyProjects && (
                            <TableCell className={cn(TD, "whitespace-nowrap font-semibold")}>PRJ-{group.projectCode}</TableCell>
                          )}
                          {preview.hasClassificationColumns && (
                            <TableCell className={cn(TD, "whitespace-normal text-xs")}>{group.classification}</TableCell>
                          )}
                          <TableCell className={cn(TD, "font-semibold")}>
                            {formatDate(group.payDate)}
                            {(group.shifts ?? []).length > 0 && (
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                ajustada de {(group.shifts ?? []).map((shift) => formatDate(shift.day).slice(0, 5)).join(" e ")}
                              </span>
                            )}
                          </TableCell>
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
                        <TableCell
                          colSpan={3 + (manyProjects ? 1 : 0) + (preview.hasClassificationColumns ? 1 : 0)}
                          className={cn(TD, "font-bold")}
                        >
                          {plural(preview.payableCount, "lançamento", "lançamentos")}
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
                      {preview.hasProjectColumn && <TableHead className={TH}>Projeto</TableHead>}
                      {preview.hasClassificationColumns && <TableHead className={TH}>Classificação</TableHead>}
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
                        {preview.hasProjectColumn && (
                          <TableCell className={cn(TD, "whitespace-nowrap")}>
                            {line.projectCode ? `PRJ-${line.projectCode}` : "—"}
                          </TableCell>
                        )}
                        {preview.hasClassificationColumns && (
                          <TableCell className={cn(TD, "whitespace-normal text-xs")}>{line.classification ?? "—"}</TableCell>
                        )}
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
                          ) : line.skipped ? (
                            <Tag color="cinza">Fora da seleção</Tag>
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
