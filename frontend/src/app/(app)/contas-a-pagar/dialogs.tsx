"use client";

import { Check, CheckCheck, Copy, Replace, Search, Tags, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { ErrorBox, Field, FormError, NUM, OriginTag, ProvisionTag, SituationTag, TD, TH, Tag } from "@/components/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ProjectSplit } from "@/components/ProjectSplit";
import { NO_RECURRENCE, RecurrenceFields, type RecurrenceState } from "@/components/RecurrenceFields";
import {
  ApiError,
  cancelPayable,
  createPayable,
  createSeries,
  deleteBatch,
  duplicateBatch,
  getPayable,
  getReplacementCandidates,
  payBatch,
  payPayable,
  reclassifyBatch,
  replaceProvision,
  reversePayment,
  updatePayable,
} from "@/lib/api";
import {
  addDays,
  brl,
  expenseCategories,
  formatDate,
  inssAmount,
  itemPaymentLabel,
  occurrenceEdits,
  buildAllocations,
  parseMoney,
  plural,
  toCents,
  toField,
  type AllocationRow,
  type PayableDetail,
  type PayableRow,
  type Payment,
  type Reference,
  type ReplacementCandidate,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

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
  const [form, setForm] = useState({
    issueDate: today,
    dueDate: addDays(today, 7),
    amount: "",
    isProvision: false,
    supplierId: "",
    categoryId: "",
    description: "",
    companyId: "",
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
    !expenseCategories(reference).length && "categorias",
    !reference.companies.length && "empresas",
    !reference.units.length && "unidades",
    !reference.costCenters.length && "centros de custo",
    !reference.paymentMethods.length && "formas de pagamento",
  ].filter(Boolean);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoney(form.amount);
    if (!amount || Number(amount) === 0) return setLocalError("Informe um valor maior que zero.");
    const required = [
      form.isProvision || form.supplierId,
      form.categoryId,
      form.companyId,
      form.unitId,
      form.costCenterId,
      form.paymentMethodId,
      form.description.trim(),
      form.issueDate,
      form.dueDate,
    ];
    if (required.some((value) => !value)) return setLocalError("Preencha os campos com *.");
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
    if (recurrence.repeat && !recurrence.rows) {
      return setLocalError("Clique em Simular para conferir as ocorrências antes de salvar.");
    }
    const body = {
        type: form.isProvision ? "provisao" : "real",
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        amount,
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        categoryId: Number(form.categoryId),
        companyId: Number(form.companyId),
        unitId: Number(form.unitId),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>Os campos com * são obrigatórios. O resto fica em &quot;Mais informações&quot;.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {missingRecords.length > 0 && (
              <Alert>
                <AlertDescription>Ainda faltam cadastros: {missingRecords.join(", ")}.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Data *" id="p-data">
                <Input id="p-data" type="date" {...input("issueDate")} />
              </Field>
              <Field label="Vencimento *" id="p-venc">
                <Input id="p-venc" type="date" {...input("dueDate")} />
              </Field>
              <Field label="Valor (R$) *" id="p-valor">
                <Input id="p-valor" inputMode="decimal" placeholder="0,00" autoFocus {...input("amount")} />
              </Field>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                id="p-prov"
                checked={form.isProvision}
                onCheckedChange={(checked) => set("isProvision")(checked === true)}
              />
              <Label htmlFor="p-prov" className="text-xs font-normal">
                É uma provisão: valor previsto, que depois é substituído pelo real
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={form.isProvision ? "Fornecedor" : "Fornecedor *"} id="p-forn">
                <Choice
                  id="p-forn"
                  value={form.supplierId}
                  onChange={set("supplierId")}
                  options={reference.suppliers.map((s) => ({ id: s.id, label: `${s.nickname} · ${s.name}` }))}
                />
              </Field>
              <Field label="Categoria *" id="p-cat">
                <Choice
                  id="p-cat"
                  value={form.categoryId}
                  onChange={set("categoryId")}
                  options={expenseCategories(reference).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
                />
              </Field>
            </div>
            <Field label="Descrição *" id="p-desc">
              <Input id="p-desc" placeholder="Ex.: Aluguel do escritório · novembro" {...input("description")} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Empresa *" id="p-emp">
                <Choice
                  id="p-emp"
                  value={form.companyId}
                  onChange={(value) => setForm((current) => ({ ...current, companyId: value, unitId: "" }))}
                  options={reference.companies.map((c) => ({ id: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Unidade *" id="p-uni">
                <Choice
                  id="p-uni"
                  value={form.unitId}
                  onChange={set("unitId")}
                  placeholder={form.companyId ? "Selecione" : "Escolha a empresa"}
                  options={reference.units
                    .filter((u) => String(u.companyId) === form.companyId)
                    .map((u) => ({ id: u.id, label: u.name }))}
                />
              </Field>
              <Field label="Centro de custo *" id="p-cc">
                <Choice
                  id="p-cc"
                  value={form.costCenterId}
                  onChange={set("costCenterId")}
                  options={reference.costCenters.map((c) => ({ id: c.id, label: c.name }))}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Forma de pagamento *" id="p-forma">
                <Choice
                  id="p-forma"
                  value={form.paymentMethodId}
                  onChange={set("paymentMethodId")}
                  options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                />
              </Field>
              <Field
                label="Projeto"
                id="p-proj"
                hint={split.length ? "Vale a divisão abaixo." : "Ou divida entre projetos logo abaixo."}
              >
                <Choice
                  id="p-proj"
                  value={form.projectId || NO_PROJECT}
                  onChange={(value) => set("projectId")(value === NO_PROJECT ? "" : value)}
                  options={[
                    { id: NO_PROJECT, label: "Sem projeto" },
                    ...reference.projects
                      .filter((p) => p.status !== "encerrado")
                      .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
                  ]}
                />
              </Field>
            </div>
            <ProjectSplit
              rows={split}
              onChange={setSplit}
              projects={reference.projects.filter((project) => project.status !== "encerrado")}
              amount={parseMoney(form.amount) ?? ""}
              disabled={submitting}
            />
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
                    <Input id="p-doce" type="date" {...input("documentDate")} />
                  </Field>
                </div>
                <Field label="Código de barras / linha digitável" id="p-barras">
                  <Input id="p-barras" className="font-mono text-xs" {...input("barcode")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Competência" id="p-comp">
                    <Input id="p-comp" type="month" {...input("competence")} />
                  </Field>
                  <Field
                    label="Documentação recebida em"
                    id="p-docrec"
                    hint="Menos de 3 dias antes do vencimento fica como documentação atrasada."
                  >
                    <Input id="p-docrec" type="date" {...input("docsReceivedOn")} />
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
                <Input
                  id="b-valor"
                  inputMode="decimal"
                  autoFocus
                  value={amountText}
                  onChange={(event) => {
                    setAmountEdited(true);
                    setForm((current) => ({ ...current, amount: event.target.value }));
                  }}
                />
              </Field>
              <Field label="Data em que o dinheiro saiu" id="b-data">
                <Input id="b-data" type="date" max={today} {...input("paidOn")} />
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
                <Input id="b-juros" inputMode="decimal" placeholder="0,00" {...input("surcharge")} />
              </Field>
              <Field label="Desconto (R$)" id="b-desc">
                <Input id="b-desc" inputMode="decimal" placeholder="0,00" {...input("discount")} />
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
                    <Input
                      id="lb-data"
                      type="date"
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

export function ReclassifyDialog({
  rows,
  reference,
  onClose,
  onDone,
}: {
  rows: PayableRow[];
  reference: Reference;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({ projectId: KEEP, categoryId: KEEP, costCenterId: KEEP });
  const total = rows.reduce((sum, row) => sum + toCents(row.amount), 0) / 100;
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const changed = (value: string) => (value === KEEP ? null : Number(value));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = {
      projectId: changed(form.projectId),
      categoryId: changed(form.categoryId),
      costCenterId: changed(form.costCenterId),
    };
    if (!fields.projectId && !fields.categoryId && !fields.costCenterId) {
      return setLocalError("Escolha o que vai mudar.");
    }
    setLocalError(null);
    await run(async () => onDone((await reclassifyBatch({ ids: rows.map((row) => row.id), ...fields })).count));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Reclassificar</DialogTitle>
            <DialogDescription>
              {plural(rows.length, "conta", "contas")} · total {brl(total)}. O que ficar em &quot;Não mudar&quot; continua como está.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <Field label="Projeto" id="rc-proj" hint="Mudar o projeto deixa a conta 100% nele.">
              <Choice
                id="rc-proj"
                value={form.projectId}
                onChange={set("projectId")}
                options={[
                  { id: KEEP, label: "Não mudar" },
                  ...reference.projects
                    .filter((p) => p.status !== "encerrado")
                    .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
                ]}
              />
            </Field>
            <Field label="Categoria" id="rc-cat">
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
                  ...reference.costCenters.map((c) => ({ id: c.id, label: c.name })),
                ]}
              />
            </Field>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              <Tags size={16} />
              Reclassificar {plural(rows.length, "conta", "contas")}
            </Button>
          </DialogFooter>
        </form>
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
                  <Input
                    id="pr-valor"
                    inputMode="decimal"
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

/** Pessoas do lançamento agrupado, abertas na própria linha da lista (kickoff de 03/11, K3). */
export function ItemsPanel({ payable }: { payable: PayableDetail }) {
  const [term, setTerm] = useState("");
  const items = useMemo(() => {
    const clean = term.trim().toLowerCase();
    return clean ? payable.items.filter((item) => item.name.toLowerCase().includes(clean)) : payable.items;
  }, [payable.items, term]);
  // Só incentivo tem data da pesquisa: nas outras folhas a coluna ficaria vazia.
  const withSurvey = payable.items.some((item) => item.surveyDate);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <strong className="text-[13px]">
          {plural(payable.items.length, "pessoa", "pessoas")} · {brl(payable.amount)}
        </strong>
        <div className="relative w-full max-w-[260px]">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
          <Input
            className="h-8 bg-card pl-8 text-[13px]"
            aria-label="Buscar pessoa"
            placeholder="Buscar pessoa…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
      </div>
      {items.length ? (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Pessoa</TableHead>
                {withSurvey && <TableHead className={TH}>Data da pesquisa</TableHead>}
                <TableHead className={TH}>Documento</TableHead>
                <TableHead className={TH}>Pagamento</TableHead>
                <TableHead className={cn(TH, NUM)}>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{item.name}</TableCell>
                  {withSurvey && <TableCell className={TD}>{formatDate(item.surveyDate)}</TableCell>}
                  <TableCell className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {item.documentType}
                      {item.invoiceNumber && ` ${item.invoiceNumber}`}
                      {item.invoiceStatus === "Pendente" && <Tag color="ambar">NF pendente</Tag>}
                      {item.invoiceStatus === "Recebida" && <Tag color="verde">NF recebida</Tag>}
                    </span>
                    {item.invoiceDate && (
                      <span className="block text-xs text-muted-foreground">emitida em {formatDate(item.invoiceDate)}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(TD, "text-muted-foreground")}>{itemPaymentLabel(payable, item)}</TableCell>
                  <TableCell className={cn(TD, NUM, "font-bold")}>
                    {brl(item.amount)}
                    {item.grossAmount && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        bruto {brl(item.grossAmount)} · INSS −{brl(inssAmount(item.grossAmount, item.amount))}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="py-3 text-center text-sm text-muted-foreground">Ninguém com esse nome.</p>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-medium">{children}</dd>
    </div>
  );
}

const PAYMENT_KINDS: Record<Payment["kind"], string> = {
  pagamento: "Baixa",
  estorno: "Estorno",
  devolucao: "Pix devolvido",
};

export function DetailDialog({
  id,
  today,
  onClose,
  onChanged,
  onReplace,
}: {
  id: number;
  today: string;
  onClose: () => void;
  onChanged: () => void;
  onReplace: (payable: PayableDetail) => void;
}) {
  const [payable, setPayable] = useState<PayableDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<
    | { kind: "edit" }
    | { kind: "cancel" }
    | { kind: "reverse"; payment: Payment; type: "estorno" | "devolucao" }
    | null
  >(null);

  useEffect(() => {
    getPayable(id).then(setPayable, (err) =>
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível abrir a conta")
    );
  }, [id]);

  function updated(next: PayableDetail, message: string) {
    setPayable(next);
    setAction(null);
    toast.success(message);
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        {loadError ? (
          <>
            <DialogHeader>
              <DialogTitle>Detalhes da conta</DialogTitle>
              <DialogDescription>Não foi possível abrir.</DialogDescription>
            </DialogHeader>
            <ErrorBox message={loadError} />
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
              {payable.docsLate && <Tag color="ambar">Documentação atrasada</Tag>}
            </div>
            <Tabs defaultValue="detalhes">
              <TabsList>
                <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                <TabsTrigger value="baixas">Baixas ({payable.payments.length})</TabsTrigger>
                {payable.items.length > 0 && <TabsTrigger value="itens">Itens ({payable.items.length})</TabsTrigger>}
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="detalhes" className="pt-3">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Info label="Valor">{brl(payable.amount)}</Info>
                  <Info label="Pago">{brl(payable.paid)}</Info>
                  <Info label="Pendente">{brl(payable.pending)}</Info>
                  <Info label="Empresa">{payable.companyName}</Info>
                  <Info label="Unidade">{payable.unitName}</Info>
                  <Info label="Centro de custo">{payable.costCenterName}</Info>
                  <Info label="Categoria">{payable.categoryName}</Info>
                  <Info label="Forma">{payable.paymentMethodName}</Info>
                  <Info label="Competência">{payable.competence ?? "—"}</Info>
                  <Info label="Documento">
                    {payable.documentType}
                    {payable.documentNumber && ` ${payable.documentNumber}`}
                  </Info>
                  <Info label="Emissão">{formatDate(payable.documentDate)}</Info>
                  <Info label="Documentação recebida">{formatDate(payable.docsReceivedOn)}</Info>
                  <Info label="Projetos">
                    {payable.allocations.length
                      ? payable.allocations.map((a) => `PRJ-${a.code}: ${brl(a.amount)}`).join(", ")
                      : "—"}
                  </Info>
                  {payable.isTransfer && <Info label="Transferência">Entre empresas do Grupo</Info>}
                </dl>
                {payable.barcode && (
                  <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{payable.barcode}</p>
                )}
                {payable.notes && <p className="mt-3 text-[13px]">{payable.notes}</p>}
                {payable.situation !== "cancelado" && payable.situation !== "substituido" && payable.origin !== "connect" && (
                  <div className="mt-4 flex gap-2">
                    {payable.canReplace && (
                      <Button size="sm" onClick={() => onReplace(payable)}>
                        <Replace size={14} />
                        Substituir pelo valor real
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setAction({ kind: "edit" })}>
                      Editar
                    </Button>
                    {Number(payable.paid) === 0 && (
                      <Button variant="outline" size="sm" onClick={() => setAction({ kind: "cancel" })}>
                        Cancelar conta
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="baixas" className="pt-3">
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
              {payable.items.length > 0 && (
                <TabsContent value="itens" className="pt-3">
                  <ItemsPanel payable={payable} />
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
            {action?.kind === "edit" && (
              <EditForm
                payable={payable}
                onClose={() => setAction(null)}
                onDone={(next) => updated(next, "Conta alterada.")}
              />
            )}
            {action?.kind === "cancel" && (
              <ReasonForm
                title="Cancelar conta"
                confirm="Cancelar conta"
                onClose={() => setAction(null)}
                submit={(reason) => cancelPayable(payable.id, reason)}
                onDone={(next) => updated(next, "Conta cancelada.")}
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
  onClose,
  onDone,
}: {
  payable: PayableDetail;
  onClose: () => void;
  onDone: (payable: PayableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [description, setDescription] = useState(payable.description);
  const [amount, setAmount] = useState(toField(payable.amount));
  const [dueDate, setDueDate] = useState(payable.dueDate);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const parsed = parseMoney(amount);
    if (!parsed || Number(parsed) === 0) return setLocalError("Informe o valor.");
    if (!description.trim() || !dueDate) return setLocalError("Preencha a descrição e o vencimento.");
    await run(async () => onDone(await updatePayable(payable.id, { description, amount: parsed, dueDate })));
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <strong className="text-[13px]">Editar conta</strong>
      <Field label="Descrição" id="e-desc">
        <Input id="e-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)" id="e-valor">
          <Input id="e-valor" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Vencimento" id="e-venc">
          <Input id="e-venc" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
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
          <Input id="r-data" type="date" min={date.min} max={date.max} value={on} onChange={(event) => setOn(event.target.value)} />
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
