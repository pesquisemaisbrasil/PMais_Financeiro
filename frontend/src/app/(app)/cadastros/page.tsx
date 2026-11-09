"use client";

import { Archive, ArchiveRestore, BookUser, Pencil, Plus, Search, Trash2, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, Field, FormError, PageHeader, TD, TH, Tag } from "@/components/finance";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ApiError,
  createRecord,
  deleteRecord,
  getReference,
  listRecords,
  lookupCnpj,
  setRecordActive,
  updateProjectIncentive,
  updateRecord,
} from "@/lib/api";
import {
  cleanCnpj,
  filterOptions,
  formatCnpj,
  looksLikeCnpj,
  plural,
  type Project,
  type RecordKind,
  type RecordRow,
  type Reference,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type TabId = RecordKind | "projects";

const TABS: { id: TabId; label: string; one: string; create?: string }[] = [
  { id: "suppliers", label: "Fornecedores", one: "fornecedor", create: "Novo fornecedor" },
  { id: "customers", label: "Clientes", one: "cliente", create: "Novo cliente" },
  { id: "categories", label: "Plano de contas", one: "conta", create: "Nova conta" },
  { id: "companies", label: "Empresas", one: "empresa", create: "Nova empresa" },
  { id: "units", label: "Unidades", one: "unidade", create: "Nova unidade" },
  { id: "costCenters", label: "Centros de custo", one: "centro de custo", create: "Novo centro de custo" },
  { id: "bankAccounts", label: "Contas bancárias", one: "conta bancária", create: "Nova conta bancária" },
  { id: "paymentMethods", label: "Formas de pagamento", one: "forma de pagamento", create: "Nova forma" },
  { id: "projects", label: "Projetos (Connect)", one: "projeto" },
];

const PAGE_SIZE = 25;
const PROJECT_TYPES = ["Health", "CATI", "Consumo", "Outro"];
const NO_TYPE = "sem-tipo";

function RowButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RecordDialog({
  kind,
  one,
  record,
  companies,
  onClose,
  onDone,
}: {
  kind: RecordKind;
  one: string;
  record: RecordRow | null;
  companies: { id: number; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [form, setForm] = useState({
    name: record?.name ?? "",
    nickname: record?.nickname ?? "",
    code: record?.code ?? "",
    companyId: record?.companyId ? String(record.companyId) : "",
    document: record?.document ? formatCnpj(record.document) : "",
    contactName: record?.contactName ?? "",
    phone: record?.phone ?? "",
    email: record?.email ?? "",
    paymentTerms: record?.paymentTerms ?? "",
    kind: record?.kind ?? "despesa",
  });
  const input = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });
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

  function changeDocument(value: string) {
    setForm((current) => ({ ...current, document: value }));
    if (!looksLikeCnpj(value)) {
      searched.current = "";
      setLookup({ busy: false, tone: "info", message: "" });
    } else if (cleanCnpj(value) !== searched.current) {
      void search(value, false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const body = { ...form, companyId: form.companyId ? Number(form.companyId) : null };
      await (record ? updateRecord(kind, record.id, body) : createRecord(kind, body));
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{record ? `Editar ${one}` : `Cadastrar ${one}`}</DialogTitle>
            <DialogDescription>Os campos com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            {withCnpj && (
              <>
                <Field label="CNPJ" id="c-doc">
                  <div className="flex gap-2">
                    <Input
                      id="c-doc"
                      autoFocus
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
                      disabled={lookup.busy}
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
                    {lookup.message ||
                      "Digite o CNPJ para a Receita preencher o nome e o apelido; você pode editar. Pessoa física fica sem documento por enquanto."}
                  </p>
                </Field>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Field label="Código" id="c-cod">
                    <Input id="c-cod" {...input("code")} />
                  </Field>
                  <Field label={isParty ? "Apelido *" : "Apelido"} id="c-apelido">
                    <Input id="c-apelido" {...input("nickname")} />
                  </Field>
                </div>
                <Field label="Nome / razão social *" id="c-nome">
                  <Input id="c-nome" {...input("name")} />
                </Field>
              </>
            )}
            {isParty && (
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
                <Field label="Nome *" id="c-nome">
                  <Input id="c-nome" autoFocus={!needsCompany} {...input("name")} />
                </Field>
              </>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {record ? "Salvar alterações" : "Cadastrar"}
            </Button>
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
  const tab = TABS.find((option) => option.id === aba)?.id ?? "suppliers";
  return <Records key={tab} tab={tab} />;
}

function Records({ tab }: { tab: TabId }) {
  const isParty = tab === "suppliers" || tab === "customers";
  const withCnpj = isParty || tab === "companies";
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
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
    const labeled = (rows ?? []).map((row) => ({
      row,
      label: [row.name, row.nickname, row.code, row.document].filter(Boolean).join(" "),
    }));
    return filterOptions(labeled, term).map(({ row }) => row);
  }, [rows, term]);
  const projects = useMemo(
    () =>
      filterOptions(
        (reference?.projects ?? []).map((project) => ({ project, label: `PRJ-${project.code} ${project.title}` })),
        term
      ).map(({ project }) => project),
    [reference, term]
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
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
                  <TableHead className={TH}>Projeto</TableHead>
                  <TableHead className={TH}>Situação</TableHead>
                  <TableHead className={TH}>Tipo e incentivo</TableHead>
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
                  {(tab === "categories" || withCnpj) && <TableHead className={TH}>Código</TableHead>}
                  {(tab === "units" || tab === "bankAccounts") && <TableHead className={TH}>Empresa</TableHead>}
                  <TableHead className={TH}>{withCnpj ? "Apelido · nome" : "Nome"}</TableHead>
                  {tab === "categories" && <TableHead className={TH}>Tipo</TableHead>}
                  {withCnpj && <TableHead className={TH}>CNPJ</TableHead>}
                  {isParty && <TableHead className={TH}>Contato</TableHead>}
                  {tab === "suppliers" && <TableHead className={TH}>Condição</TableHead>}
                  <TableHead className={TH}>Situação</TableHead>
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    {(tab === "categories" || withCnpj) && (
                      <TableCell className={cn(TD, "font-mono text-xs")}>{row.code ?? "—"}</TableCell>
                    )}
                    {(tab === "units" || tab === "bankAccounts") && (
                      <TableCell className={TD}>{companyName(row.companyId)}</TableCell>
                    )}
                    <TableCell className={cn(TD, "whitespace-normal")}>
                      <span className="font-semibold text-brand-cinza-escuro">{row.nickname ?? row.name}</span>
                      {row.nickname && <span className="block text-xs text-muted-foreground">{row.name}</span>}
                    </TableCell>
                    {tab === "categories" && (
                      <TableCell className={TD}>
                        <Tag color={row.kind === "receita" ? "azul" : "cinza"}>{row.kind === "receita" ? "Receita" : "Despesa"}</Tag>
                      </TableCell>
                    )}
                    {withCnpj && (
                      <TableCell className={cn(TD, "tabular-nums")}>{row.document ? formatCnpj(row.document) : "—"}</TableCell>
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
                      {!row.inUse && <RowButton icon={Trash2} label={`Excluir ${row.name}`} onClick={() => setDeleting(row)} />}
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
          onClose={() => setEditing(null)}
          onDone={() => {
            toast.success(editing.record ? "Alterações salvas." : "Cadastro criado.");
            setEditing(null);
            void load();
          }}
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
