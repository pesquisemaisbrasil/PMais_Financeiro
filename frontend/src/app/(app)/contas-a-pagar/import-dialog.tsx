"use client";

import { Copy, Download, FileUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { BusinessDayNotice } from "@/components/BusinessDayNotice";
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
import { downloadIncentiveTemplate, importPayables, previewImport } from "@/lib/api";
import { choiceIds } from "@/lib/choices";
import { saveBlob } from "@/lib/documents";
import {
  openForLaunch,
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
  type ReportResult,
} from "@/lib/payables";
import { missingFieldsMessage } from "@/lib/forms";
import { IncentiveLoading } from "./incentive-loading";
import { ReportImport } from "./report-import";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

// Incentivo tem o caminho próprio: o botão Carregar incentivos.
const KINDS = [
  { id: "folha", label: "Folha de campo" },
  { id: "relatorio", label: "Relatório do sistema antigo" },
];
const TEMPLATE_FILE = "modelo-carregar-incentivos.xlsx";
// Em tela estreita, cada linha das tabelas da conferência vira um cartão, sem rolar para o lado.
const CARD_BLOCK = "max-md:block";
const CARD_ROW =
  "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-3";
const CARD_CELL = "max-md:p-0";

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
  kind,
  onClose,
  onDone,
  onReportDone,
}: {
  reference: Reference;
  today: string;
  /** "incentivos" abre a janela Carregar incentivos; sem ele, a pessoa escolhe entre folha e relatório. */
  kind?: "incentivos" | "folha";
  onClose: () => void;
  onDone: (result: ImportResult) => void;
  /** Quem aceita o relatório do sistema antigo (só o Contas a pagar): sem isso, o tipo não aparece. */
  onReportDone?: (result: ReportResult) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // A tela de carregamento dos incentivos: quantos entram e, quando o servidor confirma, o resultado.
  const [loading, setLoading] = useState<{ total: number; result: ImportResult | null } | null>(null);
  const [form, setForm] = useState({
    // texto solto: o Tipo também aceita "relatorio", que abre a janela própria do relatório
    kind: (kind ?? "folha") as string,
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
  const incentives = form.kind === "incentivos";
  const kinds = onReportDone ? KINDS : KINDS.filter((option) => option.id !== "relatorio");

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

  function create(current: ImportPreview) {
    if (!incentives) return run(async () => onDone(await importPayables(formData())));
    setLoading({ total: current.goodCount, result: null });
    return run(async () => {
      try {
        setLoading({ total: current.goodCount, result: await importPayables(formData()) });
      } catch (err) {
        setLoading(null); // volta para a conferência, com o motivo na tela
        throw err;
      }
    });
  }

  /** O projeto e a classificação da linha, embaixo do nome, só do que a planilha trouxe em coluna. */
  function lineDetails(line: ImportPreview["lines"][number]): string {
    const project = preview?.hasProjectColumn && line.projectCode ? `PRJ-${line.projectCode}` : null;
    const classification = preview?.hasClassificationColumns ? line.classification : null;
    return [project, classification].filter(Boolean).join(" · ");
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

  // O relatório do sistema antigo é outro formato (uma conta por linha, com a baixa): tem a sua janela.
  if (form.kind === "relatorio" && onReportDone) {
    return (
      <ReportImport
        reference={reference}
        onClose={onClose}
        onDone={onReportDone}
        typeField={
          <Field label="Tipo *" id="i-tipo">
            <Choice id="i-tipo" value={form.kind} onChange={set("kind")} options={kinds} />
          </Field>
        }
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && !loading && onClose()}>
      <DialogContent
        showCloseButton={!loading}
        className={cn(
          "max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto",
          loading ? "sm:max-w-[480px]" : "sm:max-w-[820px]"
        )}
      >
        {loading ? (
          <IncentiveLoading
            total={loading.total}
            confirmed={loading.result !== null}
            onFinished={() => loading.result && onDone(loading.result)}
          />
        ) : !preview ? (
          <form onSubmit={read} noValidate>
            <DialogHeader>
              <DialogTitle>{incentives ? "Carregar incentivos" : "Importar planilha"}</DialogTitle>
              <DialogDescription>
                A planilha é conferida antes de criar qualquer lançamento. Ela é lida e não fica guardada.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5 py-4">
              {incentives && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    A planilha modelo mostra como preencher cada coluna.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => run(async () => saveBlob(await downloadIncentiveTemplate(), TEMPLATE_FILE))}
                  >
                    <Download size={16} />
                    Baixar planilha modelo
                  </Button>
                </div>
              )}
              {!incentives && (
                <>
                  <div className={cn("grid gap-3", !kind && "sm:grid-cols-2")}>
                    {!kind && (
                      <Field label="Tipo *" id="i-tipo">
                        <Choice id="i-tipo" value={form.kind} onChange={set("kind")} options={kinds} />
                      </Field>
                    )}
                    <Field label="Projeto" id="i-proj">
                      <MultiSearchSelect
                        id="i-proj"
                        value={form.projectIds}
                        onChange={set("projectIds")}
                        allLabel="Todos os projetos da planilha"
                        options={reference.projects
                          .filter(openForLaunch)
                          .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))}
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Plano de contas" id="i-cat">
                      <MultiSearchSelect
                        id="i-cat"
                        value={form.categoryIds}
                        onChange={set("categoryIds")}
                        allLabel="Todas as contas da planilha"
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
                </>
              )}
              {!incentives && (
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
              )}
              <p className="-mt-1 text-xs text-muted-foreground">
                {incentives
                  ? "Cada linha da planilha precisa do projeto, do plano de contas e da forma de pagamento. Empresa, unidade e centro de custo vêm do cadastro de cada projeto."
                  : "Em cada campo, marque um, vários ou deixe em “Todos”. Para valer linha a linha, a planilha traz uma coluna com o mesmo nome (projeto, plano de contas, forma de pagamento, empresa, unidade ou centro de custo) com o nome cadastrado. Sem a coluna, marque um só."}
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
                    <DateInput
                      id="i-venc"
                      value={form.dueDate}
                      onChange={(event) => set("dueDate")(event.target.value)}
                    />
                  </Field>
                </div>
              )}
              {payroll && <BusinessDayNotice date={form.dueDate} onPick={set("dueDate")} />}
              <Field
                label="Planilha *"
                id="i-arq"
                hint={
                  payroll
                    ? "Arquivo .xlsx ou .csv, com as colunas: nome, documento (NF, RPA, Incentivo ou Sem NF), valor, número da NF e emissão."
                    : "Arquivo .xlsx ou .csv, no formato da planilha modelo. A chave Pix fica só mascarada; o CPF não é lido."
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
                {(preview.alreadyPaidCount ?? 0) > 0 && (
                  <Count label="Já pagas" value={String(preview.alreadyPaidCount)} detail="ficam de fora" />
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
                  <AlertTitle>A planilha precisa da data de pagamento</AlertTitle>
                  <AlertDescription>
                    {missingDeadline.map((p) => `PRJ-${p.code}`).join(", ")}: sem prazo de incentivo marcado. Use uma
                    planilha com a data de pagamento de cada pessoa.
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
                  <Table className={CARD_BLOCK}>
                    <TableHeader className="max-md:hidden">
                      <TableRow>
                        {splitting && <TableHead className={TH}>Lançamento</TableHead>}
                        <TableHead className={TH}>Pagar em</TableHead>
                        <TableHead className={TH}>Pesquisas de</TableHead>
                        <TableHead className={cn(TH, NUM)}>Incentivos</TableHead>
                        <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className={CARD_BLOCK}>
                      {preview.groups.map((group) => (
                        <TableRow key={`${group.projectId}-${group.classification}-${group.payDate}`} className={CARD_ROW}>
                          {splitting && (
                            <TableCell className={cn(TD, CARD_CELL, "whitespace-normal")}>
                              <span className="block font-semibold">PRJ-{group.projectCode}</span>
                              {preview.hasClassificationColumns && (
                                <span className="block text-xs text-muted-foreground">{group.classification}</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className={cn(TD, CARD_CELL, "whitespace-normal font-semibold max-md:order-3")}>
                            {formatDate(group.payDate)}
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              {(group.shifts ?? []).length > 0
                                ? `ajustada de ${(group.shifts ?? []).map((shift) => formatDate(shift.day).slice(0, 5)).join(" e ")}`
                                : group.source}
                            </span>
                          </TableCell>
                          <TableCell className={cn(TD, "whitespace-normal max-md:hidden")}>
                            {group.surveyDates.map((day) => formatDate(day).slice(0, 5)).join(" e ") || "—"}
                          </TableCell>
                          <TableCell className={cn(TD, CARD_CELL, NUM, "max-md:order-4 max-md:text-xs")}>
                            {group.count}
                            <span className="md:hidden"> {group.count === 1 ? "incentivo" : "incentivos"}</span>
                          </TableCell>
                          <TableCell className={cn(TD, CARD_CELL, NUM, "font-bold max-md:order-2")}>
                            {brl(group.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className={CARD_BLOCK}>
                      <TableRow className={CARD_ROW}>
                        <TableCell colSpan={splitting ? 3 : 2} className={cn(TD, CARD_CELL, "font-bold")}>
                          {plural(preview.payableCount, "lançamento", "lançamentos")}
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, NUM, "font-bold max-md:order-3 max-md:col-span-2 max-md:text-xs")}>
                          {preview.goodCount}
                          <span className="md:hidden"> {preview.goodCount === 1 ? "incentivo" : "incentivos"}</span>
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, NUM, "font-bold max-md:order-2")}>
                          {brl(preview.total)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
              <div className="rounded-xl border border-border md:max-h-[300px] md:overflow-y-auto">
                <Table className={CARD_BLOCK}>
                  <TableHeader className="max-md:hidden">
                    <TableRow>
                      <TableHead className={TH}>Linha</TableHead>
                      <TableHead className={TH}>Pessoa</TableHead>
                      {payroll ? (
                        <TableHead className={TH}>Documento</TableHead>
                      ) : (
                        <TableHead className={TH}>Pagar em</TableHead>
                      )}
                      <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                      <TableHead className={TH}>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={CARD_BLOCK}>
                    {preview.lines.map((line) => (
                      <TableRow key={line.line} className={CARD_ROW}>
                        <TableCell className={cn(TD, CARD_CELL, "max-md:order-3 max-md:text-xs max-md:text-muted-foreground")}>
                          <span className="md:hidden">Linha </span>
                          {line.line}
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, "whitespace-normal")}>
                          <span className="block font-semibold">{line.name || "—"}</span>
                          {lineDetails(line) && (
                            <span className="block text-xs text-muted-foreground">{lineDetails(line)}</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, "whitespace-normal max-md:order-4 max-md:text-right max-md:text-xs")}>
                          {payroll ? (
                            <>
                              {line.documentType}
                              {line.documentType === "NF" &&
                                (line.invoiceNumber ? ` nº ${line.invoiceNumber}` : " pendente (não bloqueia)")}
                            </>
                          ) : line.payDate ? (
                            <>
                              {formatDate(line.payDate)}
                              <span className="block text-[11px] text-muted-foreground">
                                {line.payDateGiven ? "informada" : "calculada"}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, NUM, "whitespace-normal max-md:order-2")}>
                          {line.amount ? brl(line.amount) : "—"}
                          {line.gross && (
                            <span className="block text-[11px] text-muted-foreground">bruto {brl(line.gross)}, −11% INSS</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, CARD_CELL, "whitespace-normal max-md:order-5 max-md:col-span-2")}>
                          {line.errors.length ? (
                            <span className="text-xs font-semibold text-[#b91c1c]">{line.errors.join("; ")}</span>
                          ) : line.alreadyPaid ? (
                            <Tag color="cinza">Já paga</Tag>
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
            <DialogFooter className="flex-wrap">
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
                onClick={() => create(preview)}
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
