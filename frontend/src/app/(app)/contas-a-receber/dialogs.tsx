"use client";

import { Check, CircleCheck, Hourglass, Pencil, Undo2, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AmountSummary } from "@/components/AmountSummary";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { ReasonDialog } from "@/components/ReasonDialog";
import {
  NO_RECURRENCE,
  RecurrenceFields,
  simulationIsCurrent,
  type RecurrenceState,
} from "@/components/RecurrenceFields";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { SeriesDialog, type SeriesApi, type SeriesTexts } from "@/components/SeriesDialog";
import { SeriesPanel } from "@/components/SeriesPanel";
import { ValuesCard } from "@/components/ValuesCard";
import { ErrorBox, Field, FormError, NUM, RedStars, TAB_BUTTON, TAB_BUTTON_DANGER, TD, TH, Tag } from "@/components/finance";
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
  formatDateTime,
  occurrenceEdits,
  parseMoney,
  percentOf,
  plural,
  revenueCategories,
  toCents,
  type Attachment,
  type Reference,
} from "@/lib/payables";
import {
  DOCUMENT_TYPES,
  SITUATION_LABELS,
  attachReceivableDocument,
  bandLabel,
  bandTotals,
  cancelReceivable,
  cancelReceivableSeries,
  createReceivable,
  createReceivableSeries,
  daysLateText,
  deleteReceivable,
  downloadReceivableDocument,
  editReceivableSeries,
  getReceivable,
  listDelinquency,
  listReceivableSeries,
  receive,
  removeReceivableDocument,
  renameReceivableDocument,
  reverseReceipt,
  updateReceivable,
  type DelinquentCustomer,
  type ReceivableDetail,
  type ReceivableRow,
  type ReceivableSituation,
} from "@/lib/receivables";
import {
  NET_ZERO_MESSAGE,
  draftsFrom,
  netText,
  parseDrafts,
  type AdjustmentDraft,
} from "@/lib/adjustments";
import { missingFieldsMessage } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { ReceivableDetailFields } from "./detail-fields";

const NO_PROJECT = "sem-projeto";

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
    const missing = missingFieldsMessage([
      ["Cliente", form.customerId],
      ["Emissão", form.issueDate],
      ["Vencimento", form.dueDate],
      ["Conta de receita", form.categoryId],
      ["Empresa", form.companyId],
      ["Unidade", form.unitId],
      ["Centro de custo", form.costCenterId],
      ["Descrição", form.description.trim()],
    ]);
    if (missing) return setLocalError(missing);
    if (form.documentType === "NF" && (!form.documentNumber.trim() || !form.documentDate)) {
      return setLocalError("Informe o número e a data de emissão da nota.");
    }
    if (recurrence.repeat && !simulationIsCurrent(recurrence, form.dueDate, gross)) {
      return setLocalError("Clique em Simular para conferir as parcelas antes de salvar.");
    }
    const body = {
          customerId: Number(form.customerId),
          projectId: form.projectId ? Number(form.projectId) : null,
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
              <RedStars text="Os campos com * são obrigatórios. O projeto é opcional: nem toda receita tem um." />
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
              <Field label="Projeto" id="r-proj">
                <Choice
                  id="r-proj"
                  searchable
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
                  options={reference.costCenters.map((c) => ({ id: c.id, label: c.label }))}
                />
              </Field>
            </div>
            <ValuesCard
              grossId="r-valor"
              grossLabel="Valor principal (R$) *"
              gross={form.amount}
              onGrossChange={set("amount")}
              drafts={adjustments}
              onChange={setAdjustments}
            />
            <Field label="Descrição *" id="r-desc">
              <Textarea
                id="r-desc"
                className="min-h-28"
                maxLength={255}
                placeholder="Ex.: Pesquisa de satisfação · 1ª parcela"
                {...input("description")}
              />
            </Field>
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

// ---- Exclusão ----

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

// ---- Editar e cancelar (dentro das abas do título) ----

/** Motivo para cancelar, na própria aba (o estorno e o documento seguem em janela). */
function ReasonForm({
  title,
  description,
  confirm,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { error, submitting, run } = useFormAction();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <strong className="text-[13px]">{title}</strong>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Field label="Motivo *" id="rs-motivo-aba">
        <Input id="rs-motivo-aba" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <FormError message={localError ?? error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={submitting} onClick={onClose}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          disabled={submitting}
          onClick={() => {
            if (!reason.trim()) return setLocalError("Diga o motivo.");
            setLocalError(null);
            void run(() => onConfirm(reason.trim()));
          }}
        >
          {confirm}
        </Button>
      </div>
    </div>
  );
}

function EditForm({
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5 rounded-xl border border-border p-4">
      <strong className="text-[13px]">Editar título</strong>
      <p className="text-xs text-muted-foreground">O valor não pode ficar abaixo do que já foi recebido.</p>
      <Field label="Descrição *" id="ed-desc">
        <Input id="ed-desc" {...input("description")} />
      </Field>
      <Field label="Vencimento *" id="ed-venc">
        <Input id="ed-venc" type="date" {...input("dueDate")} />
      </Field>
      <ValuesCard
        grossId="ed-valor"
        grossLabel="Valor principal (R$) *"
        gross={form.amount}
        onGrossChange={(value) => setForm((current) => ({ ...current, amount: value }))}
        drafts={adjustments}
        onChange={setAdjustments}
      />
      <FormError message={localError ?? error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}

// ---- Detalhe ----

/** As chamadas e as palavras da série no Contas a receber: a lista e o detalhe usam as mesmas. */
export const RECEIVABLE_SERIES_API: SeriesApi = { edit: editReceivableSeries, cancel: cancelReceivableSeries };

export const RECEIVABLE_SERIES_TEXTS: SeriesTexts = {
  canceled: ["título cancelado", "títulos cancelados"],
  changed: ["título alterado", "títulos alterados"],
  settled: "O que já foi recebido",
  none: "Nenhum título mudou: todos já têm recebimento ou estão cancelados.",
  many: "títulos",
};

/** Valor a receber, recebido e pendente do título, com a barra de quanto já foi recebido. */
function ReceivableSummary({ detail }: { detail: ReceivableDetail }) {
  const percent = percentOf(detail.received, detail.net);
  const receipts = detail.payments.filter((payment) => payment.kind === "recebimento" && !payment.reversed).length;
  return (
    <AmountSummary
      percent={percent}
      progressText={`${percent}% recebido`}
      items={[
        { label: "Valor", value: brl(detail.net), hint: `vence ${formatDate(detail.dueDate)}`, icon: Wallet, tone: "azul" },
        {
          label: "Recebido",
          value: brl(detail.received),
          hint: receipts ? plural(receipts, "recebimento", "recebimentos") : "nenhum recebimento",
          icon: CircleCheck,
          tone: "verde",
        },
        {
          label: "Pendente",
          value: brl(detail.pending),
          hint: Number(detail.pending) > 0 ? "falta receber" : "nada a receber",
          icon: Hourglass,
          tone: "ambar",
        },
      ]}
    />
  );
}

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
  // A aba Repetir leva de um título da série para outro sem fechar a janela.
  const [currentId, setCurrentId] = useState(id);
  const [loaded, setLoaded] = useState<ReceivableDetail | null>(null);
  const [failure, setFailure] = useState<{ id: number; message: string } | null>(null);
  // Sobe quando a série muda (valor, cancelamento): recarrega o título e a lista da aba Repetir.
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("detalhes");
  const [deleting, setDeleting] = useState(false);
  const [reversing, setReversing] = useState<number | null>(null);
  const [changingSeries, setChangingSeries] = useState<"edit" | "cancel" | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);

  useEffect(() => {
    let live = true;
    getReceivable(currentId).then(
      (next) => live && setLoaded(next),
      (err) =>
        live &&
        setFailure({
          id: currentId,
          message: err instanceof ApiError ? err.message : "Não foi possível abrir o título.",
        }),
    );
    return () => {
      live = false;
    };
  }, [currentId, version]);

  // Enquanto o outro título carrega, o anterior não aparece no lugar dele.
  const detail = loaded?.id === currentId ? loaded : null;
  const error = failure?.id === currentId ? failure.message : null;

  function apply(next: ReceivableDetail) {
    setLoaded(next);
    onChanged();
  }

  // Editar e cancelar só existem enquanto o título está ativo; cancelado perde as duas abas.
  const open = detail !== null && detail.situation !== "cancelado";
  const shownTab = (tab === "editar" || tab === "cancelar") && !open ? "detalhes" : tab;
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{detail ? detail.description : "Título a receber"}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.customer}${detail.projectCode ? ` · PRJ-${detail.projectCode}` : ""}`
              : "Carregando…"}
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBox message={error} />}
        {!detail && !error && (
          <div className="flex justify-center p-8">
            <Spinner aria-label="Carregando" className="size-6" />
          </div>
        )}
        {detail && <ReceivableSummary detail={detail} />}
        {detail && (
          <Tabs value={shownTab} onValueChange={setTab}>
            <TabsList className="group-data-[orientation=horizontal]/tabs:h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="detalhes" className={TAB_BUTTON}>
                Detalhes
              </TabsTrigger>
              {open && (
                <TabsTrigger value="editar" className={TAB_BUTTON}>
                  <Pencil size={14} />
                  Editar título
                </TabsTrigger>
              )}
              <TabsTrigger value="recebimentos" className={TAB_BUTTON}>
                Recebimentos ({detail.payments.length})
              </TabsTrigger>
              <TabsTrigger value="documentos" className={TAB_BUTTON}>
                Documentos ({detail.attachments.length})
              </TabsTrigger>
              {detail.series && (
                <TabsTrigger value="repetir" className={TAB_BUTTON}>
                  Repetir ({detail.series.count})
                </TabsTrigger>
              )}
              {open && (
                <TabsTrigger value="cancelar" className={cn(TAB_BUTTON, TAB_BUTTON_DANGER)}>
                  Cancelar título
                </TabsTrigger>
              )}
              <TabsTrigger value="historico" className={TAB_BUTTON}>
                Histórico
              </TabsTrigger>
            </TabsList>
            <TabsContent value="detalhes" className="pt-3">
              <ReceivableDetailFields detail={detail} status={<SituationBadge situation={detail.situation} />} />
            </TabsContent>
            {open && (
              <TabsContent value="editar" className="pt-3">
                <EditForm
                  key={detail.events.length}
                  row={detail}
                  onClose={() => setTab("detalhes")}
                  onDone={(next) => {
                    apply(next);
                    toast.success("Título alterado.");
                    setTab("detalhes");
                  }}
                />
              </TabsContent>
            )}
            <TabsContent value="recebimentos" className="flex flex-col gap-3 pt-3">
              {detail.canReceive && (
                <div className="flex">
                  <Button size="sm" onClick={() => onReceive(detail)}>
                    <Check size={14} />
                    Registrar recebimento
                  </Button>
                </div>
              )}
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
            <TabsContent value="documentos" className="pt-3">
              <DocumentsPanel
                attachments={detail.attachments}
                from="do título"
                api={{
                  attach: (file, kind) => attachReceivableDocument(detail.id, file, kind),
                  download: (attachmentId) => downloadReceivableDocument(detail.id, attachmentId),
                  rename: (attachmentId, change) => renameReceivableDocument(detail.id, attachmentId, change),
                  reload: () => getReceivable(detail.id),
                }}
                onChanged={(next, message) => {
                  setLoaded(next);
                  if (message) toast.success(message);
                }}
                onRemove={setRemoving}
              />
            </TabsContent>
            {detail.series && (
              <TabsContent value="repetir" className="pt-3">
                <SeriesPanel
                  key={`${version}-${detail.events.length}`}
                  currentId={detail.id}
                  series={detail.series}
                  words={["título", "títulos"]}
                  load={listReceivableSeries}
                  situation={(value) => <SituationBadge situation={value as ReceivableSituation} />}
                  onOpen={setCurrentId}
                  actions={
                    detail.situation !== "cancelado" && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setChangingSeries("edit")}>
                          Alterar a série
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setChangingSeries("cancel")}>
                          Cancelar títulos da série
                        </Button>
                      </div>
                    )
                  }
                />
              </TabsContent>
            )}
            {open && (
              <TabsContent value="cancelar" className="pt-3">
                <ReasonForm
                  title="Cancelar título"
                  description="O título sai dos totais e fica no histórico. Quem tem recebimento precisa de estorno antes."
                  confirm="Cancelar título"
                  onClose={() => setTab("detalhes")}
                  onConfirm={async (reason) => {
                    const next = await cancelReceivable(detail.id, reason);
                    apply(next);
                    toast.success("Título cancelado.");
                    setTab("detalhes");
                  }}
                />
              </TabsContent>
            )}
            <TabsContent value="historico" className="pt-3">
              <ul className="flex flex-col gap-2 text-[13px]">
                {detail.events.map((event, index) => (
                  <li key={index} className="rounded-xl border border-border px-3 py-2">
                    <span className="block">{event.text}</span>
                    <span className="text-xs text-muted-foreground">
                      {event.userName} · {formatDateTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        )}
        {detail && (
          <DialogFooter className="flex-wrap sm:justify-between">
            <Button variant="outline" onClick={() => setDeleting(true)}>
              Excluir
            </Button>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </DialogFooter>
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
        {detail && removing && (
          <ReasonDialog
            title={`Tirar o documento ${removing.name}`}
            description="Ele sai do título, mas o arquivo continua guardado. Quem tirou e o motivo ficam no histórico."
            confirm="Tirar documento"
            onClose={() => setRemoving(null)}
            onConfirm={async (reason) => {
              const next = await removeReceivableDocument(detail.id, removing.id, reason);
              setRemoving(null);
              setLoaded(next);
              toast.success("Documento tirado do título.");
            }}
          />
        )}
        {detail && changingSeries && detail.series && (
          <SeriesDialog
            row={detail}
            mode={changingSeries}
            api={RECEIVABLE_SERIES_API}
            texts={RECEIVABLE_SERIES_TEXTS}
            onClose={() => setChangingSeries(null)}
            onDone={(message) => {
              setChangingSeries(null);
              toast.success(message);
              onChanged();
              setVersion((value) => value + 1);
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
