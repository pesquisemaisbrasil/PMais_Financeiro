"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookUser,
  CircleCheck,
  CornerDownRight,
  Eye,
  Folder,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { CARD, ErrorBox, Field, FormError, PageHeader, TD, TH, Tag } from "@/components/finance";
import { TONES, type IndicatorTone } from "@/components/IndicatorCard";
import { ReasonDialog } from "@/components/ReasonDialog";
import { SearchSelect } from "@/components/SearchSelect";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ApiError,
  attachCustomerDocument,
  createRecord,
  deleteRecord,
  downloadCustomerDocument,
  getReference,
  listCustomerDocuments,
  listRecords,
  lookupCnpj,
  removeCustomerDocument,
  renameCustomerDocument,
  setRecordActive,
  updateProjectIncentive,
  updateRecord,
} from "@/lib/api";
import { UFS, formatZip, joinPhone, splitPhone, zipDigits, type PhoneParts } from "@/lib/customers";
import {
  cleanCnpj,
  filterOptions,
  formatCnpj,
  looksLikeCnpj,
  plural,
  type Attachment,
  type Project,
  type RecordKind,
  type RecordRow,
  type Reference,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type TabId = RecordKind | "projects";

const TABS: { id: TabId; label: string; one: string; many: string; create?: string }[] = [
  { id: "companies", label: "Empresas", one: "empresa", many: "empresas", create: "Nova empresa" },
  { id: "units", label: "Unidades", one: "unidade", many: "unidades", create: "Nova unidade" },
  { id: "costCenters", label: "Centros de custo", one: "centro de custo", many: "centros de custo", create: "Novo centro de custo" },
  { id: "customers", label: "Clientes", one: "cliente", many: "clientes", create: "Novo cliente" },
  { id: "suppliers", label: "Fornecedores", one: "fornecedor", many: "fornecedores", create: "Novo fornecedor" },
  { id: "categories", label: "Plano de contas", one: "conta", many: "contas do plano", create: "Nova conta" },
  { id: "projects", label: "Projetos (Connect)", one: "projeto", many: "projetos" },
  { id: "bankAccounts", label: "Contas bancárias", one: "conta bancária", many: "contas bancárias", create: "Nova conta bancária" },
  { id: "paymentMethods", label: "Formas de pagamento", one: "forma de pagamento", many: "formas de pagamento", create: "Nova forma" },
];

const PAGE_SIZE = 25;
const PROJECT_TYPES = ["Health", "CATI", "Consumo", "Outro"];
const NO_TYPE = "sem-tipo";

/** Um total no alto da aba: o que a busca está mostrando e quantos cadastros a aba tem ao todo. */
function CountCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: LucideIcon;
  tone: IndicatorTone;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgb(15_23_42/.06)]",
        TONES[tone].idle
      )}
    >
      <div className="flex flex-col">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", TONES[tone].chip)}>
        <Icon size={18} aria-hidden="true" />
      </span>
    </div>
  );
}

/** Como o centro de custo aparece na escolha do superior: "001 · Administrativo". */
function centerLabel(center: RecordRow | undefined): string {
  return center ? [center.code, center.name].filter(Boolean).join(" · ") : "";
}

/** O código só aparece: quem gera é o sistema, ao criar, e ele nunca muda. */
function GeneratedCodeField({ code, isNew }: { code: string; isNew: boolean }) {
  return (
    <Field label="Código" id="c-cod" hint={isNew ? "Gerado ao salvar" : undefined}>
      <Input id="c-cod" disabled readOnly placeholder={isNew ? "Automático" : "Sem código"} value={code} />
    </Field>
  );
}

type SortColumn =
  | "code"
  | "company"
  | "name"
  | "kind"
  | "document"
  | "contact"
  | "terms"
  | "status"
  | "project"
  | "type";
type Sort = { column: SortColumn; descending: boolean } | null;

/** Ordena pelo texto da coluna: número dentro do texto na ordem certa, sem pesar acento nem caixa; vazio vai sempre para o fim. */
function sortedBy<T>(items: T[], text: (item: T) => string, descending: boolean): T[] {
  return [...items].sort((a, b) => {
    const x = text(a);
    const y = text(b);
    if (!x || !y) return x === y ? 0 : x ? -1 : 1;
    const order = x.localeCompare(y, "pt-BR", { numeric: true, sensitivity: "base" });
    return descending ? -order : order;
  });
}

function recordText(row: RecordRow, column: SortColumn, company: string): string {
  switch (column) {
    case "code":
      return row.code ?? "";
    case "company":
      return company;
    case "kind":
      return row.kind ?? "";
    case "document":
      return row.document ?? "";
    case "contact":
      return row.contactName ?? "";
    case "terms":
      return row.paymentTerms ?? "";
    case "status":
      return row.active ? "Ativo" : "Inativo";
    default:
      return row.nickname ?? row.name;
  }
}

/** Cabeçalho que ordena a lista: um clique ordena, o seguinte inverte. */
function SortHead({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sort: Sort;
  onSort: (column: SortColumn) => void;
}) {
  const mine = sort && sort.column === column ? sort : null;
  return (
    <TableHead className={TH} aria-sort={mine ? (mine.descending ? "descending" : "ascending") : "none"}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-brand-cinza-escuro has-[>svg]:px-0"
        onClick={() => onSort(column)}
      >
        {label}
        {mine ? (
          mine.descending ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />
        ) : (
          <ArrowUpDown size={12} aria-hidden className="opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

function RowButton({
  icon: Icon,
  label,
  onClick,
  muted = false,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Esmaecido: o botão está lá, mas a ação vai explicar por que não dá. */
  muted?: boolean;
  /** O texto ao passar o mouse, quando é diferente do nome do botão. */
  hint?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn(muted && "opacity-45")} onClick={onClick}>
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** Telefone em três campos, como no sistema antigo: país, DDD e número. */
function PhoneField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: PhoneParts;
  onChange: (next: PhoneParts) => void;
}) {
  return (
    <Field label={label} id={`${id}-ddd`}>
      <div className="grid grid-cols-[72px_88px_1fr] gap-2">
        <Input
          aria-label={`${label}: país`}
          inputMode="numeric"
          value={value.country}
          onChange={(event) => onChange({ ...value, country: event.target.value })}
        />
        <Input
          id={`${id}-ddd`}
          aria-label={`${label}: DDD`}
          inputMode="numeric"
          placeholder="DDD"
          value={value.ddd}
          onChange={(event) => onChange({ ...value, ddd: event.target.value })}
        />
        <Input
          aria-label={`${label}: número`}
          inputMode="numeric"
          placeholder="Telefone"
          value={value.number}
          onChange={(event) => onChange({ ...value, number: event.target.value })}
        />
      </div>
    </Field>
  );
}

/** As etapas do cadastro de cliente. Só a primeira é obrigatória: endereço e documentos podem ficar para depois. */
const CUSTOMER_STEPS = [
  { label: "Principal", optional: false },
  { label: "Endereço", optional: true },
  { label: "Documentos", optional: true },
];

function RecordDialog({
  kind,
  one,
  record,
  companies,
  centers,
  onClose,
  onDone,
  onSaved,
}: {
  kind: RecordKind;
  one: string;
  record: RecordRow | null;
  companies: { id: number; name: string }[];
  /** Os centros de custo já cadastrados (para escolher o superior). */
  centers: RecordRow[];
  onClose: () => void;
  onDone: () => void;
  /** Salvou, mas a janela continua aberta (cliente que segue para os documentos): atualiza a lista. */
  onSaved: () => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [form, setForm] = useState({
    name: record?.name ?? "",
    nickname: record?.nickname ?? "",
    code: record?.code ?? "",
    companyId: record?.companyId ? String(record.companyId) : "",
    parentId: record?.parentId ? String(record.parentId) : "",
    document: record?.document ? formatCnpj(record.document) : "",
    // cadastro novo começa como pessoa jurídica (o caminho do CNPJ); o antigo sem tipo fica em branco
    personType: record?.personType ?? (record ? (record.document ? "PJ" : "") : "PJ"),
    contactName: record?.contactName ?? "",
    phone: record?.phone ?? "",
    email: record?.email ?? "",
    paymentTerms: record?.paymentTerms ?? "",
    kind: record?.kind ?? "despesa",
    // só no cliente
    stateRegistration: record?.stateRegistration ?? "",
    emailAlt: record?.emailAlt ?? "",
    notes: record?.notes ?? "",
    addressCountry: record ? (record.addressCountry ?? "") : "Brasil",
    addressZip: record?.addressZip ?? "",
    addressStreet: record?.addressStreet ?? "",
    addressNumber: record?.addressNumber ?? "",
    addressComplement: record?.addressComplement ?? "",
    addressDistrict: record?.addressDistrict ?? "",
    addressCity: record?.addressCity ?? "",
    addressState: record?.addressState ?? "",
  });
  // Cliente: cadastro em etapas (Principal, Endereço e Documentos), e os três telefones em partes
  const wizard = kind === "customers";
  const [step, setStep] = useState(0);
  // o cliente criado nesta janela: os documentos precisam dele salvo, e salvar de novo é alterar
  const [saved, setSaved] = useState<RecordRow | null>(null);
  const owner = saved ?? record;
  const [documents, setDocuments] = useState<Attachment[] | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [phones, setPhones] = useState<PhoneParts[]>(() => [
    splitPhone(record?.phone),
    splitPhone(record?.phone2),
    splitPhone(record?.phone3),
  ]);
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });
  // centro de custo novo: principal (sem superior) ou sub-centro (embaixo de um principal ativo)
  const [subCenter, setSubCenter] = useState(Boolean(record?.parentId));
  const [localError, setLocalError] = useState<string | null>(null);
  const principals = centers.filter((center) => center.parentId === null && center.active);
  const needsCompany = kind === "units" || kind === "bankAccounts";
  const isParty = kind === "suppliers" || kind === "customers";
  // Fornecedor, cliente e empresa do Grupo começam pelo CNPJ: a Receita preenche, e a pessoa edita.
  const withCnpj = isParty || kind === "companies";
  const [lookup, setLookup] = useState<{ busy: boolean; tone: "info" | "ok" | "warn" | "error"; message: string }>({
    busy: false,
    tone: "info",
    message: "",
  });
  // o último CNPJ consultado (para não repetir) e o que a consulta pôs em Nome e Apelido (para
  // saber se a pessoa mexeu: o que ela escreveu a consulta não troca)
  const searched = useRef("");
  const filled = useRef({ name: "", nickname: "" });

  /** `replace`: o botão Buscar troca nome e apelido; a consulta automática só completa o que está vazio. */
  async function search(raw: string, replace: boolean) {
    if (!looksLikeCnpj(raw)) {
      setLookup({ busy: false, tone: "error", message: "Digite os 14 caracteres do CNPJ para buscar." });
      return;
    }
    const cnpj = cleanCnpj(raw);
    searched.current = cnpj;
    setLookup({ busy: true, tone: "info", message: "Consultando a Receita…" });
    try {
      const info = await lookupCnpj(cnpj);
      if (searched.current !== cnpj) return; // a pessoa já mudou o CNPJ
      const before = filled.current;
      filled.current = { name: info.name, nickname: info.nickname };
      setForm((current) => ({
        ...current,
        document: formatCnpj(info.cnpj),
        name: replace || !current.name.trim() || current.name === before.name ? info.name : current.name,
        nickname:
          replace || !current.nickname.trim() || current.nickname === before.nickname
            ? info.nickname
            : current.nickname,
      }));
      const closed = info.situation && info.situation !== "ATIVA";
      setLookup({
        busy: false,
        tone: closed ? "warn" : "ok",
        message: closed
          ? `Situação na Receita: ${info.situation}. Confira antes de cadastrar.`
          : "Dados da Receita preenchidos. Confira e edite o que precisar.",
      });
    } catch (err) {
      if (searched.current !== cnpj) return;
      setLookup({
        busy: false,
        tone: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível consultar o CNPJ. Preencha à mão.",
      });
    }
  }

  /** Pessoa física não tem documento (CPF não é guardado): o CNPJ some e a consulta para. */
  function changePersonType(value: string) {
    setForm((current) => ({ ...current, personType: value, document: value === "PF" ? "" : current.document }));
    if (value === "PF") {
      searched.current = "";
      setLookup({ busy: false, tone: "info", message: "" });
    }
  }

  function changeDocument(value: string) {
    setForm((current) => ({ ...current, document: value }));
    if (!looksLikeCnpj(value)) {
      searched.current = "";
      setLookup({ busy: false, tone: "info", message: "" });
    } else if (cleanCnpj(value) !== searched.current) {
      void search(value, false);
    }
  }

  /** Salva e fecha, ou (cliente) salva e segue para os documentos, que precisam do cadastro salvo. */
  async function save(then: "close" | "documents") {
    setLocalError(null);
    if (kind === "costCenters" && !record && subCenter && !form.parentId) {
      return setLocalError("Escolha o centro principal em que o sub-centro fica.");
    }
    await run(async () => {
      const body = {
        ...form,
        companyId: form.companyId ? Number(form.companyId) : null,
        parentId: subCenter && form.parentId ? Number(form.parentId) : null,
        personType: form.personType || null,
        ...(wizard && {
          phone: joinPhone(phones[0]),
          phone2: joinPhone(phones[1]),
          phone3: joinPhone(phones[2]),
          addressZip: zipDigits(form.addressZip),
        }),
      };
      const row = await (owner ? updateRecord(kind, owner.id, body) : createRecord(kind, body));
      if (then === "close") return onDone();
      setSaved(row);
      setForm((current) => ({ ...current, code: row.code ?? current.code }));
      onSaved();
      await openDocuments(row.id);
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save("close");
  }

  async function openDocuments(id: number) {
    setStep(2);
    setDocuments(null);
    try {
      setDocuments(await listCustomerDocuments(id));
    } catch (err) {
      setDocuments([]);
      setLocalError(err instanceof ApiError ? err.message : "Não foi possível abrir os documentos.");
    }
  }

  function goTo(next: number) {
    setLocalError(null);
    if (next === 2) return void save("documents");
    setStep(next);
  }

  function advance() {
    if (!form.name.trim() || !form.nickname.trim()) {
      return setLocalError("Preencha o apelido e o nome antes de avançar.");
    }
    goTo(1);
  }

  const header = (
    <>
      <DialogHeader>
        <DialogTitle>{record ? `Editar ${one}` : `Cadastrar ${one}`}</DialogTitle>
        <DialogDescription>
          {wizard ? "Só a primeira etapa é obrigatória. Os campos com * são obrigatórios." : "Os campos com * são obrigatórios."}
        </DialogDescription>
      </DialogHeader>
      {wizard && (
        <nav aria-label="Etapas do cadastro" className="flex flex-wrap gap-2 pt-3">
          {CUSTOMER_STEPS.map((item, index) => (
            <Button
              key={item.label}
              type="button"
              size="sm"
              variant={step === index ? "default" : "outline"}
              aria-current={step === index ? "step" : undefined}
              disabled={submitting}
              title={index === 2 ? "Salva o cadastro e abre os documentos" : undefined}
              onClick={() => goTo(index)}
            >
              <span className="font-semibold">{index + 1}</span> {item.label}
              {item.optional && <span className="text-xs font-normal opacity-70">(opcional)</span>}
            </Button>
          ))}
        </nav>
      )}
    </>
  );

  // Os documentos ficam fora do <form>: os botões da lista não podem salvar o cadastro sem querer.
  if (wizard && step === 2 && owner) {
    return (
      <Dialog open onOpenChange={(open) => !open && (saved ? onDone() : onClose())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          {header}
          <div className="flex flex-col gap-3.5 py-4">
            <FormError message={localError} />
            {documents === null ? (
              <div className="flex justify-center p-6">
                <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
              </div>
            ) : (
              <DocumentsPanel
                attachments={documents}
                from="do cliente"
                api={{
                  attach: (file, kind) => attachCustomerDocument(owner.id, file, kind),
                  download: (attachmentId) => downloadCustomerDocument(owner.id, attachmentId),
                  rename: (attachmentId, change) => renameCustomerDocument(owner.id, attachmentId, change),
                  reload: () => listCustomerDocuments(owner.id),
                }}
                onChanged={(next, message) => {
                  setDocuments(next);
                  if (message) toast.success(message);
                }}
                onRemove={setRemoving}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => goTo(1)}>
              Voltar
            </Button>
            <Button type="button" onClick={onDone}>
              Concluir
            </Button>
          </DialogFooter>
          {removing && (
            <ReasonDialog
              title={`Tirar o documento ${removing.name}`}
              description="Ele sai do cadastro, mas o arquivo continua guardado. Quem tirou e o motivo ficam no histórico."
              confirm="Tirar documento"
              onClose={() => setRemoving(null)}
              onConfirm={async (reason) => {
                const next = await removeCustomerDocument(owner.id, removing.id, reason);
                setRemoving(null);
                setDocuments(next);
                toast.success("Documento tirado do cadastro.");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && (saved ? onDone() : onClose())}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", wizard ? "sm:max-w-[720px]" : "sm:max-w-[620px]")}>
        <form onSubmit={submit} noValidate>
          {header}
          <div className="flex flex-col gap-3.5 py-4">
            {withCnpj && (!wizard || step === 0) && (
              <>
                <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <Field label="Tipo" id="c-pessoa">
                  <SearchSelect
                    id="c-pessoa"
                    value={form.personType}
                    onChange={changePersonType}
                    options={[
                      { id: "PJ", label: "Pessoa jurídica" },
                      { id: "PF", label: "Pessoa física" },
                    ]}
                  />
                </Field>
                <Field label="CNPJ" id="c-doc">
                  <div className="flex gap-2">
                    <Input
                      id="c-doc"
                      autoFocus
                      disabled={form.personType === "PF"}
                      placeholder="00.000.000/0000-00"
                      value={form.document}
                      onChange={(event) => changeDocument(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void search(form.document, true);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={lookup.busy || form.personType === "PF"}
                      onClick={() => void search(form.document, true)}
                    >
                      {lookup.busy ? <Spinner aria-label="Consultando" className="size-4" /> : <Search size={16} />}
                      Buscar
                    </Button>
                  </div>
                  <p
                    role="status"
                    className={cn(
                      "text-xs",
                      lookup.tone === "error" && "text-[#b91c1c]",
                      lookup.tone === "warn" && "text-amber-700",
                      lookup.tone === "ok" && "text-[#047857]",
                      lookup.tone === "info" && "text-muted-foreground"
                    )}
                  >
                    {form.personType === "PF"
                      ? "Pessoa física fica sem documento: o CPF não é guardado."
                      : lookup.message ||
                        "Digite o CNPJ para a Receita preencher o nome e o apelido; você pode editar."}
                  </p>
                </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <GeneratedCodeField code={form.code} isNew={!record} />
                  <Field label={isParty ? "Apelido *" : "Apelido"} id="c-apelido">
                    <Input id="c-apelido" {...input("nickname")} />
                  </Field>
                </div>
                <Field label="Nome / razão social *" id="c-nome">
                  <Input id="c-nome" {...input("name")} />
                </Field>
              </>
            )}
            {wizard && step === 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="IE (inscrição estadual)" id="c-ie" hint="Só a IE: RG e CPF não são guardados.">
                    <Input id="c-ie" {...input("stateRegistration")} />
                  </Field>
                  <Field label="Contato responsável" id="c-contato">
                    <Input id="c-contato" {...input("contactName")} />
                  </Field>
                </div>
                {phones.map((phone, index) => (
                  <PhoneField
                    key={index}
                    id={`c-fone${index + 1}`}
                    label={`Fone ${index + 1}`}
                    value={phone}
                    onChange={(next) => setPhones((current) => current.map((item, at) => (at === index ? next : item)))}
                  />
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="E-mail principal" id="c-email">
                    <Input id="c-email" type="email" {...input("email")} />
                  </Field>
                  <Field label="E-mail alternativo" id="c-email2">
                    <Input id="c-email2" type="email" {...input("emailAlt")} />
                  </Field>
                </div>
                <Field label="Observações" id="c-obs" hint="Não escreva CPF: ele não é guardado.">
                  <Textarea id="c-obs" rows={3} {...input("notes")} />
                </Field>
              </>
            )}
            {wizard && step === 1 && (
              <>
                <p className="text-xs text-muted-foreground">
                  O endereço é opcional: você pode pular esta etapa e preencher depois.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                  <Field label="País" id="c-pais">
                    <Input id="c-pais" {...input("addressCountry")} />
                  </Field>
                  <Field label="CEP" id="c-cep">
                    <Input
                      id="c-cep"
                      inputMode="numeric"
                      placeholder="00000-000"
                      value={formatZip(form.addressZip)}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, addressZip: zipDigits(event.target.value) }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Endereço" id="c-rua">
                  <Input id="c-rua" {...input("addressStreet")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Field label="Número" id="c-num">
                    <Input id="c-num" {...input("addressNumber")} />
                  </Field>
                  <Field label="Complemento" id="c-comp">
                    <Input id="c-comp" {...input("addressComplement")} />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
                  <Field label="Bairro" id="c-bairro">
                    <Input id="c-bairro" {...input("addressDistrict")} />
                  </Field>
                  <Field label="Cidade" id="c-cidade">
                    <Input id="c-cidade" {...input("addressCity")} />
                  </Field>
                  <Field label="UF" id="c-uf">
                    <SearchSelect
                      id="c-uf"
                      searchable
                      value={form.addressState}
                      onChange={(value) => setForm((current) => ({ ...current, addressState: value }))}
                      options={[{ id: "", label: "Nenhuma" }, ...UFS]}
                    />
                  </Field>
                </div>
              </>
            )}
            {isParty && !wizard && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Contato responsável" id="c-contato">
                    <Input id="c-contato" {...input("contactName")} />
                  </Field>
                  <Field label="Telefone" id="c-tel">
                    <Input id="c-tel" placeholder="+55 41 99999-0000" {...input("phone")} />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="E-mail" id="c-email">
                    <Input id="c-email" type="email" {...input("email")} />
                  </Field>
                  {kind === "suppliers" && (
                    <Field label="Condição de pagamento" id="c-cond">
                      <Input id="c-cond" {...input("paymentTerms")} />
                    </Field>
                  )}
                </div>
              </>
            )}
            {kind === "categories" && (
              <>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Field label="Código *" id="c-cod">
                    <Input id="c-cod" autoFocus placeholder="2.04" {...input("code")} />
                  </Field>
                  <Field label="Nome *" id="c-nome">
                    <Input id="c-nome" {...input("name")} />
                  </Field>
                </div>
                <Field label="Tipo *" id="c-tipo" hint="Despesa vai para Contas a pagar; receita, para Contas a receber. Com lançamentos, o tipo não muda.">
                  <SearchSelect
                    id="c-tipo"
                    value={form.kind}
                    onChange={(value) => setForm((current) => ({ ...current, kind: value as "despesa" | "receita" }))}
                    options={[
                      { id: "despesa", label: "Despesa" },
                      { id: "receita", label: "Receita" },
                    ]}
                  />
                </Field>
              </>
            )}
            {!withCnpj && kind !== "categories" && (
              <>
                {needsCompany && (
                  <Field label="Empresa *" id="c-emp">
                    <SearchSelect
                      id="c-emp"
                      value={form.companyId}
                      onChange={(value) => setForm((current) => ({ ...current, companyId: value }))}
                      options={companies.map((c) => ({ id: c.id, label: c.name }))}
                    />
                  </Field>
                )}
                {kind === "costCenters" &&
                  (record ? (
                    <Field
                      label="Superior"
                      id="c-sup"
                      hint="O superior não muda depois de cadastrado: o código depende dele."
                    >
                      <Input
                        id="c-sup"
                        disabled
                        readOnly
                        value={centerLabel(centers.find((center) => center.id === record.parentId)) || "Nenhum: é um centro principal"}
                      />
                    </Field>
                  ) : (
                    <>
                      <Field
                        label="Tipo"
                        id="c-nivel"
                        hint={
                          subCenter
                            ? "Fica embaixo de um centro principal e leva o código dele: 001.001, 001.002…"
                            : "Agrupa outros centros. O código é gerado: 001, 002…"
                        }
                      >
                        <SearchSelect
                          id="c-nivel"
                          value={subCenter ? "sub" : "principal"}
                          onChange={(value) => {
                            setSubCenter(value === "sub");
                            if (value !== "sub") setForm((current) => ({ ...current, parentId: "" }));
                          }}
                          options={[
                            { id: "principal", label: "Centro principal" },
                            { id: "sub", label: "Sub-centro" },
                          ]}
                        />
                      </Field>
                      {subCenter && (
                        <Field
                          label="Superior *"
                          id="c-sup"
                          hint={
                            principals.length
                              ? "O centro principal em que ele fica."
                              : "Ainda não há centro principal ativo: cadastre um primeiro."
                          }
                        >
                          <SearchSelect
                            id="c-sup"
                            searchable
                            value={form.parentId}
                            onChange={(value) => setForm((current) => ({ ...current, parentId: value }))}
                            options={principals.map((center) => ({ id: center.id, label: centerLabel(center) }))}
                          />
                        </Field>
                      )}
                    </>
                  ))}
                {(kind === "units" || kind === "costCenters") && (
                  <GeneratedCodeField code={form.code} isNew={!record} />
                )}
                <Field label="Nome *" id="c-nome">
                  <Input id="c-nome" autoFocus={!needsCompany} {...input("name")} />
                </Field>
              </>
            )}
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            {wizard ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => (step === 0 ? (saved ? onDone() : onClose()) : goTo(0))}
                >
                  {step === 0 ? "Cancelar" : "Voltar"}
                </Button>
                <Button type="submit" variant="outline" disabled={submitting}>
                  {owner ? "Salvar e fechar" : "Cadastrar e fechar"}
                </Button>
                {step === 0 ? (
                  <Button type="button" disabled={submitting} onClick={advance}>
                    Avançar
                  </Button>
                ) : (
                  <Button type="button" disabled={submitting} onClick={() => void save("documents")}>
                    Salvar e anexar documentos
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {record ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  kind,
  record,
  onClose,
  onDone,
}: {
  kind: RecordKind;
  record: RecordRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { error, submitting, run } = useFormAction();
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Excluir {record.name}</DialogTitle>
          <DialogDescription>Não há lançamentos com ele. Isso não pode ser desfeito.</DialogDescription>
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
                await deleteRecord(kind, record.id);
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

function ProjectDialog({
  project,
  onClose,
  onDone,
}: {
  project: Project;
  onClose: () => void;
  onDone: (project: Project) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [projectType, setProjectType] = useState(project.projectType ?? NO_TYPE);
  const [hasIncentive, setHasIncentive] = useState(project.hasIncentive ? "sim" : "nao");
  const [days, setDays] = useState(project.incentiveDays ? String(project.incentiveDays) : "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const withIncentive = hasIncentive === "sim";
    const parsed = Number(days);
    if (withIncentive && !(Number.isInteger(parsed) && parsed >= 1 && parsed <= 30)) {
      return setLocalError("Informe o prazo do incentivo em dias úteis (de 1 a 30).");
    }
    setLocalError(null);
    await run(async () =>
      onDone(
        await updateProjectIncentive(project.id, {
          projectType: projectType === NO_TYPE ? null : projectType,
          hasIncentive: withIncentive,
          incentiveDays: withIncentive ? parsed : null,
        })
      )
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Tipo e incentivo · PRJ-{project.code}</DialogTitle>
            <DialogDescription>{project.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo de projeto" id="pi-tipo">
                <SearchSelect
                  id="pi-tipo"
                  value={projectType}
                  onChange={setProjectType}
                  options={[{ id: NO_TYPE, label: "Sem tipo" }, ...PROJECT_TYPES.map((type) => ({ id: type, label: type }))]}
                />
              </Field>
              <Field label="Tem incentivo?" id="pi-tem">
                <SearchSelect
                  id="pi-tem"
                  value={hasIncentive}
                  onChange={setHasIncentive}
                  options={[
                    { id: "sim", label: "Sim" },
                    { id: "nao", label: "Não" },
                  ]}
                />
              </Field>
            </div>
            {hasIncentive === "sim" && (
              <Field label="Prazo do incentivo (dias úteis)" id="pi-prazo" hint="Conta a partir da data da pesquisa.">
                <Input
                  id="pi-prazo"
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </Field>
            )}
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function incentiveLabel(project: Project): string {
  return project.hasIncentive && project.incentiveDays
    ? `Incentivo em ${plural(project.incentiveDays, "dia útil", "dias úteis")}`
    : "Sem incentivo";
}

/** O tipo de cadastro vem do endereço (?aba=), escolhido no menu lateral. Trocar de tipo recria a tela. */
export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsByUrl />
    </Suspense>
  );
}

function RecordsByUrl() {
  const aba = useSearchParams().get("aba");
  const tab = TABS.find((option) => option.id === aba)?.id ?? TABS[0].id;
  return <Records key={tab} tab={tab} />;
}

function Records({ tab }: { tab: TabId }) {
  const isParty = tab === "suppliers" || tab === "customers";
  const withCnpj = isParty || tab === "companies";
  // o que impede excluir: lançamento e, no centro de custo, também ter sub-centros embaixo
  const inUseWhat =
    tab === "costCenters" ? "lançamentos ou sub-centros" : tab === "customers" ? "lançamentos ou documentos" : "lançamentos";
  const [term, setTerm] = useState("");
  const [requestedPage, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(null);
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ record: RecordRow | null } | null>(null);
  const [deleting, setDeleting] = useState<RecordRow | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const current = TABS.find((option) => option.id === tab) ?? TABS[0];

  const load = useCallback(async () => {
    setError(null);
    try {
      // Unidade e conta bancária mostram a empresa, e o projeto vem do Connect: tudo vem daqui.
      const nextReference = await getReference();
      setReference(nextReference);
      setRows(tab === "projects" ? [] : await listRecords(tab));
    } catch (err) {
      setRows(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os cadastros");
    }
  }, [tab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando a aba muda
    void load();
  }, [load]);

  const companies = useMemo(() => reference?.companies ?? [], [reference]);
  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? "Empresa inativa";

  const shown = useMemo(() => {
    const all = rows ?? [];
    const companyOf = (id: number | null) => companies.find((c) => c.id === id)?.name ?? "";
    const text = (row: RecordRow) => recordText(row, sort?.column ?? "name", companyOf(row.companyId));
    const byCode = (a: RecordRow, b: RecordRow) =>
      (a.code ?? "\uffff").localeCompare(b.code ?? "\uffff", "pt-BR", { numeric: true });
    // Centro de custo em árvore: os principais na ordem escolhida (a do código, se nada foi escolhido)
    // e, embaixo de cada um, os sub-centros dele na mesma ordem
    const arrange = (list: RecordRow[]) => (sort ? sortedBy(list, text, sort.descending) : [...list].sort(byCode));
    const ordered =
      tab === "costCenters"
        ? arrange(all.filter((row) => row.parentId === null)).flatMap((root) => [
            root,
            ...arrange(all.filter((row) => row.parentId === root.id)),
          ])
        : sort
          ? sortedBy(all, text, sort.descending)
          : all;
    const parentName = (row: RecordRow) => ordered.find((other) => other.id === row.parentId)?.name;
    const labeled = ordered.map((row) => ({
      row,
      label: [row.name, row.nickname, row.code, row.document, parentName(row)].filter(Boolean).join(" "),
    }));
    return filterOptions(labeled, term).map(({ row }) => row);
  }, [rows, term, tab, sort, companies]);
  const projects = useMemo(() => {
    const found = filterOptions(
      (reference?.projects ?? []).map((project) => ({ project, label: `PRJ-${project.code} ${project.title}` })),
      term
    ).map(({ project }) => project);
    const text = (project: Project) =>
      sort?.column === "status"
        ? project.status === "encerrado"
          ? "Encerrado"
          : "Em andamento"
        : sort?.column === "type"
          ? (project.projectType ?? "")
          : `${project.code} ${project.title}`;
    return sort ? sortedBy(found, text, sort.descending) : found;
  }, [reference, term, sort]);

  function changeSort(column: SortColumn) {
    setSort((current) => ({ column, descending: current?.column === column ? !current.descending : false }));
    setPage(1);
  }

  const totals = useMemo(() => {
    if (tab === "projects") {
      const all = reference?.projects ?? [];
      return reference ? { all: all.length, active: all.filter((p) => p.status !== "encerrado").length } : null;
    }
    return rows ? { all: rows.length, active: rows.filter((row) => row.active).length } : null;
  }, [tab, reference, rows]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // a lista pode encolher (exclusão, busca): a página pedida nunca passa da última
  const page = Math.min(requestedPage, pageCount);
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function toggleActive(record: RecordRow) {
    if (tab === "projects") return;
    try {
      await setRecordActive(tab, record.id, !record.active);
      toast.success(
        record.active
          ? `${record.name} inativado. Some das listas de escolha e continua nos relatórios.`
          : `${record.name} reativado.`
      );
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível alterar o cadastro");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Cadastros"
        icon={BookUser}
        actions={
          current.create && (
            <Button onClick={() => setEditing({ record: null })} disabled={!rows}>
              <Plus size={16} />
              {current.create}
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CountCard
          label="Exibindo"
          value={tab === "projects" ? (reference ? projects.length : null) : rows ? shown.length : null}
          hint={term ? "na busca de agora" : "sem busca: todos"}
          icon={Eye}
          tone="azul"
        />
        <CountCard
          label={`Total de ${current.many}`}
          value={totals ? totals.all : null}
          hint={tab === "projects" ? "vêm do P+ Connect" : "ativos e inativos"}
          icon={Layers}
          tone="roxo"
        />
        <CountCard
          label={tab === "projects" ? "Em andamento" : "Ativos"}
          value={totals ? totals.active : null}
          hint={tab === "projects" ? "recebem lançamento" : "aparecem nas listas de escolha"}
          icon={CircleCheck}
          tone="verde"
        />
        <CountCard
          label={tab === "projects" ? "Encerrados" : "Inativos"}
          value={totals ? totals.all - totals.active : null}
          hint={tab === "projects" ? "não recebem lançamento" : "somem das listas, ficam nos relatórios"}
          icon={Archive}
          tone="cinza"
        />
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="relative w-full max-w-[320px]">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
            <Input
              className="bg-card pl-8"
              aria-label={`Buscar em ${current.label.toLowerCase()}`}
              placeholder={`Buscar em ${current.label.toLowerCase()}…`}
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
          {tab === "projects" && (
            <span className="text-xs text-muted-foreground">Os projetos vêm do P+ Connect. Aqui só se marca o tipo e o incentivo.</span>
          )}
        </div>

        {!rows ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : tab === "projects" ? (
          projects.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Projeto" column="project" sort={sort} onSort={changeSort} />
                  <SortHead label="Situação" column="status" sort={sort} onSort={changeSort} />
                  <SortHead label="Tipo e incentivo" column="type" sort={sort} onSort={changeSort} />
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className={cn(TD, "whitespace-normal font-semibold text-brand-cinza-escuro")}>
                      PRJ-{project.code} · {project.title}
                    </TableCell>
                    <TableCell className={TD}>
                      <Tag color={project.status === "encerrado" ? "cinza" : "verde"}>
                        {project.status === "encerrado" ? "Encerrado" : "Em andamento"}
                      </Tag>
                    </TableCell>
                    <TableCell className={TD}>
                      {project.projectType ?? "Sem tipo"}
                      <span className="block text-xs text-muted-foreground">{incentiveLabel(project)}</span>
                    </TableCell>
                    <TableCell className={cn(TD, "text-right")}>
                      <RowButton icon={Pencil} label="Editar tipo e incentivo" onClick={() => setEditingProject(project)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {term ? "Nenhum projeto com essa busca." : "Nenhum projeto ainda. Eles chegam do P+ Connect."}
            </p>
          )
        ) : visible.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {(tab === "categories" || withCnpj || tab === "units" || tab === "costCenters") && (
                    <SortHead label="Código" column="code" sort={sort} onSort={changeSort} />
                  )}
                  {(tab === "units" || tab === "bankAccounts") && (
                    <SortHead label="Empresa" column="company" sort={sort} onSort={changeSort} />
                  )}
                  <SortHead label={withCnpj ? "Apelido · nome" : "Nome"} column="name" sort={sort} onSort={changeSort} />
                  {tab === "categories" && <SortHead label="Tipo" column="kind" sort={sort} onSort={changeSort} />}
                  {withCnpj && <SortHead label="CNPJ" column="document" sort={sort} onSort={changeSort} />}
                  {isParty && <SortHead label="Contato" column="contact" sort={sort} onSort={changeSort} />}
                  {tab === "suppliers" && <SortHead label="Condição" column="terms" sort={sort} onSort={changeSort} />}
                  <SortHead label="Situação" column="status" sort={sort} onSort={changeSort} />
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id} className={tab === "costCenters" && row.parentId === null ? "bg-brand-azul-deep/5" : undefined}>
                    {(tab === "categories" || withCnpj || tab === "units" || tab === "costCenters") && (
                      <TableCell
                        className={cn(
                          TD,
                          "font-mono text-xs",
                          tab === "costCenters" && (row.parentId === null ? "font-semibold text-brand-cinza-escuro" : "text-muted-foreground")
                        )}
                      >
                        {row.code ?? "—"}
                      </TableCell>
                    )}
                    {(tab === "units" || tab === "bankAccounts") && (
                      <TableCell className={TD}>{companyName(row.companyId)}</TableCell>
                    )}
                    <TableCell className={cn(TD, "whitespace-normal", row.parentId !== null && "pl-9")}>
                      <span className={cn("inline-flex items-center gap-2 text-brand-cinza-escuro", row.parentId !== null ? "font-normal" : "font-semibold")}>
                        {tab === "costCenters" &&
                          (row.parentId === null ? (
                            <Folder className="size-4 text-brand-azul-deep" aria-hidden />
                          ) : (
                            <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />
                          ))}
                        {row.nickname ?? row.name}
                      </span>
                      {row.nickname && <span className="block text-xs text-muted-foreground">{row.name}</span>}
                    </TableCell>
                    {tab === "categories" && (
                      <TableCell className={TD}>
                        <Tag color={row.kind === "receita" ? "azul" : "cinza"}>{row.kind === "receita" ? "Receita" : "Despesa"}</Tag>
                      </TableCell>
                    )}
                    {withCnpj && (
                      <TableCell className={cn(TD, "tabular-nums")}>{row.document ? formatCnpj(row.document) : row.personType === "PF" ? "Pessoa física" : "—"}</TableCell>
                    )}
                    {isParty && (
                      <TableCell className={cn(TD, "whitespace-normal")}>
                        {row.contactName ?? "—"}
                        {(row.email || row.phone) && (
                          <span className="block text-xs text-muted-foreground">{row.email ?? row.phone}</span>
                        )}
                      </TableCell>
                    )}
                    {tab === "suppliers" && <TableCell className={cn(TD, "whitespace-normal")}>{row.paymentTerms ?? "—"}</TableCell>}
                    <TableCell className={TD}>
                      <Tag color={row.active ? "verde" : "cinza"}>{row.active ? "Ativo" : "Inativo"}</Tag>
                    </TableCell>
                    <TableCell className={cn(TD, "whitespace-nowrap text-right")}>
                      <RowButton icon={Pencil} label={`Editar ${row.name}`} onClick={() => setEditing({ record: row })} />
                      <RowButton
                        icon={row.active ? Archive : ArchiveRestore}
                        label={`${row.active ? "Inativar" : "Reativar"} ${row.name}`}
                        onClick={() => toggleActive(row)}
                      />
                      <RowButton
                        icon={Trash2}
                        label={`Excluir ${row.name}`}
                        muted={row.inUse}
                        hint={row.inUse ? `Tem ${inUseWhat}: inative em vez de excluir` : undefined}
                        onClick={() =>
                          row.inUse
                            ? toast.error(`${row.name} tem ${inUseWhat}: inative em vez de excluir.`)
                            : setDeleting(row)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>{plural(shown.length, "cadastro", "cadastros")}</span>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    Anterior
                  </Button>
                  <span>
                    {page} de {pageCount}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {term ? "Nenhum cadastro com essa busca." : "Nada cadastrado ainda."}
          </p>
        )}
      </div>

      {editing && tab !== "projects" && (
        <RecordDialog
          kind={tab}
          one={current.one}
          record={editing.record}
          companies={companies}
          centers={rows ?? []}
          onClose={() => setEditing(null)}
          onDone={() => {
            toast.success(editing.record ? "Alterações salvas." : "Cadastro criado.");
            setEditing(null);
            void load();
          }}
          onSaved={() => void load()}
        />
      )}
      {deleting && tab !== "projects" && (
        <DeleteDialog
          kind={tab}
          record={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            toast.success(`${deleting.name} excluído.`);
            setDeleting(null);
            void load();
          }}
        />
      )}
      {editingProject && (
        <ProjectDialog
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onDone={(project) => {
            toast.success(`PRJ-${project.code} atualizado: ${project.projectType ?? "sem tipo"}, ${incentiveLabel(project).toLowerCase()}.`);
            setEditingProject(null);
            void load();
          }}
        />
      )}
    </main>
  );
}
