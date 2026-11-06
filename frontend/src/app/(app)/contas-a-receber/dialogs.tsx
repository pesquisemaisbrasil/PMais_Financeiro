"use client";

import { Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AdjustmentsField } from "@/components/AdjustmentsField";
import { NO_RECURRENCE, RecurrenceFields, type RecurrenceState } from "@/components/RecurrenceFields";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { ErrorBox, Field, FormError, NUM, TD, TH, Tag } from "@/components/finance";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  addDays,
  brl,
  formatDate,
  occurrenceEdits,
  parseMoney,
  plural,
  revenueCategories,
  toCents,
  type Reference,
} from "@/lib/payables";
import {
  DOCUMENT_TYPES,
  SITUATION_LABELS,
  bandLabel,
  bandTotals,
  cancelReceivable,
  createReceivable,
  createReceivableSeries,
  daysLateText,
  deleteReceivable,
  getReceivable,
  listDelinquency,
  receive,
  reverseReceipt,
  updateReceivable,
  type DelinquentCustomer,
  type ReceivableDetail,
  type ReceivableRow,
  type ReceivableSituation,
} from "@/lib/receivables";
import {
  NET_ZERO_MESSAGE,
  adjustmentTotals,
  draftsFrom,
  netText,
  parseDrafts,
  type AdjustmentDraft,
} from "@/lib/adjustments";
import { useFormAction } from "@/lib/use-form-action";

const COLORS: Record<ReceivableSituation, "verde" | "azul" | "vermelho" | "ambar" | "cinza"> = {
  recebido: "verde",
  parcial: "azul",
  vencido: "vermelho",
  hoje: "ambar",
  a_vencer: "cinza",
  cancelado: "cinza",
};

export function SituationBadge({ situation }: { situation: ReceivableSituation }) {
  return <Tag color={COLORS[situation]}>{SITUATION_LABELS[situation]}</Tag>;
}

// ---- Novo título ----

export function NewReceivableDialog({
  reference,
  today,
  onClose,
  onDone,
}: {
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (receivable: ReceivableDetail, seriesCount?: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceState>(NO_RECURRENCE);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    projectId: "",
    categoryId: "",
    description: "",
    contract: "",
    companyId: "",
    unitId: "",
    costCenterId: "",
    issueDate: today,
    dueDate: addDays(today, 30),
    competence: today.slice(0, 7),
    amount: "",
    documentType: "Sem documento",
    documentNumber: "",
    documentDate: "",
    notes: "",
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => set(key)(event.target.value),
  });

  const categories = revenueCategories(reference);
  const missing = [
    !reference.customers.length && "clientes",
    !categories.length && "contas de receita",
    !reference.companies.length && "empresas",
    !reference.units.length && "unidades",
    !reference.costCenters.length && "centros de custo",
  ].filter(Boolean);

  const gross = parseMoney(form.amount);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!gross || Number(gross) === 0) return setLocalError("Informe um valor maior que zero.");
    const adjusted = parseDrafts(adjustments);
    if (adjusted.error) return setLocalError(adjusted.error);
    if (Number(netText(form.amount, adjustments)) <= 0) return setLocalError(NET_ZERO_MESSAGE);
    if (recurrence.repeat && recurrence.kind === "parcelado" && adjusted.lines.length) {
      return setLocalError("Em título parcelado, lance acréscimos, descontos e impostos em cada parcela depois.");
    }
    if (!form.projectId) return setLocalError("Informe o projeto da receita.");
    const required = [
      form.customerId,
      form.categoryId,
      form.companyId,
      form.unitId,
      form.costCenterId,
      form.description.trim(),
      form.issueDate,
      form.dueDate,
    ];
    if (required.some((value) => !value)) return setLocalError("Preencha os campos com *.");
    if (form.documentType === "NF" && (!form.documentNumber.trim() || !form.documentDate)) {
      return setLocalError("Informe o número e a data de emissão da nota.");
    }
    if (recurrence.repeat && !recurrence.rows) {
      return setLocalError("Clique em Simular para conferir as parcelas antes de salvar.");
    }
    const body = {
          customerId: Number(form.customerId),
          projectId: Number(form.projectId),
          categoryId: Number(form.categoryId),
          companyId: Number(form.companyId),
          unitId: Number(form.unitId),
          costCenterId: Number(form.costCenterId),
          description: form.description,
          contract: form.contract.trim() || null,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          competence: form.competence || null,
          amount: gross,
          adjustments: adjusted.lines,
          documentType: form.documentType,
          documentNumber: form.documentNumber.trim() || null,
          documentDate: form.documentDate || null,
          notes: form.notes.trim() || null,
    };
    await run(async () => {
      if (recurrence.repeat && recurrence.rows && recurrence.simulated) {
        const { ids } = await createReceivableSeries({
          ...body,
          recurrence: {
            kind: recurrence.kind,
            count: Number(recurrence.count),
            estimated: recurrence.estimated,
            occurrences: occurrenceEdits(recurrence.simulated, recurrence.rows),
          },
        });
        onDone(await getReceivable(ids[0]), ids.length);
        return;
      }
      onDone(await createReceivable(body));
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Nova conta a receber</DialogTitle>
            <DialogDescription>
              Os campos com * são obrigatórios. Toda receita pertence a um projeto.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {missing.length > 0 && (
              <Alert>
                <AlertDescription>Ainda faltam cadastros: {missing.join(", ")}.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente *" id="r-cli">
                <Choice
                  id="r-cli"
                  value={form.customerId}
                  onChange={set("customerId")}
                  options={reference.customers.map((c) => ({ id: c.id, label: `${c.nickname} · ${c.name}` }))}
                />
              </Field>
              <Field label="Projeto *" id="r-proj">
                <Choice
                  id="r-proj"
                  value={form.projectId}
                  onChange={set("projectId")}
                  options={reference.projects
                    .filter((p) => p.status !== "encerrado")
                    .map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` }))}
                />
              </Field>
            </div>
            <Field label="Descrição *" id="r-desc">
              <Input id="r-desc" placeholder="Ex.: Pesquisa de satisfação · 1ª parcela" {...input("description")} />
            </Field>
            <Field label="Valor bruto (R$) *" id="r-valor">
              <Input id="r-valor" inputMode="decimal" placeholder="0,00" autoFocus {...input("amount")} />
            </Field>
            <AdjustmentsField drafts={adjustments} onChange={setAdjustments} gross={form.amount} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Emissão *" id="r-emi">
                <Input id="r-emi" type="date" {...input("issueDate")} />
              </Field>
              <Field label="Vencimento *" id="r-venc">
                <Input id="r-venc" type="date" {...input("dueDate")} />
              </Field>
              <Field label="Competência" id="r-comp">
                <Input id="r-comp" type="month" {...input("competence")} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Conta de receita *" id="r-cat">
                <Choice
                  id="r-cat"
                  value={form.categoryId}
                  onChange={set("categoryId")}
                  options={categories.map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
                />
              </Field>
              <Field label="Contrato" id="r-contrato">
                <Input id="r-contrato" {...input("contract")} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Empresa *" id="r-emp">
                <Choice
                  id="r-emp"
                  value={form.companyId}
                  onChange={(value) => setForm((current) => ({ ...current, companyId: value, unitId: "" }))}
                  options={reference.companies.map((c) => ({ id: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Unidade *" id="r-uni">
                <Choice
                  id="r-uni"
                  value={form.unitId}
                  onChange={set("unitId")}
                  placeholder={form.companyId ? "Selecione" : "Escolha a empresa"}
                  options={reference.units
                    .filter((u) => String(u.companyId) === form.companyId)
                    .map((u) => ({ id: u.id, label: u.name }))}
                />
              </Field>
              <Field label="Centro de custo *" id="r-cc">
                <Choice
                  id="r-cc"
                  value={form.costCenterId}
                  onChange={set("costCenterId")}
                  options={reference.costCenters.map((c) => ({ id: c.id, label: c.name }))}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Documento" id="r-doc">
                <Choice
                  id="r-doc"
                  value={form.documentType}
                  onChange={set("documentType")}
                  options={DOCUMENT_TYPES.map((type) => ({ id: type, label: type }))}
                />
              </Field>
              <Field label="Número" id="r-docn">
                <Input id="r-docn" {...input("documentNumber")} />
              </Field>
              <Field label="Emissão da nota" id="r-doce">
                <Input id="r-doce" type="date" {...input("documentDate")} />
              </Field>
            </div>
            <RecurrenceFields
              value={recurrence}
              onChange={setRecurrence}
              dueDate={form.dueDate}
              amount={gross}
              disabled={submitting}
              onError={setLocalError}
              noun="título"
            />
            <Field label="Observações" id="r-obs">
              <Textarea id="r-obs" {...input("notes")} />
            </Field>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Lançar conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Receber ----

export function ReceiveDialog({
  row,
  reference,
  today,
  onClose,
  onDone,
}: {
  row: ReceivableRow;
  reference: Reference;
  today: string;
  onClose: () => void;
  onDone: (receivable: ReceivableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const accounts = reference.bankAccounts.filter(
    (account) => reference.companies.find((c) => c.id === account.companyId)?.name === row.companyName,
  );
  const pix = reference.paymentMethods.find((m) => m.name === "Pix");
  const [form, setForm] = useState({
    amount: String(row.pending).replace(".", ","),
    receivedOn: today,
    bankAccountId: accounts.length === 1 ? String(accounts[0].id) : "",
    paymentMethodId: pix ? String(pix.id) : "",
    transactionId: "",
    note: "",
  });
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoney(form.amount);
    if (!amount || Number(amount) === 0) return setLocalError("Informe o valor recebido, como 1.234,56.");
    if (!form.receivedOn) return setLocalError("Informe a data do recebimento.");
    if (!form.bankAccountId) return setLocalError("Escolha a conta bancária.");
    if (!form.paymentMethodId) return setLocalError("Escolha a forma de recebimento.");
    if (form.receivedOn < today && !form.note.trim()) {
      return setLocalError("Recebimento com data no passado precisa de observação.");
    }
    await run(async () => {
      onDone(
        await receive(row.id, {
          amount,
          receivedOn: form.receivedOn,
          bankAccountId: Number(form.bankAccountId),
          paymentMethodId: Number(form.paymentMethodId),
          transactionId: form.transactionId.trim() || null,
          note: form.note.trim() || null,
        }),
      );
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>
              {row.customer} · {row.description}. Falta receber {brl(row.pending)}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valor recebido (R$) *" id="rc-valor" hint="Menos que o saldo é recebimento parcial.">
                <Input id="rc-valor" inputMode="decimal" autoFocus {...input("amount")} />
              </Field>
              <Field label="Data do recebimento *" id="rc-data">
                <Input id="rc-data" type="date" {...input("receivedOn")} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Conta bancária *" id="rc-conta">
                <Choice
                  id="rc-conta"
                  value={form.bankAccountId}
                  onChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))}
                  options={accounts.map((a) => ({ id: a.id, label: a.name }))}
                />
              </Field>
              <Field label="Forma de recebimento *" id="rc-forma">
                <Choice
                  id="rc-forma"
                  value={form.paymentMethodId}
                  onChange={(value) => setForm((current) => ({ ...current, paymentMethodId: value }))}
                  options={reference.paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
                />
              </Field>
            </div>
            <Field label="ID da transação" id="rc-tx" hint="O mesmo ID bancário não vale para dois recebimentos.">
              <Input id="rc-tx" {...input("transactionId")} />
            </Field>
            <Field label="Observação" id="rc-obs" hint="Obrigatória quando a data é anterior a hoje.">
              <Input id="rc-obs" {...input("note")} />
            </Field>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Receber
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Motivo (estorno e cancelamento) e exclusão ----

function ReasonDialog({
  title,
  description,
  confirm,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { error, submitting, run } = useFormAction();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label="Motivo *" id="rs-motivo">
          <Input id="rs-motivo" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={localError ?? error} />
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={submitting}
            onClick={() => {
              if (!reason.trim()) return setLocalError("Diga o motivo.");
              setLocalError(null);
              void run(() => onConfirm(reason.trim()));
            }}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  row,
  onClose,
  onDone,
}: {
  row: ReceivableDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { error, submitting, run } = useFormAction();
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Excluir título</DialogTitle>
          <DialogDescription>
            {row.customer} · {row.description} ({brl(row.net)}). Ele sai das listas, e o histórico fica guardado.
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
            onClick={() =>
              run(async () => {
                await deleteReceivable(row.id);
                onDone();
              })
            }
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Alterar ----

function EditDialog({
  row,
  onClose,
  onDone,
}: {
  row: ReceivableDetail;
  onClose: () => void;
  onDone: (receivable: ReceivableDetail) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>(draftsFrom(row.adjustments));
  const [form, setForm] = useState({
    description: row.description,
    amount: row.amount.replace(".", ","),
    dueDate: row.dueDate,
  });
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const amount = parseMoney(form.amount);
    if (!amount || Number(amount) === 0) return setLocalError("Confira o valor.");
    if (!form.description.trim() || !form.dueDate) return setLocalError("Preencha a descrição e o vencimento.");
    const adjusted = parseDrafts(adjustments);
    if (adjusted.error) return setLocalError(adjusted.error);
    if (Number(netText(form.amount, adjustments)) <= 0) return setLocalError(NET_ZERO_MESSAGE);
    await run(async () => {
      onDone(
        await updateReceivable(row.id, {
          description: form.description,
          amount,
          adjustments: adjusted.lines,
          dueDate: form.dueDate,
        }),
      );
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Alterar título</DialogTitle>
            <DialogDescription>O valor não pode ficar abaixo do que já foi recebido.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <Field label="Descrição *" id="ed-desc">
              <Input id="ed-desc" {...input("description")} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valor bruto (R$) *" id="ed-valor">
                <Input id="ed-valor" inputMode="decimal" {...input("amount")} />
              </Field>
              <Field label="Vencimento *" id="ed-venc">
                <Input id="ed-venc" type="date" {...input("dueDate")} />
              </Field>
            </div>
            <AdjustmentsField drafts={adjustments} onChange={setAdjustments} gross={form.amount} />
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Detalhe ----

export function DetailDialog({
  id,
  onClose,
  onChanged,
  onReceive,
}: {
  id: number;
  onClose: () => void;
  onChanged: () => void;
  onReceive: (row: ReceivableDetail) => void;
}) {
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reversing, setReversing] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    getReceivable(id).then(
      (loaded) => live && setDetail(loaded),
      (err) => live && setError(err instanceof ApiError ? err.message : "Não foi possível abrir o título."),
    );
    return () => {
      live = false;
    };
  }, [id]);

  function apply(next: ReceivableDetail) {
    setDetail(next);
    onChanged();
  }

  const open = detail && detail.situation !== "cancelado";
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{detail ? detail.description : "Título a receber"}</DialogTitle>
          <DialogDescription>
            {detail ? `${detail.customer} · PRJ-${detail.projectCode}` : "Carregando…"}
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBox message={error} />}
        {!detail && !error && (
          <div className="flex justify-center p-8">
            <Spinner aria-label="Carregando" className="size-6" />
          </div>
        )}
        {detail && (
          <Tabs defaultValue="resumo">
            <TabsList>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="recebimentos">Recebimentos ({detail.payments.length})</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="resumo" className="flex flex-col gap-3 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <SituationBadge situation={detail.situation} />
                {daysLateText(detail.daysLate) && (
                  <span className="text-xs font-semibold text-[#b91c1c]">{daysLateText(detail.daysLate)}</span>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
                {[
                  ["Valor bruto", brl(detail.amount)],
                  ["(+) Acréscimos", brl(adjustmentTotals(detail.adjustments).acrescimo)],
                  ["(−) Descontos", brl(adjustmentTotals(detail.adjustments).desconto)],
                  ["(−) Impostos", brl(adjustmentTotals(detail.adjustments).imposto)],
                  ["Líquido a receber", brl(detail.net)],
                  ["Recebido", brl(detail.received)],
                  ["Pendente", brl(detail.pending)],
                  ["Vencimento", formatDate(detail.dueDate)],
                  ["Emissão", formatDate(detail.issueDate)],
                  ["Competência", detail.competence],
                  ["Conta de receita", detail.categoryName],
                  ["Contrato", detail.contract ?? "—"],
                  ["Documento", `${detail.documentType}${detail.documentNumber ? ` ${detail.documentNumber}` : ""}`],
                  ["Empresa · unidade", `${detail.companyName} · ${detail.unitName}`],
                  ["Centro de custo", detail.costCenterName],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {detail.adjustments.length > 0 && (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {detail.adjustments.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {item.kind === "acrescimo" ? "(+)" : "(−)"} {item.description}
                      </span>
                      <span className="tabular-nums">{brl(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.notes && <p className="rounded-xl bg-muted/60 p-3 text-[13px]">{detail.notes}</p>}
            </TabsContent>
            <TabsContent value="recebimentos" className="pt-3">
              {detail.payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum recebimento ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH}>Data</TableHead>
                      <TableHead className={TH}>Tipo</TableHead>
                      <TableHead className={TH}>Conta · forma</TableHead>
                      <TableHead className={`${TH} text-right`}>Valor</TableHead>
                      <TableHead className={TH} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className={TD}>{formatDate(payment.receivedOn)}</TableCell>
                        <TableCell className={TD}>
                          {payment.kind === "estorno" ? (
                            <Tag color="cinza">Estorno</Tag>
                          ) : (
                            <Tag color={payment.reversed ? "cinza" : "verde"}>
                              {payment.reversed ? "Estornado" : "Recebimento"}
                            </Tag>
                          )}
                          {payment.note && <span className="block text-xs text-muted-foreground">{payment.note}</span>}
                        </TableCell>
                        <TableCell className={TD}>
                          {payment.bankAccountName} · {payment.paymentMethodName}
                          {payment.transactionId && (
                            <span className="block text-xs text-muted-foreground">{payment.transactionId}</span>
                          )}
                        </TableCell>
                        <TableCell className={`${TD} ${NUM}`}>{brl(payment.amount)}</TableCell>
                        <TableCell className={`${TD} text-right`}>
                          {payment.kind === "recebimento" && !payment.reversed && (
                            <Button variant="ghost" size="sm" onClick={() => setReversing(payment.id)}>
                              <Undo2 size={14} /> Estornar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="historico" className="pt-3">
              <ul className="flex flex-col gap-2 text-[13px]">
                {detail.events.map((event, index) => (
                  <li key={index} className="rounded-xl border border-border px-3 py-2">
                    <span className="block">{event.text}</span>
                    <span className="text-xs text-muted-foreground">
                      {event.userName} · {formatDate(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        )}
        {detail && (
          <DialogFooter className="flex-wrap sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {open && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Alterar
                </Button>
              )}
              {open && (
                <Button variant="outline" onClick={() => setCanceling(true)}>
                  Cancelar título
                </Button>
              )}
              <Button variant="outline" onClick={() => setDeleting(true)}>
                Excluir
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              {detail.canReceive && <Button onClick={() => onReceive(detail)}>Receber</Button>}
            </div>
          </DialogFooter>
        )}
        {detail && editing && (
          <EditDialog
            row={detail}
            onClose={() => setEditing(false)}
            onDone={(next) => {
              setEditing(false);
              apply(next);
            }}
          />
        )}
        {detail && canceling && (
          <ReasonDialog
            title="Cancelar título"
            description="O título sai dos totais e fica no histórico. Quem tem recebimento precisa de estorno antes."
            confirm="Cancelar título"
            destructive
            onClose={() => setCanceling(false)}
            onConfirm={async (reason) => {
              const next = await cancelReceivable(detail.id, reason);
              setCanceling(false);
              apply(next);
            }}
          />
        )}
        {detail && reversing !== null && (
          <ReasonDialog
            title="Estornar recebimento"
            description="Cria uma linha nova que anula o recebimento. O original continua no histórico e o valor volta a ficar pendente."
            confirm="Estornar"
            onClose={() => setReversing(null)}
            onConfirm={async (reason) => {
              const next = await reverseReceipt(detail.id, reversing, reason);
              setReversing(null);
              apply(next);
            }}
          />
        )}
        {detail && deleting && (
          <DeleteDialog
            row={detail}
            onClose={() => setDeleting(false)}
            onDone={() => {
              setDeleting(false);
              onChanged();
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Inadimplência ----

export function DelinquencyDialog({ onClose, onOpenTitle }: { onClose: () => void; onOpenTitle: (id: number) => void }) {
  const [rows, setRows] = useState<DelinquentCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listDelinquency().then(
      (list) => live && setRows(list),
      (err) => live && setError(err instanceof ApiError ? err.message : "Não foi possível carregar."),
    );
    return () => {
      live = false;
    };
  }, []);

  const total = (rows ?? []).reduce((sum, row) => sum + toCents(row.total), 0);
  const bands = bandTotals(rows ?? []);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Inadimplência</DialogTitle>
          <DialogDescription>
            Títulos vencidos por cliente, com os dias de atraso e o saldo que falta receber.
            {rows && rows.length > 0 && ` ${plural(rows.length, "cliente", "clientes")}, ${brl(total / 100)} no total.`}
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBox message={error} />}
        {!rows && !error && (
          <div className="flex justify-center p-8">
            <Spinner aria-label="Carregando" className="size-6" />
          </div>
        )}
        {rows && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum título vencido. Ninguém está em atraso.</p>
        )}
        {rows && rows.length > 0 && (
          <div
            role="group"
            aria-label="Total por faixa de atraso"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {bands.map((band) => (
              <div key={band.id} className="rounded-xl border border-border px-3 py-2.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
                  {bandLabel(band.id)}
                </span>
                <span className="block text-[15px] font-bold tabular-nums">{brl(band.cents / 100)}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {plural(band.count, "título", "títulos")}
                </span>
              </div>
            ))}
          </div>
        )}
        {rows?.map((customer) => (
          <section key={customer.customerId} className="rounded-xl border border-border">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <strong className="text-[13px]">{customer.customer}</strong>
              <span className="text-xs text-muted-foreground">
                {plural(customer.count, "título vencido", "títulos vencidos")} · até{" "}
                {daysLateText(customer.maxDaysLate)} · <strong className="text-[#b91c1c]">{brl(customer.total)}</strong>
              </span>
            </header>
            <Table>
              <TableBody>
                {customer.titles.map((title) => (
                  <TableRow key={title.id}>
                    <TableCell className={TD}>{title.description}</TableCell>
                    <TableCell className={TD}>{formatDate(title.dueDate)}</TableCell>
                    <TableCell className={TD}>{daysLateText(title.daysLate)}</TableCell>
                    <TableCell className={`${TD} text-xs text-muted-foreground`}>{bandLabel(title.band)}</TableCell>
                    <TableCell className={`${TD} ${NUM}`}>{brl(title.pending)}</TableCell>
                    <TableCell className={`${TD} text-right`}>
                      <Button variant="ghost" size="sm" onClick={() => onOpenTitle(title.id)}>
                        Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ))}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
