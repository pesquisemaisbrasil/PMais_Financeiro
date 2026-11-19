"use client";

import {
  Ban,
  Check,
  CheckCheck,
  CircleCheck,
  Copy,
  FileClock,
  Hourglass,
  Paperclip,
  Pencil,
  Replace,
  Tags,
  Undo2,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DateInput, MonthInput } from "@/components/DateInput";
import { BusinessDayNotice } from "@/components/BusinessDayNotice";
import { ItemsPanel } from "@/components/ItemsPanel";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import {
  ErrorBox,
  Field,
  FormError,
  INLINE_OFFSET,
  OriginTag,
  ProvisionTag,
  RedStars,
  SituationTag,
  TAB_BUTTON,
  TAB_BUTTON_DANGER,
} from "@/components/finance";
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
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AmountSummary } from "@/components/AmountSummary";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { FilePicker } from "@/components/FilePicker";
import { ProjectSplit } from "@/components/ProjectSplit";
import { SeriesDialog, type SeriesApi, type SeriesTexts } from "@/components/SeriesDialog";
import { SeriesPanel } from "@/components/SeriesPanel";
import { ValuesCard } from "@/components/ValuesCard";
import {
  NO_RECURRENCE,
  RecurrenceFields,
  simulationIsCurrent,
  type RecurrenceState,
} from "@/components/RecurrenceFields";
import {
  ApiError,
  attachBatch,
  attachDocument,
  cancelPayable,
  cancelSeries,
  createPayable,
  createSeries,
  deleteBatch,
  downloadDocument,
  duplicateBatch,
  editSeries,
  getPayable,
  getReplacementCandidates,
  listSeries,
  payBatch,
  payPayable,
  reclassifyBatch,
  removeDocument,
  renameDocument,
  replaceProvision,
  reversePayment,
  updatePayable,
} from "@/lib/api";
import {
  openForLaunch,
  addDays,
  brl,
  expenseCategories,
  formatDate,
  invalidOccurrence,
  occurrenceEdits,
  buildAllocations,
  parseMoney,
  percentOf,
  plural,
  projectDefaults,
  splitRowsFrom,
  toCents,
  toField,
  type AllocationRow,
  type Attachment,
  type PayableDetail,
  type PayableRow,
  type Payment,
  type Reference,
  type ReplacementCandidate,
  type Situation,
} from "@/lib/payables";
import {
  NET_ZERO_MESSAGE,
  draftsFrom,
  netText,
  parseDrafts,
  ratesText,
  taxesUntouched,
  withTaxes,
  type AdjustmentDraft,
} from "@/lib/adjustments";
import {
  DEFAULT_DOCUMENT_KIND,
  DOCUMENT_ACCEPT,
  DOCUMENT_HINT,
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
} from "@/lib/documents";
import { missingFieldsMessage } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { BatchEditForm } from "./batch-edit";
import { DetailFields } from "./detail-fields";

const DOCUMENT_TYPES = ["Sem documento", "NF", "Boleto", "Fatura", "Recibo", "Contrato"];
const NO_PROJECT = "sem-projeto";
const KEEP = "nao-mudar";
const NEW_REAL = "novo";
const NO_ACCOUNT_HINT = "Esta empresa não tem conta bancária cadastrada.";

export function NewPayableDialog({
  reference,
  today,
  onClose,
  onDone,
}: {
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (payable: PayableDetail, seriesCount?: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceState>(NO_RECURRENCE);
  // A divisão do valor entre projetos, linha a linha. Vazia = vale o campo Projeto.
  const [split, setSplit] = useState<AllocationRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [form, setForm] = useState({
    issueDate: today,
    dueDate: addDays(today, 7),
    amount: "",
    isProvision: false,
    supplierId: "",
    categoryId: "",
    description: "",
    unitId: "",
    costCenterId: "",
    paymentMethodId: "",
    projectId: "",
    documentType: "Sem documento",
    documentNumber: "",
    documentDate: "",
    barcode: "",
    competence: today.slice(0, 7),
    docsReceivedOn: "",
    isTransfer: false,
    notes: "",
  });
  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const input = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (event: { target: { value: string } }) => set(key)(event.target.value),
  });

  const missingRecords = [
    !reference.suppliers.length && "fornecedores",
    !expenseCategories(reference).length && "plano de contas",
    !reference.units.length && "unidades",
    !reference.costCenters.length && "centros de custo",
    !reference.paymentMethods.length && "formas de pagamento",
  ].filter(Boolean);

  // Como no sistema antigo, a Nova conta a pagar não tem campo Empresa: ela vem da unidade escolhida.
  const unit = reference.units.find((u) => String(u.id) === form.unitId);

  /** Escolher o projeto traz a unidade e o centro de custo dele, quando o projeto tem (A2). */
  function pickProject(value: string) {
    setForm((current) => ({ ...current, projectId: value, ...projectDefaults(reference, value) }));
  }
  const companyName = (companyId: number) => reference.companies.find((c) => c.id === companyId)?.name ?? "";

  // Impostos retidos (Bruno, 19/11/2026): toda conta nova já traz calculados sobre o valor principal. Se a
  // pessoa mudou algum na janela de impostos, trocar o valor principal não mexe mais neles.
  const rates = reference.taxRates;
  const taxNote = ratesText(rates);
  function changeAmount(value: string) {
    if (taxesUntouched(adjustments, form.amount, rates)) setAdjustments(withTaxes(adjustments, value, rates));
    set("amount")(value);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoney(form.amount);
    if (!amount || Number(amount) === 0) return setLocalError("Informe um valor maior que zero.");
    const parceled = recurrence.repeat && recurrence.kind === "parcelado";
    // Na parcelada os impostos vão em cada parcela depois: os calculados sozinhos saem, os mudados à mão barram.
    const lines = parceled && taxesUntouched(adjustments, form.amount, rates) ? withTaxes(adjustments, "", rates) : adjustments;
    const adjusted = parseDrafts(lines);
    if (adjusted.error) return setLocalError(adjusted.error);
    if (Number(netText(form.amount, lines)) <= 0) return setLocalError(NET_ZERO_MESSAGE);
    if (parceled && adjusted.lines.length) {
      return setLocalError("Em conta parcelada, lance acréscimos, descontos e impostos em cada parcela depois.");
    }
    // A ordem é a dos campos na tela, a da tela antiga (18/11).
    const missing = missingFieldsMessage([
      ["Fornecedor", form.isProvision || form.supplierId],
      ["Vencimento", form.dueDate],
      ["Programação", form.issueDate],
      ["Forma de pagamento", form.paymentMethodId],
      // Toda conta tem projeto, até a administrativa (testes de 16/11, A3); a divisão também vale.
      ["Projeto", form.projectId || split.some((row) => row.projectId)],
      ["Unidade", unit],
      ["Centro de custo", form.costCenterId],
      ["Plano de contas", form.categoryId],
      ["Descrição", form.description.trim()],
    ]);
    if (missing || !unit) return setLocalError(missing ?? "Escolha a unidade.");
    if (form.documentType === "NF" && (!form.documentNumber.trim() || !form.documentDate)) {
      return setLocalError("Informe o número e a data de emissão da nota.");
    }
    let allocations: { projectId: number; amount: string }[] = [];
    const divided = buildAllocations(split, amount);
    if (divided.error) return setLocalError(divided.error);
    if (divided.allocations.length) {
      allocations = divided.allocations;
    } else if (form.projectId) {
      allocations = [{ projectId: Number(form.projectId), amount }];
    }
    if (recurrence.repeat && form.isProvision) return setLocalError("Provisão não se repete.");
    const badOccurrence = recurrence.repeat ? invalidOccurrence(recurrence.rows) : null;
    if (badOccurrence) return setLocalError(badOccurrence);
    if (recurrence.repeat && !simulationIsCurrent(recurrence, form.dueDate, amount)) {
      return setLocalError("Clique em Simular para conferir as ocorrências antes de salvar.");
    }
    const body = {
        type: form.isProvision ? "provisao" : "real",
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        amount,
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        categoryId: Number(form.categoryId),
        companyId: unit.companyId,
        unitId: unit.id,
        costCenterId: Number(form.costCenterId),
        paymentMethodId: Number(form.paymentMethodId),
        description: form.description,
        allocations,
        documentType: form.documentType,
        documentNumber: form.documentNumber.trim() || null,
        documentDate: form.documentDate || null,
        barcode: form.barcode.trim() || null,
        competence: form.competence || null,
        docsReceivedOn: form.docsReceivedOn || null,
        isTransfer: form.isTransfer,
        notes: form.notes.trim() || null,
        adjustments: adjusted.lines,
    };
    await run(async () => {
      if (recurrence.repeat && recurrence.rows && recurrence.simulated) {
        const { ids } = await createSeries({
          ...body,
          recurrence: {
            kind: recurrence.kind,
            count: Number(recurrence.count),
            estimated: recurrence.estimated,
            occurrences: occurrenceEdits(recurrence.simulated, recurrence.rows),
          },
        });
        onDone(await getPayable(ids[0]), ids.length);
        return;
      }
      onDone(await createPayable(body));
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>
              <RedStars text={'Os campos com * são obrigatórios. O resto fica em "Mais informações".'} />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {missingRecords.length > 0 && (
              <Alert>
                <AlertDescription>Ainda faltam cadastros: {missingRecords.join(", ")}.</AlertDescription>
              </Alert>
            )}
            {/* Na disposição e na ordem da tela antiga (Bruno, 18/11): um campo por linha, o nome à
                esquerda. O projeto traz a unidade e o centro de custo; o rateio fica logo abaixo dele. */}
            <Field inline label={form.isProvision ? "Fornecedor" : "Fornecedor *"} id="p-forn">
              <Choice
                id="p-forn"
                value={form.supplierId}
                onChange={set("supplierId")}
                options={reference.suppliers.map((s) => ({ id: s.id, label: `${s.nickname} · ${s.name}` }))}
              />
            </Field>
            <Field inline label="Vencimento *" id="p-venc">
              <DateInput id="p-venc" className="sm:max-w-48" {...input("dueDate")} />
            </Field>
            <BusinessDayNotice date={form.dueDate} onPick={set("dueDate")} className={INLINE_OFFSET} />
            <Field inline label="Programação *" id="p-data">
              <DateInput id="p-data" className="sm:max-w-48" {...input("issueDate")} />
            </Field>
            <div className={cn("flex items-center gap-2 text-xs", INLINE_OFFSET)}>
              <Checkbox
                id="p-prov"
                checked={form.isProvision}
                onCheckedChange={(checked) => set("isProvision")(checked === true)}
              />
              <Label htmlFor="p-prov" className="text-xs font-normal">
                É uma provisão: valor previsto, que depois é substituído pelo real
              </Label>
            </div>
            <ValuesCard
              inline
              grossId="p-valor"
              grossLabel="Valor principal (R$) *"
              gross={form.amount}
              onGrossChange={changeAmount}
              drafts={adjustments}
              onChange={setAdjustments}
              taxRates={rates}
            />
            {taxNote && (
              <p className={cn("text-xs text-muted-foreground", INLINE_OFFSET)}>
                Impostos retidos já calculados sobre o valor principal: {taxNote}. Conta sem retenção: zere em Impostos.
              </p>
            )}
            <Field inline label="Forma de pagamento *" id="p-forma">
              <Choice
                id="p-forma"
                searchable
                value={form.paymentMethodId}
                onChange={set("paymentMethodId")}
                options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
              />
            </Field>
            <Field
              inline
              label={split.length ? "Projeto" : "Projeto *"}
              id="p-proj"
              hint={
                split.length
                  ? "Vale o rateio abaixo."
                  : "Traz a unidade e o centro de custo do projeto. Ou divida entre projetos logo abaixo."
              }
            >
              <Choice
                id="p-proj"
                searchable
                value={form.projectId}
                onChange={pickProject}
                placeholder="Escolha o projeto"
                options={reference.projects
                  .filter(openForLaunch)
                  .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))}
              />
            </Field>
            <div className={INLINE_OFFSET}>
              <ProjectSplit
                rows={split}
                onChange={setSplit}
                projects={reference.projects.filter(openForLaunch)}
                amount={parseMoney(form.amount) ?? ""}
                disabled={submitting}
              />
            </div>
            <Field inline label="Unidade *" id="p-uni">
              <Choice
                id="p-uni"
                searchable
                value={form.unitId}
                onChange={set("unitId")}
                // o nome da empresa distingue unidades de mesmo nome (a empresa vem da unidade)
                options={reference.units.map((u) => ({ id: u.id, label: `${u.name} · ${companyName(u.companyId)}` }))}
              />
            </Field>
            <Field inline label="Centro de custo *" id="p-cc">
              <Choice
                id="p-cc"
                value={form.costCenterId}
                onChange={set("costCenterId")}
                options={reference.costCenters.map((c) => ({ id: c.id, label: c.label }))}
              />
            </Field>
            <Field inline label="Plano de contas *" id="p-cat">
              <Choice
                id="p-cat"
                value={form.categoryId}
                onChange={set("categoryId")}
                options={expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
              />
            </Field>
            <Field inline label="Descrição *" id="p-desc">
              <Textarea
                id="p-desc"
                className="min-h-28"
                maxLength={255}
                placeholder="Ex.: Aluguel do escritório · novembro"
                {...input("description")}
              />
            </Field>
            <RecurrenceFields
              value={recurrence}
              onChange={setRecurrence}
              dueDate={form.dueDate}
              amount={parseMoney(form.amount)}
              disabled={submitting}
              onError={setLocalError}
            />
            <details className="rounded-xl border border-border px-3.5 py-2.5">
              <summary className="cursor-pointer text-[13px] font-semibold">
                Mais informações (documento, código de barras, competência…)
              </summary>
              <div className="mt-3 flex flex-col gap-3.5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Documento" id="p-doc">
                    <Choice
                      id="p-doc"
                      value={form.documentType}
                      onChange={set("documentType")}
                      options={DOCUMENT_TYPES.map((type) => ({ id: type, label: type }))}
                    />
                  </Field>
                  <Field label="Número" id="p-docn">
                    <Input id="p-docn" {...input("documentNumber")} />
                  </Field>
                  <Field label="Emissão" id="p-doce">
                    <DateInput id="p-doce" {...input("documentDate")} />
                  </Field>
                </div>
                <Field label="Código de barras / linha digitável" id="p-barras">
                  <Input id="p-barras" className="font-mono text-xs" {...input("barcode")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Competência" id="p-comp">
                    <MonthInput id="p-comp" {...input("competence")} />
                  </Field>
                  <Field
                    label="Documentação recebida em"
                    id="p-docrec"
                    hint="Menos de 3 dias antes do vencimento fica como documentação atrasada."
                  >
                    <DateInput id="p-docrec" {...input("docsReceivedOn")} />
                  </Field>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Checkbox
                    id="p-trans"
                    checked={form.isTransfer}
                    onCheckedChange={(checked) => set("isTransfer")(checked === true)}
                  />
                  <Label htmlFor="p-trans" className="text-xs font-normal">
                    Transferência entre empresas do Grupo
                  </Label>
                </div>
                <Field label="Observações" id="p-obs">
                  <Textarea id="p-obs" {...input("notes")} />
                </Field>
              </div>
            </details>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Lançando…" : "Lançar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({
  row,
  reference,
  today,
  onClose,
  onDone,
}: {
  row: PayableRow;
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (payable: PayableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const accounts = reference.bankAccounts.filter(
    (account) => reference.companies.find((c) => c.id === account.companyId)?.name === row.companyName
  );
  const method = reference.paymentMethods.find((m) => m.name === row.paymentMethodName);
  const [amountEdited, setAmountEdited] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    paidOn: today,
    bankAccountId: accounts.length === 1 ? String(accounts[0].id) : "",
    paymentMethodId: method ? String(method.id) : "",
    surcharge: "",
    discount: "",
    transactionId: "",
    note: "",
  });
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const dueCents =
    toCents(row.pending) + toCents(parseMoney(form.surcharge) ?? "0.00") - toCents(parseMoney(form.discount) ?? "0.00");
  const due = (dueCents / 100).toFixed(2);
  const amountText = amountEdited ? form.amount : toField(due);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoney(amountText);
    if (!amount || Number(amount) === 0) return setLocalError("Informe o valor pago, como 1.234,56.");
    if (!form.paidOn) return setLocalError("Informe a data da baixa.");
    if (!form.bankAccountId) return setLocalError("Escolha a conta bancária.");
    if (!form.paymentMethodId) return setLocalError("Escolha a forma de pagamento.");
    const surcharge = form.surcharge ? parseMoney(form.surcharge) : "0.00";
    const discount = form.discount ? parseMoney(form.discount) : "0.00";
    if (surcharge === null || discount === null) return setLocalError("Confira os valores de juros e desconto.");
    if (form.paidOn < today && !form.note.trim()) return setLocalError("Baixa com data no passado precisa de observação.");
    await run(async () => {
      onDone(
        await payPayable(row.id, {
          amount,
          paidOn: form.paidOn,
          bankAccountId: Number(form.bankAccountId),
          paymentMethodId: Number(form.paymentMethodId),
          surcharge,
          discount,
          transactionId: form.transactionId.trim() || null,
          note: form.note.trim() || null,
        })
      );
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Dar baixa</DialogTitle>
            <DialogDescription>
              {row.payee} · {row.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <p className="text-sm">
              Pendente: <strong>{brl(row.pending)}</strong> de {brl(row.amount)}.
              {due !== row.pending && (
                <>
                  {" "}
                  Com juros e desconto, o total a pagar é <strong>{brl(due)}</strong>.
                </>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valor pago (R$)" id="b-valor" hint="Menor que o pendente vira baixa parcial.">
                <MoneyInput
                  id="b-valor"
                  autoFocus
                  value={amountText}
                  onChange={(event) => {
                    setAmountEdited(true);
                    setForm((current) => ({ ...current, amount: event.target.value }));
                  }}
                />
              </Field>
              <Field label="Data em que o dinheiro saiu" id="b-data">
                <DateInput id="b-data" max={today} {...input("paidOn")} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Conta bancária" id="b-conta" hint={accounts.length ? undefined : NO_ACCOUNT_HINT}>
                <Choice
                  id="b-conta"
                  value={form.bankAccountId}
                  onChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))}
                  options={accounts.map((a) => ({ id: a.id, label: a.name }))}
                />
              </Field>
              <Field label="Forma" id="b-forma">
                <Choice
                  id="b-forma"
                  value={form.paymentMethodId}
                  onChange={(value) => setForm((current) => ({ ...current, paymentMethodId: value }))}
                  options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Juros/multa (R$)" id="b-juros">
                <MoneyInput id="b-juros" placeholder="0,00" {...input("surcharge")} />
              </Field>
              <Field label="Desconto (R$)" id="b-desc">
                <MoneyInput id="b-desc" placeholder="0,00" {...input("discount")} />
              </Field>
            </div>
            <Field label="ID da transação no banco" id="b-trans">
              <Input id="b-trans" className="font-mono text-xs" placeholder="Opcional" {...input("transactionId")} />
            </Field>
            <Field label="Observação" id="b-obs">
              <Input id="b-obs" placeholder="Obrigatória se a data for no passado" {...input("note")} />
            </Field>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-brand-verde text-[#053d27] hover:bg-[#00b56b]">
              <Check size={16} />
              {submitting ? "Confirmando…" : "Confirmar baixa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BatchPaymentDialog({
  rows,
  reference,
  today,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (total: string, count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const payable = rows.filter((row) => row.canPayDirectly);
  const skipped = rows.length - payable.length;
  const total = payable.reduce((sum, row) => sum + Number(row.pending), 0);
  const companyNames = [...new Set(payable.map((row) => row.companyName))];
  const accounts = reference.bankAccounts.filter(
    (account) => reference.companies.find((c) => c.id === account.companyId)?.name === companyNames[0]
  );
  const [form, setForm] = useState({
    paidOn: today,
    bankAccountId: accounts.length === 1 ? String(accounts[0].id) : "",
    paymentMethodId: "",
    note: "",
  });
  const blocker =
    payable.length === 0
      ? "Nenhuma conta da seleção pode ser baixada aqui: provisão não é paga, e lançamento do Connect se paga pelo PDF de comprovantes."
      : companyNames.length > 1
        ? "A baixa em lote usa uma conta bancária só: selecione contas de uma empresa de cada vez."
        : null;
  const ready = form.paidOn && form.bankAccountId && form.paymentMethodId && (form.paidOn >= today || form.note.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await payBatch({
        ids: payable.map((row) => row.id),
        paidOn: form.paidOn,
        bankAccountId: Number(form.bankAccountId),
        paymentMethodId: Number(form.paymentMethodId),
        note: form.note.trim() || null,
      });
      onDone(result.total, result.count);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Baixa em lote</DialogTitle>
            <DialogDescription>
              {plural(payable.length, "conta", "contas")} · total pendente {brl(total)}. Cada uma é baixada pelo seu pendente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {skipped > 0 && !blocker && (
              <Alert>
                <AlertDescription>{plural(skipped, "conta fica", "contas ficam")} de fora: provisão, Connect ou já paga.</AlertDescription>
              </Alert>
            )}
            {blocker ? (
              <Alert variant="destructive">
                <AlertDescription>{blocker}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Data em que saiu" id="lb-data">
                    <DateInput
                      id="lb-data"
                      max={today}
                      value={form.paidOn}
                      onChange={(event) => setForm((current) => ({ ...current, paidOn: event.target.value }))}
                    />
                  </Field>
                  <Field label="Conta bancária" id="lb-conta" hint={accounts.length ? undefined : NO_ACCOUNT_HINT}>
                    <Choice
                      id="lb-conta"
                      value={form.bankAccountId}
                      onChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))}
                      options={accounts.map((a) => ({ id: a.id, label: a.name }))}
                    />
                  </Field>
                  <Field label="Forma" id="lb-forma">
                    <Choice
                      id="lb-forma"
                      value={form.paymentMethodId}
                      onChange={(value) => setForm((current) => ({ ...current, paymentMethodId: value }))}
                      options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                    />
                  </Field>
                </div>
                {form.paidOn < today && (
                  <Field label="Observação" id="lb-obs" hint="Obrigatória para data no passado.">
                    <Input
                      id="lb-obs"
                      value={form.note}
                      onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    />
                  </Field>
                )}
              </>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={Boolean(blocker) || !ready || submitting}
              className="bg-brand-verde text-[#053d27] hover:bg-[#00b56b]"
            >
              <CheckCheck size={16} />
              Baixar {plural(payable.length, "conta", "contas")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  rows,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Excluir contas</DialogTitle>
          <DialogDescription>
            Vamos excluir {plural(rows.length, "conta", "contas")} (total {brl(total)}). Elas saem das listas, e o histórico fica guardado.
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={submitting}
            onClick={() => run(async () => onDone((await deleteBatch(rows.map((row) => row.id))).count))}
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BatchTab = "todas" | "conta" | "anexo";

/** O aviso depois de anexar o mesmo arquivo em várias contas. */
export function attachedMessage(count: number, skipped: number): string {
  return skipped
    ? `Documento anexado em ${plural(count, "conta", "contas")}. ${plural(skipped, "já tinha", "já tinham")} o arquivo.`
    : `Documento anexado em ${plural(count, "conta", "contas")}.`;
}

/**
 * Reclassificar as contas selecionadas e, desde 18/11 (Bruno, com o print "Edição em Lote" do sistema
 * antigo), editar em lote: todas de uma vez (projeto, plano de contas, centro de custo, vencimento e
 * valor), conta por conta (cada uma com os seus valores) ou anexar o mesmo comprovante em todas.
 */
export function ReclassifyDialog({
  rows,
  reference,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  reference: Reference;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [tab, setTab] = useState<BatchTab>("todas");
  const total = rows.reduce((sum, row) => sum + toCents(row.amount), 0) / 100;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          tab === "conta" ? "sm:max-w-[95vw] xl:max-w-[1240px]" : "sm:max-w-[560px]"
        )}
      >
        <DialogHeader>
          <DialogTitle>Reclassificar</DialogTitle>
          <DialogDescription>
            {plural(rows.length, "conta", "contas")} · total {brl(total)}. Mude todas de uma vez, cada uma com os seus
            valores, ou anexe o mesmo comprovante em todas.
          </DialogDescription>
        </DialogHeader>
        {/* min-w-0: a tabela larga do conta por conta rola dentro da janela, sem empurrar o resto */}
        <Tabs className="min-w-0" value={tab} onValueChange={(value) => setTab(value as BatchTab)}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="todas">Todas de uma vez</TabsTrigger>
            <TabsTrigger value="conta">Conta por conta</TabsTrigger>
            <TabsTrigger value="anexo">Anexar comprovante</TabsTrigger>
          </TabsList>
          <TabsContent value="todas">
            <ReclassifyAllForm
              rows={rows}
              reference={reference}
              onCancel={onClose}
              onDone={(count) => onDone(`${plural(count, "conta reclassificada", "contas reclassificadas")}.`)}
            />
          </TabsContent>
          <TabsContent value="conta">
            <BatchEditForm
              rows={rows}
              reference={reference}
              onCancel={onClose}
              onDone={(count) => onDone(`${plural(count, "conta alterada", "contas alteradas")}.`)}
            />
          </TabsContent>
          <TabsContent value="anexo">
            <BatchAttachForm
              rows={rows}
              intro
              defaultKind="comprovante"
              onCancel={onClose}
              onDone={(count, skipped) => onDone(attachedMessage(count, skipped))}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** "Todas de uma vez": o mesmo projeto, plano de contas, centro de custo, vencimento ou valor em todas. */
function ReclassifyAllForm({
  rows,
  reference,
  onCancel,
  onDone,
}: {
  rows: PayableRow[];
  reference: Reference;
  onCancel: () => void;
  onDone: (count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({ projectId: KEEP, categoryId: KEEP, costCenterId: KEEP, dueDate: "", amount: "" });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const changed = (value: string) => (value === KEEP ? null : Number(value));

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Vazio = não mudar. O valor é o mesmo em todas, como no sistema antigo (Camila, 16/11).
    const amount = form.amount.trim() ? parseMoney(form.amount) : null;
    if (form.amount.trim() && (!amount || Number(amount) === 0)) {
      return setLocalError("Confira o valor: use só números, como 1.234,56.");
    }
    const fields = {
      projectId: changed(form.projectId),
      categoryId: changed(form.categoryId),
      costCenterId: changed(form.costCenterId),
      dueDate: form.dueDate || null,
      amount,
    };
    if (!fields.projectId && !fields.categoryId && !fields.costCenterId && !fields.dueDate && !fields.amount) {
      return setLocalError("Escolha o que vai mudar.");
    }
    setLocalError(null);
    await run(async () => onDone((await reclassifyBatch({ ids: rows.map((row) => row.id), ...fields })).count));
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="pt-3 text-xs text-muted-foreground">
        O que ficar em &quot;Não mudar&quot; ou vazio continua como está; o que você escolher vale para todas.
      </p>
      <div className="flex flex-col gap-3.5 py-4">
        <Field label="Projeto" id="rc-proj" hint="Mudar o projeto deixa a conta 100% nele.">
          <Choice
            id="rc-proj"
            value={form.projectId}
            onChange={set("projectId")}
            options={[
              { id: KEEP, label: "Não mudar" },
              ...reference.projects
                .filter(openForLaunch)
                .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
            ]}
          />
        </Field>
        <Field label="Plano de contas" id="rc-cat">
          <Choice
            id="rc-cat"
            value={form.categoryId}
            onChange={set("categoryId")}
            options={[
              { id: KEEP, label: "Não mudar" },
              ...expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` })),
            ]}
          />
        </Field>
        <Field label="Centro de custo" id="rc-cc">
          <Choice
            id="rc-cc"
            value={form.costCenterId}
            onChange={set("costCenterId")}
            options={[
              { id: KEEP, label: "Não mudar" },
              ...reference.costCenters.map((c) => ({ id: c.id, label: c.label })),
            ]}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vencimento" id="rc-venc" hint="Vazio: cada uma fica com o seu.">
            <DateInput id="rc-venc" value={form.dueDate} onChange={(event) => set("dueDate")(event.target.value)} />
          </Field>
          <Field label="Valor principal (R$)" id="rc-valor" hint="Vazio: cada uma fica com o seu.">
            <MoneyInput
              id="rc-valor"
              placeholder="Não mudar"
              value={form.amount}
              onChange={(event) => set("amount")(event.target.value)}
            />
          </Field>
        </div>
        {form.dueDate && <BusinessDayNotice date={form.dueDate} onPick={set("dueDate")} />}
        <FormError message={localError ?? error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          <Tags size={16} />
          Reclassificar {plural(rows.length, "conta", "contas")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** O mesmo arquivo em várias contas (Camila, 16/11: "selecionava todos os lançamentos e anexava"). */
/** O formulário de anexar o mesmo arquivo em várias contas: na janela própria e no Reclassificar. */
export function BatchAttachForm({
  rows,
  intro = false,
  defaultKind = DEFAULT_DOCUMENT_KIND,
  onCancel,
  onDone,
}: {
  rows: PayableRow[];
  /** Mostra a explicação no próprio formulário (no Reclassificar, que não tem o título da janela). */
  intro?: boolean;
  defaultKind?: string;
  onCancel: () => void;
  onDone: (count: number, skipped: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<string>(defaultKind);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setLocalError("Escolha o arquivo.");
    if (file.size > MAX_DOCUMENT_BYTES) return setLocalError("O arquivo passa de 20 MB.");
    setLocalError(null);
    await run(async () => {
      const result = await attachBatch(
        rows.map((row) => row.id),
        file,
        kind
      );
      onDone(result.count, result.skipped);
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      {intro && (
        <p className="pt-3 text-xs text-muted-foreground">
          O mesmo arquivo vai para {plural(rows.length, "conta", "contas")}, como anexo (não dá baixa). Quem já tem esse
          arquivo fica como está.
        </p>
      )}
      <div className="flex flex-col gap-3.5 py-4">
        <Field label="Tipo do documento" id="ba-tipo">
          <Choice id="ba-tipo" value={kind} onChange={setKind} options={DOCUMENT_KINDS} />
        </Field>
        <Field label="Arquivo *" id="ba-arquivo" hint={DOCUMENT_HINT}>
          <FilePicker
            id="ba-arquivo"
            accept={DOCUMENT_ACCEPT}
            disabled={submitting}
            status={file?.name}
            onPick={(files) => setFile(files[0] ?? null)}
          />
        </Field>
        <FormError message={localError ?? error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          <Paperclip size={16} />
          {submitting ? "Anexando…" : `Anexar em ${plural(rows.length, "conta", "contas")}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BatchAttachDialog({
  rows,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  onClose: () => void;
  onDone: (count: number, skipped: number) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Anexar em várias contas</DialogTitle>
          <DialogDescription>
            O mesmo arquivo vai para {plural(rows.length, "conta", "contas")}. Quem já tem esse arquivo fica como está.
          </DialogDescription>
        </DialogHeader>
        <BatchAttachForm rows={rows} onCancel={onClose} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateDialog({
  rows,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Duplicar</DialogTitle>
          <DialogDescription>
            Vamos criar uma cópia de {plural(rows.length, "conta", "contas")}, sem baixas e com vencimento um mês depois. O número do documento e o código de barras ficam em branco.
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            disabled={submitting}
            onClick={() => run(async () => onDone((await duplicateBatch(rows.map((row) => row.id))).count))}
          >
            <Copy size={16} />
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReplaceProvisionDialog({
  row,
  reference,
  onClose,
  onDone,
}: {
  row: PayableRow;
  reference: Reference;
  onClose: () => void;
  onDone: (real: PayableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReplacementCandidate[]>([]);
  const [choice, setChoice] = useState(NEW_REAL);
  const [amount, setAmount] = useState("");
  const [supplierId, setSupplierId] = useState("");

  // Sem a lista, ainda dá para lançar o valor real agora.
  useEffect(() => {
    getReplacementCandidates(row.id).then(setCandidates, () => setCandidates([]));
  }, [row.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let body: unknown = { realId: Number(choice) };
    if (choice === NEW_REAL) {
      const parsed = parseMoney(amount);
      if (!parsed || Number(parsed) === 0) return setLocalError("Informe o valor real.");
      if (!supplierId) return setLocalError("Escolha o fornecedor.");
      body = { amount: parsed, supplierId: Number(supplierId) };
    }
    setLocalError(null);
    await run(async () => onDone(await replaceProvision(row.id, body)));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Substituir provisão pelo valor real</DialogTitle>
            <DialogDescription>
              {row.description} · provisão de {brl(row.amount)} para {formatDate(row.dueDate)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <Field label="Qual é o valor real?" id="pr-qual">
              <Choice
                id="pr-qual"
                value={choice}
                onChange={setChoice}
                options={[
                  { id: NEW_REAL, label: "Lançar o valor real agora" },
                  ...candidates.map((c) => ({ id: c.id, label: `Conta já lançada: ${c.description} · ${brl(c.amount)}` })),
                ]}
              />
            </Field>
            {choice === NEW_REAL && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Valor real (R$)" id="pr-valor">
                  <MoneyInput
                    id="pr-valor"
                    placeholder="0,00"
                    autoFocus
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Field>
                <Field label="Fornecedor" id="pr-forn">
                  <Choice
                    id="pr-forn"
                    value={supplierId}
                    onChange={setSupplierId}
                    options={reference.suppliers.map((s) => ({ id: s.id, label: `${s.nickname} · ${s.name}` }))}
                  />
                </Field>
              </div>
            )}
            <p className="text-xs text-muted-foreground">A provisão sai do previsto e o real entra no lugar, sem contar duas vezes.</p>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              <Replace size={16} />
              Substituir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ColumnsDialog({
  columns,
  selected,
  density,
  onClose,
  onApply,
}: {
  columns: { id: string; label: string; fixed?: boolean }[];
  selected: string[];
  density: "comfortable" | "compact";
  onClose: () => void;
  onApply: (columns: string[], density: "comfortable" | "compact") => void;
}) {
  const [current, setCurrent] = useState(new Set(selected));
  const [chosenDensity, setChosenDensity] = useState(density);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Colunas e densidade</DialogTitle>
          <DialogDescription>Fica guardado neste navegador.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {columns.map((column) => (
            <div key={column.id} className="flex items-center gap-2">
              <Checkbox
                id={`col-${column.id}`}
                checked={current.has(column.id)}
                disabled={column.fixed}
                onCheckedChange={(checked) =>
                  setCurrent((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(column.id);
                    else next.delete(column.id);
                    return next;
                  })
                }
              />
              <Label htmlFor={`col-${column.id}`} className="text-[13px] font-normal">
                {column.label}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <span className="text-[13px] font-semibold">Densidade da tabela</span>
          <RadioGroup
            value={chosenDensity}
            onValueChange={(value) => setChosenDensity(value as "comfortable" | "compact")}
            className="flex gap-5"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="comfortable" id="dens-comfortable" />
              <Label htmlFor="dens-comfortable" className="text-[13px] font-normal">
                Confortável
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="compact" id="dens-compact" />
              <Label htmlFor="dens-compact" className="text-[13px] font-normal">
                Compacta
              </Label>
            </div>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onApply(columns.filter((c) => current.has(c.id)).map((c) => c.id), chosenDensity)}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O motivo do cancelamento, que fica no histórico ("Cancelada: contrato encerrado"). */
function cancelReason(payable: PayableDetail): string | null {
  const event = payable.events.find((e) => e.text.startsWith("Cancelada: "));
  return event ? event.text.slice("Cancelada: ".length) : null;
}

const PAYMENT_KINDS: Record<Payment["kind"], string> = {
  pagamento: "Baixa",
  estorno: "Estorno",
  devolucao: "Pix devolvido",
};

/** As chamadas e as palavras da série no Contas a pagar: a lista e o detalhe usam as mesmas. */
export const PAYABLE_SERIES_API: SeriesApi = { edit: editSeries, cancel: cancelSeries };

export const PAYABLE_SERIES_TEXTS: SeriesTexts = {
  canceled: ["conta cancelada", "contas canceladas"],
  changed: ["conta alterada", "contas alteradas"],
  settled: "O que já foi pago",
  none: "Nenhuma conta mudou: todas já têm baixa ou estão canceladas.",
  many: "contas",
};

/** Valor, pago e pendente da conta, com a barra de quanto já foi pago. */
function PayableSummary({ payable }: { payable: PayableDetail }) {
  const percent = percentOf(payable.paid, payable.amount);
  const payments = payable.payments.filter((payment) => payment.kind === "pagamento" && !payment.reversed).length;
  return (
    <AmountSummary
      percent={percent}
      progressText={`${percent}% pago`}
      items={[
        { label: "Valor", value: brl(payable.amount), hint: `vence ${formatDate(payable.dueDate)}`, icon: Wallet, tone: "azul" },
        {
          label: "Pago",
          value: brl(payable.paid),
          hint: payments ? plural(payments, "baixa", "baixas") : "nenhuma baixa",
          icon: CircleCheck,
          tone: "verde",
        },
        {
          label: "Pendente",
          value: brl(payable.pending),
          hint: Number(payable.pending) > 0 ? "falta pagar" : "nada a pagar",
          icon: Hourglass,
          tone: "ambar",
        },
      ]}
    />
  );
}

export function DetailDialog({
  id,
  initialTab = "detalhes",
  today,
  reference,
  onClose,
  onChanged,
  onReplace,
}: {
  id: number;
  /** A aba em que abre: o clipe da lista abre em Documentos. */
  initialTab?: string;
  today: string;
  reference: Reference;
  onClose: () => void;
  onChanged: () => void;
  onReplace: (payable: PayableDetail) => void;
}) {
  // A aba Repetir leva de uma ocorrência da série para outra sem fechar a janela.
  const [currentId, setCurrentId] = useState(id);
  const [loaded, setLoaded] = useState<PayableDetail | null>(null);
  const [loadError, setLoadError] = useState<{ id: number; message: string } | null>(null);
  // Sobe quando a série muda (valor, cancelamento): recarrega a conta e a lista da aba Repetir.
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState(initialTab);
  const [action, setAction] = useState<
    | { kind: "pay" }
    | { kind: "series"; mode: "edit" | "cancel" }
    | { kind: "reverse"; payment: Payment; type: "estorno" | "devolucao" }
    | { kind: "remove-document"; attachment: Attachment }
    | null
  >(null);

  useEffect(() => {
    let live = true;
    getPayable(currentId).then(
      (next) => live && setLoaded(next),
      (err) =>
        live &&
        setLoadError({
          id: currentId,
          message: err instanceof ApiError ? err.message : "Não foi possível abrir a conta",
        })
    );
    return () => {
      live = false;
    };
  }, [currentId, version]);

  // Enquanto a outra ocorrência carrega, a anterior não aparece no lugar dela.
  const payable = loaded?.id === currentId ? loaded : null;
  const failure = loadError?.id === currentId ? loadError.message : null;
  // Editar e cancelar só existem enquanto a conta aceita: cancelada, substituída e do Connect não têm.
  const canEdit =
    payable !== null &&
    payable.situation !== "cancelado" &&
    payable.situation !== "substituido" &&
    payable.origin !== "connect";
  const canCancel = canEdit && Number(payable?.paid) === 0;
  // Se a aba escolhida deixou de existir (conta cancelada, por exemplo), volta para Detalhes.
  const shownTab = (tab === "editar" && !canEdit) || (tab === "cancelar" && !canCancel) ? "detalhes" : tab;

  function updated(next: PayableDetail, message: string) {
    setLoaded(next);
    setAction(null);
    toast.success(message);
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        {failure ? (
          <>
            <DialogHeader>
              <DialogTitle>Detalhes da conta</DialogTitle>
              <DialogDescription>Não foi possível abrir.</DialogDescription>
            </DialogHeader>
            <ErrorBox message={failure} />
          </>
        ) : !payable ? (
          <>
            <DialogHeader>
              <DialogTitle>Detalhes da conta</DialogTitle>
              <DialogDescription>Carregando…</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{payable.description}</DialogTitle>
              <DialogDescription>
                {payable.payee} · vence em {formatDate(payable.dueDate)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              {payable.type === "provisao" && <ProvisionTag />}
              <SituationTag situation={payable.situation} />
              <OriginTag origin={payable.origin} />
            </div>
            <PayableSummary payable={payable} />
            {payable.docsLate && payable.docsReceivedOn && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <FileClock />
                <AlertTitle>Documentação atrasada</AlertTitle>
                <AlertDescription className="text-amber-900/90">
                  A documentação chegou em {formatDate(payable.docsReceivedOn)}, menos de 3 dias antes do vencimento (
                  {formatDate(payable.dueDate)}).
                </AlertDescription>
              </Alert>
            )}
            {payable.situation === "cancelado" && (
              <Alert className="border-border bg-muted/50">
                <Ban />
                <AlertTitle>Conta cancelada</AlertTitle>
                <AlertDescription>
                  Ela não vale: não entra nos totais e não é paga, mas fica guardada com o histórico.
                  {cancelReason(payable) && ` Motivo: ${cancelReason(payable)}`}
                </AlertDescription>
              </Alert>
            )}
            {payable.situation === "devolvido" && (
              <Alert className="border-red-200 bg-red-50 text-red-800">
                <Undo2 />
                <AlertTitle>Pix devolvido</AlertTitle>
                <AlertDescription className="text-red-800/90">
                  O dinheiro voltou e o valor está pendente de novo. Peça ao supervisor para corrigir a chave no Connect e
                  dê uma nova baixa, com a data em que o pagamento sair.
                </AlertDescription>
              </Alert>
            )}
            {canEdit && payable.canReplace && (
              <div className="flex">
                <Button variant="outline" size="sm" onClick={() => onReplace(payable)}>
                  <Replace size={14} />
                  Substituir pelo valor real
                </Button>
              </div>
            )}
            <Tabs value={shownTab} onValueChange={setTab}>
              <TabsList className="group-data-[orientation=horizontal]/tabs:h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="detalhes" className={TAB_BUTTON}>Detalhes</TabsTrigger>
                {canEdit && (
                  <TabsTrigger value="editar" className={TAB_BUTTON}>
                    <Pencil size={14} />
                    Editar conta
                  </TabsTrigger>
                )}
                <TabsTrigger value="baixas" className={TAB_BUTTON}>Baixas ({payable.payments.length})</TabsTrigger>
                <TabsTrigger value="documentos" className={TAB_BUTTON}>Documentos ({payable.attachments.length})</TabsTrigger>
                {payable.items.length > 0 && <TabsTrigger value="itens" className={TAB_BUTTON}>Itens ({payable.items.length})</TabsTrigger>}
                {payable.series && <TabsTrigger value="repetir" className={TAB_BUTTON}>Repetir ({payable.series.count})</TabsTrigger>}
                {canCancel && (
                  <TabsTrigger value="cancelar" className={cn(TAB_BUTTON, TAB_BUTTON_DANGER)}>
                    Cancelar conta
                  </TabsTrigger>
                )}
                <TabsTrigger value="historico" className={TAB_BUTTON}>Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="detalhes" className="pt-3">
                <DetailFields payable={payable} />
              </TabsContent>
              <TabsContent value="baixas" className="flex flex-col gap-3 pt-3">
                {payable.canPayDirectly && (
                  <div className="flex">
                    <Button size="sm" onClick={() => setAction({ kind: "pay" })}>
                      <Check size={14} />
                      Registrar baixa
                    </Button>
                  </div>
                )}
                {payable.payments.length ? (
                  <ul className="flex flex-col gap-2">
                    {payable.payments.map((payment) => (
                      <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-[13px]">
                        <div className={cn(payment.reversed && "text-muted-foreground line-through")}>
                          <strong>
                            {PAYMENT_KINDS[payment.kind]} de {brl(payment.amount)}
                          </strong>{" "}
                          em {formatDate(payment.paidOn)}
                          <span className="block text-xs">
                            {payment.bankAccountName} · {payment.paymentMethodName}
                            {Number(payment.surcharge) > 0 && ` · ${brl(payment.surcharge)} de juros/multa`}
                            {Number(payment.discount) > 0 && ` · ${brl(payment.discount)} de desconto`}
                          </span>
                          {payment.transactionId && (
                            <span className="block font-mono text-xs">ID da transação: {payment.transactionId}</span>
                          )}
                          {payment.note && <span className="block text-xs">{payment.note}</span>}
                        </div>
                        {payment.kind === "pagamento" && !payment.reversed && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAction({ kind: "reverse", payment, type: "estorno" })}
                            >
                              <Undo2 size={14} />
                              Estornar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAction({ kind: "reverse", payment, type: "devolucao" })}
                            >
                              Pix devolvido
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma baixa ainda.</p>
                )}
              </TabsContent>
              <TabsContent value="documentos" className="pt-3">
                <DocumentsPanel
                  attachments={payable.attachments}
                  from="da conta"
                  api={{
                    attach: (file, kind) => attachDocument(payable.id, file, kind),
                    download: (attachmentId) => downloadDocument(payable.id, attachmentId),
                    rename: (attachmentId, change) => renameDocument(payable.id, attachmentId, change),
                    reload: () => getPayable(payable.id),
                  }}
                  onChanged={(next, message) => {
                    setLoaded(next);
                    // Anexou ou renomeou: a lista de trás recarrega, e o clipe da linha acende junto (18/11).
                    // Baixar não muda nada na lista (vem sem mensagem).
                    if (message) {
                      toast.success(message);
                      onChanged();
                    }
                  }}
                  onRemove={(attachment) => setAction({ kind: "remove-document", attachment })}
                />
              </TabsContent>
              {payable.series && (
                <TabsContent value="repetir" className="pt-3">
                  <SeriesPanel
                    key={`${version}-${payable.events.length}`}
                    currentId={payable.id}
                    series={payable.series}
                    words={["conta", "contas"]}
                    load={listSeries}
                    situation={(value) => <SituationTag situation={value as Situation} />}
                    onOpen={(next) => {
                      setAction(null);
                      setCurrentId(next);
                    }}
                    actions={
                      payable.situation !== "cancelado" &&
                      payable.situation !== "substituido" && (
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setAction({ kind: "series", mode: "edit" })}>
                            Alterar a série
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setAction({ kind: "series", mode: "cancel" })}>
                            Cancelar contas da série
                          </Button>
                        </div>
                      )
                    }
                  />
                </TabsContent>
              )}
              {payable.items.length > 0 && (
                <TabsContent value="itens" className="pt-3">
                  <ItemsPanel payable={payable} />
                </TabsContent>
              )}
              {canEdit && (
                <TabsContent value="editar" className="pt-3">
                  <EditForm
                    key={payable.events.length}
                    payable={payable}
                    reference={reference}
                    onClose={() => setTab("detalhes")}
                    onDone={(next) => {
                      updated(next, "Conta alterada.");
                      setTab("detalhes");
                    }}
                  />
                </TabsContent>
              )}
              {canCancel && (
                <TabsContent value="cancelar" className="pt-3">
                  <ReasonForm
                    title="Cancelar conta"
                    confirm="Cancelar conta"
                    onClose={() => setTab("detalhes")}
                    submit={(reason) => cancelPayable(payable.id, reason)}
                    onDone={(next) => {
                      updated(next, "Conta cancelada.");
                      setTab("detalhes");
                    }}
                  />
                </TabsContent>
              )}
              <TabsContent value="historico" className="pt-3">
                <ul className="flex flex-col gap-2">
                  {payable.events.map((event, index) => (
                    <li key={index} className="text-[13px]">
                      {event.text}
                      <span className="block text-xs text-muted-foreground">
                        {event.userName} · {new Date(event.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </span>
                    </li>
                  ))}
                  {!payable.events.length && (
                    <li className="py-4 text-center text-sm text-muted-foreground">Sem alterações registradas.</li>
                  )}
                </ul>
              </TabsContent>
            </Tabs>
            {action?.kind === "remove-document" && (
              <ReasonForm
                title={`Tirar o documento ${action.attachment.name}`}
                hint="Ele sai da conta, mas o arquivo continua guardado. Quem tirou e o motivo ficam no histórico."
                confirm="Tirar documento"
                onClose={() => setAction(null)}
                submit={(reason) => removeDocument(payable.id, action.attachment.id, reason)}
                onDone={(next) => updated(next, "Documento tirado da conta.")}
              />
            )}
            {action?.kind === "pay" && (
              <PaymentDialog
                row={payable}
                reference={reference}
                today={today}
                onClose={() => setAction(null)}
                onDone={(next) =>
                  updated(
                    next,
                    Number(next.pending) > 0
                      ? `Baixa parcial feita. Ainda faltam ${brl(next.pending)}.`
                      : `Conta paga: ${next.description}.`
                  )
                }
              />
            )}
            {action?.kind === "series" && payable.series && (
              <SeriesDialog
                row={payable}
                mode={action.mode}
                api={PAYABLE_SERIES_API}
                texts={PAYABLE_SERIES_TEXTS}
                onClose={() => setAction(null)}
                onDone={(message) => {
                  setAction(null);
                  toast.success(message);
                  onChanged();
                  setVersion((value) => value + 1);
                }}
              />
            )}
            {action?.kind === "reverse" && (
              <ReasonForm
                title={
                  action.type === "estorno"
                    ? `Estornar a baixa de ${brl(action.payment.amount)}`
                    : `Registrar o Pix devolvido de ${brl(action.payment.amount)}`
                }
                hint="A baixa original continua visível, e o valor volta a pendente."
                confirm={action.type === "estorno" ? "Estornar" : "Registrar devolução"}
                date={
                  action.type === "devolucao"
                    ? { label: "Data em que o dinheiro voltou", min: action.payment.paidOn, max: today }
                    : undefined
                }
                onClose={() => setAction(null)}
                submit={(reason, on) =>
                  reversePayment(payable.id, action.payment.id, { kind: action.type, reason, on: on || null })
                }
                onDone={(next) => updated(next, `Feito. Pendente agora: ${brl(next.pending)}.`)}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  payable,
  reference,
  onClose,
  onDone,
}: {
  payable: PayableDetail;
  reference: Reference;
  onClose: () => void;
  onDone: (payable: PayableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>(draftsFrom(payable.adjustments));
  // O projeto ou a divisão entre projetos também se edita aqui (testes de 16/11, A4).
  const [split, setSplit] = useState<AllocationRow[]>(splitRowsFrom(payable.allocations));
  const [form, setForm] = useState({
    description: payable.description,
    amount: toField(payable.grossAmount),
    dueDate: payable.dueDate,
    projectId: payable.allocations.length === 1 ? String(payable.allocations[0].projectId) : "",
    unitId: String(payable.unitId),
    supplierId: payable.supplierId ? String(payable.supplierId) : "",
    categoryId: String(payable.categoryId),
    costCenterId: String(payable.costCenterId),
    paymentMethodId: String(payable.paymentMethodId),
    documentType: payable.documentType,
    documentNumber: payable.documentNumber ?? "",
    documentDate: payable.documentDate ?? "",
    barcode: payable.barcode ?? "",
    competence: payable.competence ?? "",
    docsReceivedOn: payable.docsReceivedOn ?? "",
    payOn: payable.payOn ?? "",
    notes: payable.notes ?? "",
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => set(key)(event.target.value),
  });
  // Lançamento com itens (folha, incentivo) tem o fornecedor nas pessoas, não aqui.
  const editSupplier = payable.items.length === 0;
  const companyName = (companyId: number) => reference.companies.find((c) => c.id === companyId)?.name ?? "";
  // Projeto fechado ou inativo não recebe conta nova; o da própria conta continua na lista para aparecer.
  const current = new Set(payable.allocations.map((a) => a.projectId));
  const projects = reference.projects.filter((p) => openForLaunch(p) || current.has(p.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const parsed = parseMoney(form.amount);
    if (!parsed || Number(parsed) === 0) return setLocalError("Informe o valor.");
    if (!form.description.trim() || !form.dueDate) return setLocalError("Preencha a descrição e o vencimento.");
    const adjusted = parseDrafts(adjustments);
    if (adjusted.error) return setLocalError(adjusted.error);
    if (editSupplier && Number(netText(form.amount, adjustments)) <= 0) return setLocalError(NET_ZERO_MESSAGE);
    if (editSupplier && !form.supplierId && payable.type === "real") return setLocalError("Escolha o fornecedor.");
    if (form.documentType === "NF" && (!form.documentNumber.trim() || !form.documentDate)) {
      return setLocalError("Informe o número e a data de emissão da nota.");
    }
    const divided = buildAllocations(split, parsed);
    if (divided.error) return setLocalError(divided.error);
    // Sem projeto escolhido (conta antiga, importada sem projeto), o rateio não vai e nada muda.
    const allocations = divided.allocations.length
      ? divided.allocations
      : form.projectId
        ? [{ projectId: Number(form.projectId), amount: parsed }]
        : null;
    await run(async () =>
      onDone(
        await updatePayable(payable.id, {
          description: form.description,
          amount: parsed,
          dueDate: form.dueDate,
          ...(allocations ? { allocations } : {}),
          ...(form.unitId !== String(payable.unitId) ? { unitId: Number(form.unitId) } : {}),
          ...(editSupplier && form.supplierId ? { supplierId: Number(form.supplierId) } : {}),
          categoryId: Number(form.categoryId),
          costCenterId: Number(form.costCenterId),
          paymentMethodId: Number(form.paymentMethodId),
          documentType: form.documentType,
          documentNumber: form.documentNumber.trim() || null,
          documentDate: form.documentDate || null,
          barcode: form.barcode.trim() || null,
          competence: form.competence || null,
          docsReceivedOn: form.docsReceivedOn || null,
          payOn: form.payOn || null,
          notes: form.notes.trim() || null,
          // conta com pessoas não tem acréscimos, descontos nem impostos
          ...(editSupplier ? { adjustments: adjusted.lines } : {}),
        })
      )
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <strong className="text-[13px]">Editar conta</strong>
      <Field label="Descrição" id="e-desc">
        <Input id="e-desc" maxLength={255} {...input("description")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Vencimento" id="e-venc">
          <DateInput id="e-venc" {...input("dueDate")} />
        </Field>
        <Field label="Pagar em" id="e-pagar-em">
          <DateInput id="e-pagar-em" {...input("payOn")} />
        </Field>
        <Field label="Competência" id="e-comp">
          <MonthInput id="e-comp" {...input("competence")} />
        </Field>
      </div>
      <BusinessDayNotice date={form.dueDate} onPick={set("dueDate")} unlessDate={payable.dueDate} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Projeto"
          id="e-proj"
          hint={split.length ? "Vale a divisão abaixo." : "Ou divida entre projetos mais abaixo."}
        >
          <Choice
            id="e-proj"
            searchable
            value={form.projectId || NO_PROJECT}
            onChange={(value) => set("projectId")(value === NO_PROJECT ? "" : value)}
            options={[
              // só a conta que já está sem projeto (importada do sistema antigo) mostra essa opção
              ...(payable.allocations.length ? [] : [{ id: NO_PROJECT, label: "Sem projeto" }]),
              ...projects.map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
            ]}
          />
        </Field>
        <Field label="Unidade" id="e-uni" hint="A empresa vem da unidade. Conta com baixa não muda de empresa.">
          <Choice
            id="e-uni"
            searchable
            value={form.unitId}
            onChange={set("unitId")}
            options={reference.units.map((u) => ({ id: u.id, label: `${u.name} · ${companyName(u.companyId)}` }))}
          />
        </Field>
        {editSupplier && (
          <Field label="Fornecedor" id="e-forn">
            <Choice
              id="e-forn"
              value={form.supplierId}
              onChange={set("supplierId")}
              options={reference.suppliers.map((s) => ({ id: s.id, label: `${s.nickname} · ${s.name}` }))}
            />
          </Field>
        )}
        <Field label="Plano de contas" id="e-cat">
          <Choice
            id="e-cat"
            value={form.categoryId}
            onChange={set("categoryId")}
            options={expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
          />
        </Field>
        <Field label="Centro de custo" id="e-cc">
          <Choice
            id="e-cc"
            value={form.costCenterId}
            onChange={set("costCenterId")}
            options={reference.costCenters.map((c) => ({ id: c.id, label: c.label }))}
          />
        </Field>
        <Field label="Forma de pagamento" id="e-forma">
          <Choice
            id="e-forma"
            searchable
            value={form.paymentMethodId}
            onChange={set("paymentMethodId")}
            options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
          />
        </Field>
      </div>
      {editSupplier ? (
        <ValuesCard
          grossId="e-valor"
          grossLabel="Valor principal (R$)"
          gross={form.amount}
          onGrossChange={set("amount")}
          drafts={adjustments}
          onChange={setAdjustments}
        />
      ) : (
        // lançamento com pessoas: o valor é a soma delas, e não tem acréscimos, descontos nem impostos
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor principal (R$)" id="e-valor">
            <MoneyInput id="e-valor" {...input("amount")} />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Documento" id="e-doc">
          <Choice
            id="e-doc"
            value={form.documentType}
            onChange={set("documentType")}
            options={DOCUMENT_TYPES.map((type) => ({ id: type, label: type }))}
          />
        </Field>
        <Field label="Número do documento" id="e-docn">
          <Input id="e-docn" maxLength={50} {...input("documentNumber")} />
        </Field>
        <Field label="Emissão do documento" id="e-doce">
          <DateInput id="e-doce" {...input("documentDate")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código de barras / linha digitável" id="e-barras">
          <Input id="e-barras" className="font-mono text-xs" maxLength={60} {...input("barcode")} />
        </Field>
        <Field label="Documentação recebida em" id="e-docrec">
          <DateInput id="e-docrec" {...input("docsReceivedOn")} />
        </Field>
      </div>
      <Field label="Observações" id="e-obs">
        <Textarea id="e-obs" maxLength={2000} {...input("notes")} />
      </Field>
      <ProjectSplit
        rows={split}
        onChange={setSplit}
        projects={projects.filter((project) => project.status !== "encerrado")}
        amount={parseMoney(form.amount) ?? ""}
        disabled={submitting}
      />
      <FormError message={localError ?? error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={onClose}>
          Voltar
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

function ReasonForm({
  title,
  hint,
  confirm,
  date,
  onClose,
  submit,
  onDone,
}: {
  title: string;
  hint?: string;
  confirm: string;
  date?: { label: string; min: string; max: string };
  onClose: () => void;
  submit: (reason: string, on: string) => Promise<PayableDetail>;
  onDone: (payable: PayableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(date?.max ?? "");
  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => onDone(await submit(reason, on)));
      }}
    >
      <strong className="text-[13px]">{title}</strong>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {date && (
        <Field label={date.label} id="r-data">
          <DateInput id="r-data" min={date.min} max={date.max} value={on} onChange={(event) => setOn(event.target.value)} />
        </Field>
      )}
      <Field label="Motivo" id="r-motivo">
        <Textarea
          id="r-motivo"
          placeholder="Fica registrado no histórico"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={onClose}>
          Voltar
        </Button>
        <Button type="submit" variant="destructive" size="sm" disabled={submitting || !reason.trim()}>
          {confirm}
        </Button>
      </div>
    </form>
  );
}
