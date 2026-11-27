"use client";

import {
  Archive,
  ArchiveRestore,
  BookUser,
  CircleCheck,
  CornerDownRight,
  Eye,
  Folder,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useScreenSearchParams } from "@/components/ScreenTabs";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { CARD, ErrorBox, Field, FormError, PageHeader, RedStars, TD, TH, Tag } from "@/components/finance";
import { ReasonDialog } from "@/components/ReasonDialog";
import { CountCard, RowButton, SortHead, sortedBy, type SortState } from "@/components/RecordParts";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  attachCustomerDocument,
  createProject,
  createRecord,
  deleteProject,
  deleteRecord,
  editProject,
  downloadCustomerDocument,
  getReference,
  listCustomerDocuments,
  listRecords,
  lookupCnpj,
  removeCustomerDocument,
  renameCustomerDocument,
  setRecordActive,
  syncConnectProjects,
  updateRecord,
} from "@/lib/api";
import { seesEveryCompany } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { ACCOUNT_TYPES, accountTypeLabel, balanceText, parseBalance } from "@/lib/bank";
import { place } from "@/lib/nav";
import { UFS, formatZip, joinPhone, splitPhone, zipDigits, type PhoneParts } from "@/lib/customers";
import {
  openForLaunch,
  cleanCnpj,
  filterOptions,
  formatCnpj,
  looksLikeCnpj,
  plural,
  projectSituation,
  type Attachment,
  type Project,
  type RecordKind,
  type RecordRow,
  type Reference,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { HolidaysTab } from "./holidays";
import { TaxRatesTab } from "./tax-rates";

type TabId = RecordKind | "projects";

const TABS: { id: TabId; label: string; one: string; many: string; create?: string }[] = [
  { id: "companies", label: "Empresas", one: "empresa", many: "empresas", create: "Nova empresa" },
  { id: "units", label: "Unidades", one: "unidade", many: "unidades", create: "Nova unidade" },
  { id: "costCenters", label: "Centros de custo", one: "centro de custo", many: "centros de custo", create: "Novo centro de custo" },
  { id: "customers", label: "Clientes", one: "cliente", many: "clientes", create: "Novo cliente" },
  { id: "suppliers", label: "Fornecedores", one: "fornecedor", many: "fornecedores", create: "Novo fornecedor" },
  { id: "categories", label: "Plano de contas", one: "conta", many: "contas do plano", create: "Nova conta" },
  { id: "projects", label: "Projetos", one: "projeto", many: "projetos", create: "Novo projeto" },
  { id: "bankAccounts", label: "Contas bancárias", one: "conta bancária", many: "contas bancárias", create: "Nova conta bancária" },
  { id: "paymentMethods", label: "Formas de pagamento", one: "forma de pagamento", many: "formas de pagamento", create: "Nova forma" },
];

const PAGE_SIZE = 25;

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

/** O código que o cadastro tinha no sistema antigo: fica à parte do gerado e pode ser editado. */
function LegacyCodeField({ input }: { input: { value: string; onChange: (event: { target: { value: string } }) => void } }) {
  return (
    <Field label="Código no sistema antigo" id="c-antigo">
      <Input id="c-antigo" {...input} />
    </Field>
  );
}

type SortColumn =
  | "code"
  | "company"
  | "name"
  | "kind"
  | "document"
  | "status"
  | "project"
  | "customer"
  | "nickname"
  | "fullName"
  | "phones"
  | "emails";
type Sort = SortState<SortColumn>;

/** Uma linha da lista; no plano de contas, `planGroup` marca a linha do grupo (24/11). */
type PlanRow = RecordRow & { planGroup?: boolean };

/** Os telefones e os e-mails do cliente, cada um numa linha, como na lista do sistema antigo (24/11). */
function phonesOf(row: RecordRow): string[] {
  return [row.phone, row.phone2, row.phone3].filter((value): value is string => Boolean(value));
}

function emailsOf(row: RecordRow): string[] {
  return [row.email, row.emailAlt].filter((value): value is string => Boolean(value));
}

/** O código da lista: o do sistema antigo, como na tela de lá (24/11); sem ele, o gerado (que fica na janela de editar). */
function listCode(row: RecordRow): string | null {
  return row.legacyCode ?? row.code;
}

function recordText(row: RecordRow, column: SortColumn, company: string, code: string | null): string {
  switch (column) {
    case "code":
      return code ?? "";
    case "company":
      return company;
    case "kind":
      return row.kind ?? "";
    case "document":
      return row.document ?? "";
    case "status":
      return row.active ? "Ativo" : "Inativo";
    case "nickname":
      return row.nickname ?? "";
    case "fullName":
      return row.name;
    case "phones":
      return phonesOf(row).join(" ");
    case "emails":
      return emailsOf(row).join(" ");
    default:
      return row.nickname ?? row.name;
  }
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
  groups,
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
  /** Os grupos do plano de contas (para escolher o grupo da conta). */
  groups: RecordRow[];
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
    legacyCode: record?.legacyCode ?? "",
    companyId: record?.companyId ? String(record.companyId) : "",
    groupId: record?.groupId ? String(record.groupId) : "",
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
    origin: record?.origin ?? "",
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
    // só na conta bancária (o banco de hoje é o Itaú)
    bankName: record ? (record.bankName ?? "") : "Itaú",
    agency: record?.agency ?? "",
    accountNumber: record?.accountNumber ?? "",
    accountType: record?.accountType ?? "cc",
    impactsCashFlow: record?.impactsCashFlow === false ? "nao" : "sim",
    openingBalance: balanceText(record?.openingBalance ?? null),
    openingDate: record?.openingDate ?? "",
  });
  // Cliente: cadastro em etapas (Principal, Endereço e Documentos), e os três telefones em partes
  // Cliente e fornecedor (24/11, como no sistema antigo): cadastro em etapas; Documentos, só o cliente
  const wizard = kind === "customers" || kind === "suppliers";
  const stepsShown = kind === "customers" ? CUSTOMER_STEPS : CUSTOMER_STEPS.slice(0, 2);
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
    // Os dados da conta bancária só vão quando o cadastro é de conta bancária
    const { bankName, agency, accountNumber, accountType, openingBalance, openingDate, impactsCashFlow, ...common } = form;
    const balance = parseBalance(openingBalance);
    if (kind === "bankAccounts" && balance === null) {
      return setLocalError("Saldo inicial inválido. Use o formato 1.234,56.");
    }
    const bank =
      kind === "bankAccounts"
        ? {
            bankName,
            agency,
            accountNumber,
            accountType,
            openingBalance: balance,
            openingDate: openingDate || null,
            impactsCashFlow: impactsCashFlow !== "nao",
          }
        : {};
    await run(async () => {
      const body = {
        ...common,
        ...bank,
        companyId: form.companyId ? Number(form.companyId) : null,
        groupId: form.groupId ? Number(form.groupId) : null,
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
          <RedStars
            text={wizard ? "Só a primeira etapa é obrigatória. Os campos com * são obrigatórios." : "Os campos com * são obrigatórios."}
          />
        </DialogDescription>
      </DialogHeader>
      {wizard && (
        <nav aria-label="Etapas do cadastro" className="flex flex-wrap gap-2 pt-3">
          {stepsShown.map((item, index) => (
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
                      {/* o texto de status logo abaixo já diz "Consultando a Receita…": o círculo é só visual */}
                      {lookup.busy ? <Spinner aria-hidden="true" className="size-4" /> : <Search size={16} />}
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
                {kind === "companies" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="IE (inscrição estadual)" id="c-ie">
                      <Input id="c-ie" {...input("stateRegistration")} />
                    </Field>
                    <LegacyCodeField input={input("legacyCode")} />
                  </div>
                )}
                {wizard && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LegacyCodeField input={input("legacyCode")} />
                    <Field label="Origem" id="c-origem" hint="De onde veio o cadastro.">
                      <Input id="c-origem" {...input("origin")} />
                    </Field>
                  </div>
                )}
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
                {kind === "suppliers" && (
                  <Field label="Condição de pagamento" id="c-cond">
                    <Input id="c-cond" {...input("paymentTerms")} />
                  </Field>
                )}
                <Field
                  label="Observações"
                  id="c-obs"
                  hint={
                    kind === "suppliers"
                      ? "Não escreva CPF nem chave Pix: eles não são guardados."
                      : "Não escreva CPF: ele não é guardado."
                  }
                >
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
            {(kind === "categories" || kind === "categoryGroups") && (
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <Field label="Código *" id="c-cod">
                  <Input id="c-cod" autoFocus placeholder={kind === "categories" ? "2.04" : "001"} {...input("code")} />
                </Field>
                <Field label="Nome *" id="c-nome">
                  <Input id="c-nome" {...input("name")} />
                </Field>
              </div>
            )}
            {kind === "categories" && (
              <>
                <Field label="Grupo" id="c-grupo" hint="Como no sistema antigo: o grupo junta as contas, e só a conta recebe lançamento.">
                  <SearchSelect
                    id="c-grupo"
                    searchable
                    value={form.groupId}
                    onChange={(value) => setForm((current) => ({ ...current, groupId: value }))}
                    options={[
                      { id: "", label: "Sem grupo" },
                      ...groups
                        .filter((group) => group.active || String(group.id) === form.groupId)
                        .map((group) => ({ id: group.id, label: `${group.code} ${group.name}` })),
                    ]}
                  />
                </Field>
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
            {!withCnpj && kind !== "categories" && kind !== "categoryGroups" && (
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
                {kind === "bankAccounts" && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Banco" id="c-banco" hint="O nome ou o número do banco (341).">
                        <Input id="c-banco" {...input("bankName")} />
                      </Field>
                      <Field label="Tipo" id="c-tipoconta">
                        <SearchSelect
                          id="c-tipoconta"
                          value={form.accountType}
                          onChange={(value) =>
                            setForm((current) => ({ ...current, accountType: value as "cc" | "ci" | "interna" | "credito" }))
                          }
                          options={ACCOUNT_TYPES}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Agência" id="c-agencia" hint={form.accountType === "credito" ? "No cartão, a bandeira (Master)." : undefined}>
                        <Input id="c-agencia" {...input("agency")} />
                      </Field>
                      <Field label="Conta" id="c-conta" hint="Com o dígito, por exemplo 12345-6.">
                        <Input id="c-conta" {...input("accountNumber")} />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Saldo inicial" id="c-saldo" hint="Em reais. Vazio é zero.">
                        <MoneyInput id="c-saldo" allowNegative placeholder="0,00" {...input("openingBalance")} />
                      </Field>
                      <Field label="Data do saldo" id="c-saldo-data" hint="Obrigatória se há saldo inicial.">
                        <DateInput id="c-saldo-data" {...input("openingDate")} />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Entra no fluxo de caixa" id="c-fluxo">
                        <SearchSelect
                          id="c-fluxo"
                          value={form.impactsCashFlow}
                          onChange={(value) => setForm((current) => ({ ...current, impactsCashFlow: value }))}
                          options={[
                            { id: "sim", label: "Sim" },
                            { id: "nao", label: "Não" },
                          ]}
                        />
                      </Field>
                      <LegacyCodeField input={input("legacyCode")} />
                    </div>
                  </>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <GeneratedCodeField code={form.code} isNew={!record} />
                    <LegacyCodeField input={input("legacyCode")} />
                  </div>
                )}
                <Field label="Nome *" id="c-nome">
                  <Input id="c-nome" autoFocus={!needsCompany} {...input("name")} />
                </Field>
                {kind === "units" && (
                  <>
                    <Field label="Apelido" id="c-apelido">
                      <Input id="c-apelido" {...input("nickname")} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="CNPJ" id="c-doc" hint="Pode ser o da empresa.">
                        <Input id="c-doc" placeholder="00.000.000/0000-00" {...input("document")} />
                      </Field>
                      <Field label="IE (inscrição estadual)" id="c-ie">
                        <Input id="c-ie" {...input("stateRegistration")} />
                      </Field>
                    </div>
                  </>
                )}
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
                  kind === "customers" && (
                    <Button type="button" disabled={submitting} onClick={() => void save("documents")}>
                      Salvar e anexar documentos
                    </Button>
                  )
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

/**
 * O projeto cadastrado no Financeiro, por enquanto (testes de 16/11, A22; ADR 0021). Como na tela
 * antiga (18/11): código, nome, unidade, cliente e centro de custo, todos obrigatórios; na edição,
 * Inativo e Excluir. Escolher o projeto na Nova conta a pagar já preenche a unidade e o centro de
 * custo daqui. A ligação com o projeto do Connect é plano futuro.
 */
function ProjectDialog({
  project,
  reference,
  onClose,
  onDone,
  onDeleted,
}: {
  project: Project | null;
  reference: Reference;
  onClose: () => void;
  onDone: (project: Project) => void;
  onDeleted: (project: Project) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: project?.code ?? "",
    title: project?.title ?? "",
    unitId: project?.unitId ? String(project.unitId) : "",
    customerId: project?.customerId ? String(project.customerId) : "",
    costCenterId: project?.costCenterId ? String(project.costCenterId) : "",
    inactive: project?.active === false ? "sim" : "nao",
    notes: project?.notes ?? "",
    legacyCode: project?.legacyCode ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const companyName = (id: number) => reference.companies.find((c) => c.id === id)?.name ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missing = [
      !form.code.trim() && "código",
      !form.title.trim() && "nome",
      !form.unitId && "unidade",
      !form.customerId && "cliente",
      !form.costCenterId && "centro de custo",
    ].filter(Boolean);
    if (missing.length) return setLocalError(`Falta preencher: ${missing.join(", ")}.`);
    if (!/^[\w.-]+$/.test(form.code.trim())) {
      return setLocalError("O código do projeto leva só letras, números, ponto e traço (ex.: 1804).");
    }
    setLocalError(null);
    const body = {
      code: form.code.trim(),
      title: form.title.trim(),
      unitId: Number(form.unitId),
      customerId: Number(form.customerId),
      costCenterId: Number(form.costCenterId),
      active: form.inactive !== "sim",
      notes: form.notes.trim() || null,
      legacyCode: form.legacyCode.trim() || null,
      // Tipo e incentivo saíram da tela (18/11): a edição devolve o que já estava gravado.
      projectType: project?.projectType ?? null,
      hasIncentive: project?.hasIncentive ?? false,
      incentiveDays: project?.incentiveDays ?? null,
    };
    await run(async () => onDone(project ? await editProject(project.id, body) : await createProject(body)));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{project ? `Editar projeto · PRJ-${project.code}` : "Novo projeto"}</DialogTitle>
            <DialogDescription>
              <RedStars text="Os campos com * são obrigatórios. A unidade e o centro de custo entram sozinhos na Nova conta a pagar." />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Field label="Código *" id="pj-num" hint="Ex.: 1804">
                <Input id="pj-num" maxLength={20} value={form.code} onChange={(event) => set("code")(event.target.value)} />
              </Field>
              <Field label="Nome *" id="pj-nome">
                <Input id="pj-nome" maxLength={200} value={form.title} onChange={(event) => set("title")(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Unidade *" id="pj-uni" hint="Vem preenchida no lançamento.">
                <SearchSelect
                  id="pj-uni"
                  searchable
                  value={form.unitId}
                  onChange={set("unitId")}
                  options={reference.units.map((u) => ({ id: u.id, label: `${u.name} · ${companyName(u.companyId)}` }))}
                />
              </Field>
              <Field label="Cliente *" id="pj-cli">
                <SearchSelect
                  id="pj-cli"
                  searchable
                  value={form.customerId}
                  onChange={set("customerId")}
                  options={reference.customers.map((c) => ({ id: c.id, label: `${c.nickname} · ${c.name}` }))}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Centro de custo *" id="pj-cc" hint="Vem preenchido no lançamento.">
                <SearchSelect
                  id="pj-cc"
                  searchable
                  value={form.costCenterId}
                  onChange={set("costCenterId")}
                  options={reference.costCenters.map((c) => ({ id: c.id, label: c.label }))}
                />
              </Field>
              {project && (
                <Field label="Inativo" id="pj-inativo" hint="Inativo some da Nova conta a pagar; o que já foi lançado fica.">
                  <SearchSelect
                    id="pj-inativo"
                    value={form.inactive}
                    onChange={set("inactive")}
                    options={[
                      { id: "nao", label: "Não" },
                      { id: "sim", label: "Sim" },
                    ]}
                  />
                </Field>
              )}
            </div>
            <Field label="Código no sistema antigo" id="pj-antigo">
              <Input id="pj-antigo" maxLength={20} value={form.legacyCode} onChange={(event) => set("legacyCode")(event.target.value)} />
            </Field>
            <Field label="Observações" id="pj-obs" hint="Como no sistema antigo: metodologia, segmento...">
              <Textarea id="pj-obs" rows={3} maxLength={1000} value={form.notes} onChange={(event) => set("notes")(event.target.value)} />
            </Field>
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            {project && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={submitting}
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            )}
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {project && (
        <AlertDialog open={confirmDelete} onOpenChange={(open) => !submitting && setConfirmDelete(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir PRJ-{project.code}?</AlertDialogTitle>
              <AlertDialogDescription>
                Só sai o projeto que ainda não tem conta lançada. Com conta, marque Inativo: ele some da Nova conta a
                pagar e o histórico fica. Isso não pode ser desfeito.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={submitting}
                onClick={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    setConfirmDelete(false);
                    await deleteProject(project.id);
                    onDeleted(project);
                  });
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}

/** "Consumo SP · Campo": o padrão do lançamento do projeto, ou um traço. */
/** O que a lista de projetos mostra, como a do sistema antigo (24/11): o cliente pela razão social, a
 * empresa (a da unidade), a unidade e o centro de custo pelo nome. */
function projectParts(project: Project, reference: Reference | null) {
  const unit = reference?.units.find((u) => u.id === project.unitId);
  return {
    customer: reference?.customers.find((c) => c.id === project.customerId)?.name ?? "",
    company: unit ? (reference?.companies.find((c) => c.id === unit.companyId)?.name ?? "") : "",
    unit: unit?.name ?? "",
    center: reference?.costCenters.find((c) => c.id === project.costCenterId)?.name ?? "",
  };
}

/** O código da lista: o do sistema antigo (CARPE DIEM), ou o do Financeiro. */
function projectCode(project: Project): string {
  return project.legacyCode ?? project.code;
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
  const params = useScreenSearchParams();
  const aba = params.get("aba");
  // a busca geral do topo manda `?busca=`: a aba recomeça com ela
  const linkedSearch = params.get("busca") ?? "";
  // Feriados não seguem o molde dos outros cadastros (data, âmbito e busca na BrasilAPI): tela própria
  if (aba === "holidays") return <HolidaysTab />;
  // Percentuais, sem lista de cadastros: tela própria (19/11)
  if (aba === "taxRates") return <TaxRatesTab />;
  const tab = TABS.find((option) => option.id === aba)?.id ?? TABS[0].id;
  return <Records key={`${tab}|${linkedSearch}`} tab={tab} linkedSearch={linkedSearch} />;
}

function Records({ tab, linkedSearch }: { tab: TabId; linkedSearch: string }) {
  const { user } = useAuth();
  const isParty = tab === "suppliers" || tab === "customers";
  const withCnpj = isParty || tab === "companies";
  // Como nas listas do sistema antigo (24/11): Unidades (Empresa | Unidade | Código | Infos | Ações) e
  // Clientes e fornecedores (Código | Apelido | Nome | Fones | Emails | Infos | Ações)
  const oldLayout = tab === "units";
  // Contas bancárias como no sistema antigo (24/11): Empresa | Código | Nome | Tipo | Banco | Agência | Conta
  const bankLayout = tab === "bankAccounts";
  // o que impede excluir: lançamento e, no centro de custo, também ter sub-centros embaixo
  const inUseWhat =
    tab === "costCenters"
      ? "lançamentos ou sub-centros"
      : tab === "customers"
        ? "lançamentos ou documentos"
        : tab === "bankAccounts"
          ? "lançamentos ou extratos"
          : "lançamentos";
  const [term, setTerm] = useState(linkedSearch);
  const [requestedPage, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(null);
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  // Na aba do plano de contas, os grupos (24/11): a coluna Grupo e a escolha na janela
  const [groups, setGroups] = useState<RecordRow[]>([]);
  const groupNames = useMemo(() => new Map(groups.map((group) => [group.id, `${group.code} ${group.name}`])), [groups]);
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `group`: o grupo novo do plano de contas (o que já existe vem marcado na própria linha)
  const [editing, setEditing] = useState<{ record: PlanRow | null; group?: boolean } | null>(null);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);
  // `project: null` é o projeto novo
  const [editingProject, setEditingProject] = useState<{ project: Project | null } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const current = TABS.find((option) => option.id === tab) ?? TABS[0];

  const load = useCallback(async () => {
    setError(null);
    try {
      // Unidade e conta bancária mostram a empresa, e o projeto vem do Connect: tudo vem daqui.
      const nextReference = await getReference();
      setReference(nextReference);
      setRows(tab === "projects" ? [] : await listRecords(tab));
      setGroups(tab === "categories" ? await listRecords("categoryGroups") : []);
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

  const shown = useMemo((): PlanRow[] => {
    const all = rows ?? [];
    const companyOf = (id: number | null) => companies.find((c) => c.id === id)?.name ?? "";
    const text = (row: RecordRow) => recordText(row, sort?.column ?? "name", companyOf(row.companyId), listCode(row));
    const byCode = (a: RecordRow, b: RecordRow) =>
      (a.code ?? "\uffff").localeCompare(b.code ?? "\uffff", "pt-BR", { numeric: true });
    // Centro de custo em árvore: os principais na ordem escolhida (a do código, se nada foi escolhido)
    // e, embaixo de cada um, os sub-centros dele na mesma ordem
    const arrange = (list: RecordRow[]) => (sort ? sortedBy(list, text, sort.descending) : [...list].sort(byCode));
    if (tab === "categories") {
      // Plano de contas em árvore, como no sistema antigo (24/11): cada grupo, na ordem do código, e
      // embaixo as contas dele; depois, as contas sem grupo. A busca mostra o grupo das contas achadas.
      const found = filterOptions(
        all.map((row) => ({ row, label: [row.code, row.name, groupNames.get(row.groupId ?? 0)].filter(Boolean).join(" ") })),
        term
      ).map(({ row }) => row);
      const tree = [...groups].sort(byCode).flatMap((group): PlanRow[] => {
        const children = arrange(found.filter((row) => row.groupId === group.id));
        const itself = filterOptions([{ row: group, label: `${group.code} ${group.name}` }], term).length > 0;
        return children.length || itself ? [{ ...group, planGroup: true }, ...children] : [];
      });
      return [...tree, ...arrange(found.filter((row) => row.groupId === null))];
    }
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
      label: [row.name, row.nickname, row.code, row.legacyCode, row.document, parentName(row), ...phonesOf(row), ...emailsOf(row)]
        .filter(Boolean)
        .join(" "),
    }));
    return filterOptions(labeled, term).map(({ row }) => row);
  }, [rows, term, tab, sort, companies, groups, groupNames]);
  const projects = useMemo(() => {
    const found = filterOptions(
      (reference?.projects ?? []).map((project) => ({
        project,
        label: [`PRJ-${project.code}`, project.legacyCode, project.title, projectParts(project, reference).customer]
          .filter(Boolean)
          .join(" "),
      })),
      term
    ).map(({ project }) => project);
    const text = (project: Project) =>
      sort?.column === "status"
        ? projectSituation(project)
        : sort?.column === "customer"
          ? projectParts(project, reference).customer
          : sort?.column === "code"
            ? projectCode(project)
            : project.title;
    return sort ? sortedBy(found, text, sort.descending) : found;
  }, [reference, term, sort]);
  // Agrupados por empresa e unidade, como no sistema antigo (24/11); o sem unidade fica no fim
  const projectGroups = useMemo(() => {
    const groups = new Map<string, { company: string; unit: string; items: Project[] }>();
    for (const project of projects) {
      const { company, unit } = projectParts(project, reference);
      const key = `${company}|${unit}`;
      const group = groups.get(key) ?? { company, unit, items: [] };
      group.items.push(project);
      groups.set(key, group);
    }
    const last = (text: string) => (text ? text : "\uffff");
    return [...groups.values()].sort(
      (a, b) =>
        last(a.company).localeCompare(last(b.company), "pt-BR") || last(a.unit).localeCompare(last(b.unit), "pt-BR")
    );
  }, [projects, reference]);

  function changeSort(column: SortColumn) {
    setSort((current) => ({ column, descending: current?.column === column ? !current.descending : false }));
    setPage(1);
  }

  const totals = useMemo(() => {
    if (tab === "projects") {
      const all = reference?.projects ?? [];
      return reference ? { all: all.length, active: all.filter(openForLaunch).length } : null;
    }
    return rows ? { all: rows.length, active: rows.filter((row) => row.active).length } : null;
  }, [tab, reference, rows]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // a lista pode encolher (exclusão, busca): a página pedida nunca passa da última
  const page = Math.min(requestedPage, pageCount);
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /** Os projetos nascem no Connect: aqui só se traz a lista de lá. Quem já existe só muda o título. */
  async function syncProjects() {
    setSyncing(true);
    try {
      const count = await syncConnectProjects();
      toast.success(`${plural(count, "projeto", "projetos")} no Connect. A lista está atualizada.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível falar com o Connect agora");
    } finally {
      setSyncing(false);
    }
  }

  /** O tipo do grupo do plano: o das contas dele, se todas são do mesmo tipo. */
  function groupKind(group: RecordRow): RecordRow["kind"] {
    const kinds = new Set((rows ?? []).filter((row) => row.groupId === group.id).map((row) => row.kind));
    return kinds.size === 1 ? [...kinds][0] : null;
  }

  async function toggleActive(record: PlanRow) {
    if (tab === "projects") return;
    try {
      await setRecordActive(record.planGroup ? "categoryGroups" : tab, record.id, !record.active);
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
        {...place(`/cadastros?aba=${tab}`)}
        icon={BookUser}
        actions={
          tab === "projects" ? (
            <div className="flex flex-wrap gap-2">
              {seesEveryCompany(user) && (
                <Button variant="outline" onClick={() => void syncProjects()} disabled={syncing}>
                  {syncing ? <Spinner aria-label="Atualizando" className="size-4" /> : <RefreshCw size={16} />}
                  Atualizar do Connect
                </Button>
              )}
              <Button onClick={() => setEditingProject({ project: null })} disabled={!reference}>
                <Plus size={16} />
                Novo projeto
              </Button>
            </div>
          ) : (
            // empresa nova só quem vê todas cadastra (o servidor recusa as outras pessoas)
            current.create &&
            (tab !== "companies" || seesEveryCompany(user)) && (
              <div className="flex flex-wrap gap-2">
                {tab === "categories" && (
                  <Button variant="outline" onClick={() => setEditing({ record: null, group: true })} disabled={!rows}>
                    <Plus size={16} />
                    Novo grupo
                  </Button>
                )}
                <Button onClick={() => setEditing({ record: null })} disabled={!rows}>
                  <Plus size={16} />
                  {current.create}
                </Button>
              </div>
            )
          )
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      <div data-tour="totais" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          hint={tab === "projects" ? "cadastrados aqui, por enquanto" : "ativos e inativos"}
          icon={Layers}
          tone="roxo"
        />
        <CountCard
          label={tab === "projects" ? "Recebem lançamento" : "Ativos"}
          value={totals ? totals.active : null}
          hint={tab === "projects" ? "recebem lançamento" : "aparecem nas listas de escolha"}
          icon={CircleCheck}
          tone="verde"
        />
        <CountCard
          label={tab === "projects" ? "Encerrados ou inativos" : "Inativos"}
          value={totals ? totals.all - totals.active : null}
          hint={tab === "projects" ? "não recebem lançamento" : "somem das listas, ficam nos relatórios"}
          icon={Archive}
          tone="cinza"
        />
      </div>

      <div data-tour="lista" className={CARD}>
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
            <span className="text-xs text-muted-foreground">
              Por enquanto o projeto é cadastrado aqui. Quando o P+ Connect mandar os projetos, eles chegam sozinhos.
            </span>
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
                  <SortHead label="Código" column="code" sort={sort} onSort={changeSort} />
                  <SortHead label="Projeto" column="project" sort={sort} onSort={changeSort} />
                  <SortHead label="Cliente" column="customer" sort={sort} onSort={changeSort} />
                  <TableHead className={TH}>Empresa</TableHead>
                  <TableHead className={TH}>Unidade</TableHead>
                  <TableHead className={TH}>C.Custo</TableHead>
                  <SortHead label="Infos" column="status" sort={sort} onSort={changeSort} />
                  <TableHead className={cn(TH, "text-right")}>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectGroups.map((group) => [
                  // a faixa da empresa e da unidade, em destaque como no sistema antigo
                  <TableRow
                    key={`grupo-${group.company}-${group.unit}`}
                    className="bg-brand-azul-deep text-white hover:bg-brand-azul-deep"
                  >
                    <TableCell className={cn(TD, "py-2 font-semibold")}>{group.company || "Sem unidade"}</TableCell>
                    <TableCell className={cn(TD, "py-2 font-semibold")} colSpan={7}>
                      {group.unit}
                    </TableCell>
                  </TableRow>,
                  ...group.items.map((project) => {
                    const parts = projectParts(project, reference);
                    return (
                      <TableRow key={project.id}>
                        <TableCell className={cn(TD, "font-mono text-xs")}>{projectCode(project)}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal font-semibold text-brand-cinza-escuro")}>
                          {project.title}
                        </TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>{parts.customer || "—"}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>{parts.company || "—"}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>{parts.unit || "—"}</TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>{parts.center || "—"}</TableCell>
                        <TableCell className={TD}>
                          <Tag color={projectSituation(project) === "Em andamento" ? "verde" : "cinza"}>
                            {projectSituation(project) === "Em andamento" ? "Ativo" : projectSituation(project)}
                          </Tag>
                        </TableCell>
                        <TableCell className={cn(TD, "text-right")}>
                          <RowButton
                            icon={Pencil}
                            label={`Editar PRJ-${project.code}`}
                            onClick={() => setEditingProject({ project })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  }),
                ])}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {term ? "Nenhum projeto com essa busca." : "Nenhum projeto ainda. Use Novo projeto para cadastrar."}
            </p>
          )
        ) : visible.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {tab === "categories" && <SortHead label="Tipo" column="kind" sort={sort} onSort={changeSort} />}
                  {(withCnpj || tab === "costCenters") && (
                    <SortHead label="Código" column="code" sort={sort} onSort={changeSort} />
                  )}
                  {(tab === "units" || tab === "bankAccounts") && (
                    <SortHead label="Empresa" column="company" sort={sort} onSort={changeSort} />
                  )}
                  {bankLayout && <SortHead label="Código" column="code" sort={sort} onSort={changeSort} />}
                  {isParty ? (
                    <>
                      <SortHead label="Apelido" column="nickname" sort={sort} onSort={changeSort} />
                      <SortHead label="Nome" column="fullName" sort={sort} onSort={changeSort} />
                    </>
                  ) : (
                    <SortHead
                      label={oldLayout ? "Unidade" : tab === "categories" ? "Plano de contas" : withCnpj ? "Apelido · nome" : "Nome"}
                      column="name"
                      sort={sort}
                      onSort={changeSort}
                    />
                  )}
                  {(oldLayout || tab === "categories") && <SortHead label="Código" column="code" sort={sort} onSort={changeSort} />}
                  {bankLayout && (
                    <>
                      <TableHead className={TH}>Tipo</TableHead>
                      <TableHead className={TH}>Banco</TableHead>
                      <TableHead className={TH}>Agência</TableHead>
                      <TableHead className={TH}>Conta</TableHead>
                    </>
                  )}
                  {tab === "companies" && <SortHead label="CNPJ" column="document" sort={sort} onSort={changeSort} />}
                  {isParty && (
                    <>
                      <SortHead label="Fones" column="phones" sort={sort} onSort={changeSort} />
                      <SortHead label="Emails" column="emails" sort={sort} onSort={changeSort} />
                    </>
                  )}
                  {tab === "suppliers" && <SortHead label="Documentos" column="document" sort={sort} onSort={changeSort} />}
                  <SortHead label={oldLayout || isParty || bankLayout || tab === "categories" ? "Infos" : "Situação"} column="status" sort={sort} onSort={changeSort} />
                  <TableHead className={cn(TH, "text-right")}>{oldLayout || isParty || bankLayout || tab === "categories" ? "Ações" : ""}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow
                    key={`${row.planGroup ? "grupo" : "linha"}-${row.id}`}
                    className={cn(
                      tab === "costCenters" && row.parentId === null && "bg-brand-azul-deep/5",
                      // o grupo do plano em destaque, como no sistema antigo
                      row.planGroup && "bg-brand-azul-deep text-white hover:bg-brand-azul-deep"
                    )}
                  >
                    {tab === "categories" && (
                      <TableCell className={TD}>
                        {(row.planGroup ? groupKind(row) : row.kind) ? (
                          <Tag color={(row.planGroup ? groupKind(row) : row.kind) === "receita" ? "azul" : "cinza"}>
                            {(row.planGroup ? groupKind(row) : row.kind) === "receita" ? "Receita" : "Despesa"}
                          </Tag>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {(withCnpj || tab === "costCenters") && (
                      <TableCell
                        className={cn(
                          TD,
                          "font-mono text-xs",
                          tab === "costCenters" && (row.parentId === null ? "font-semibold text-brand-cinza-escuro" : "text-muted-foreground")
                        )}
                      >
                        {listCode(row) ?? "—"}
                      </TableCell>
                    )}
                    {(tab === "units" || tab === "bankAccounts") && (
                      <TableCell className={TD}>{companyName(row.companyId)}</TableCell>
                    )}
                    {bankLayout && <TableCell className={cn(TD, "font-mono text-xs")}>{listCode(row) ?? "—"}</TableCell>}
                    {isParty && (
                      <>
                        <TableCell className={cn(TD, "whitespace-normal font-semibold text-brand-cinza-escuro")}>
                          {row.nickname ?? "—"}
                        </TableCell>
                        <TableCell className={cn(TD, "whitespace-normal")}>{row.name}</TableCell>
                      </>
                    )}
                    {!isParty && (
                    <TableCell
                      className={cn(TD, "whitespace-normal", (row.parentId !== null || (tab === "categories" && row.groupId !== null)) && "pl-9")}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-2",
                          row.planGroup ? "text-white" : "text-brand-cinza-escuro",
                          row.parentId !== null || (tab === "categories" && !row.planGroup) ? "font-normal" : "font-semibold"
                        )}
                      >
                        {tab === "costCenters" &&
                          (row.parentId === null ? (
                            <Folder className="size-4 text-brand-azul-deep" aria-hidden />
                          ) : (
                            <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />
                          ))}
                        {tab === "categories" &&
                          (row.planGroup ? (
                            <Folder className="size-4 text-white" aria-hidden />
                          ) : (
                            row.groupId !== null && <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />
                          ))}
                        {oldLayout ? row.name : (row.nickname ?? row.name)}
                      </span>
                      {row.nickname && !oldLayout && <span className="block text-xs text-muted-foreground">{row.name}</span>}
                    </TableCell>
                    )}
                    {(oldLayout || tab === "categories") && (
                      <TableCell className={cn(TD, "font-mono text-xs")}>{listCode(row) ?? "—"}</TableCell>
                    )}
                    {bankLayout && (
                      <>
                        <TableCell className={TD}>{accountTypeLabel(row.accountType)}</TableCell>
                        <TableCell className={TD}>{row.bankName ?? "—"}</TableCell>
                        <TableCell className={cn(TD, "tabular-nums")}>{row.agency ?? "—"}</TableCell>
                        <TableCell className={cn(TD, "tabular-nums")}>{row.accountNumber ?? "—"}</TableCell>
                      </>
                    )}
                    {tab === "companies" && (
                      <TableCell className={cn(TD, "tabular-nums")}>{row.document ? formatCnpj(row.document) : row.personType === "PF" ? "Pessoa física" : "—"}</TableCell>
                    )}
                    {isParty && (
                      <>
                        <TableCell className={cn(TD, "tabular-nums")}>
                          {phonesOf(row).length
                            ? phonesOf(row).map((phone) => (
                                <span key={phone} className="block">
                                  {phone}
                                </span>
                              ))
                            : "—"}
                        </TableCell>
                        <TableCell className={TD}>
                          {emailsOf(row).length
                            ? emailsOf(row).map((email) => (
                                <span key={email} className="block">
                                  {email}
                                </span>
                              ))
                            : "—"}
                        </TableCell>
                      </>
                    )}
                    {/* Fornecedor: o tipo e o CNPJ, como na coluna Documentos do sistema antigo (24/11) */}
                    {tab === "suppliers" && (
                      <TableCell className={cn(TD, "tabular-nums")}>
                        {row.personType && <span className="block">{row.personType}</span>}
                        {row.document ? formatCnpj(row.document) : !row.personType && "—"}
                      </TableCell>
                    )}
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
          kind={editing.group || editing.record?.planGroup ? "categoryGroups" : tab}
          one={editing.group || editing.record?.planGroup ? "grupo" : current.one}
          record={editing.record}
          companies={companies}
          centers={rows ?? []}
          groups={groups}
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
          kind={deleting.planGroup ? "categoryGroups" : tab}
          record={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            toast.success(`${deleting.name} excluído.`);
            setDeleting(null);
            void load();
          }}
        />
      )}
      {editingProject && reference && (
        <ProjectDialog
          project={editingProject.project}
          reference={reference}
          onClose={() => setEditingProject(null)}
          onDone={(project) => {
            toast.success(
              editingProject.project ? `PRJ-${project.code} atualizado.` : `PRJ-${project.code} cadastrado.`
            );
            setEditingProject(null);
            void load();
          }}
          onDeleted={(project) => {
            toast.success(`PRJ-${project.code} excluído.`);
            setEditingProject(null);
            void load();
          }}
        />
      )}
    </main>
  );
}
