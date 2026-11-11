"use client";

import { Archive, BookUser, CalendarDays, CloudDownload, Eye, Plus, Search, Trash2, Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, Field, FormError, PageHeader, TD, TH, Tag } from "@/components/finance";
import { CountCard, RowButton, SortHead, sortedBy, type SortState } from "@/components/RecordParts";
import { SearchSelect as Choice } from "@/components/SearchSelect";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, deleteHoliday } from "@/lib/api";
import { UFS } from "@/lib/customers";
import { missingFieldsMessage } from "@/lib/forms";
import {
  SCOPES,
  SOURCE_LABELS,
  createHoliday,
  holidayPlace,
  listHolidays,
  syncHolidays,
  syncMessage,
  syncYears,
  weekday,
  type Holiday,
  type HolidayScope,
} from "@/lib/holidays";
import { formatDate, plural } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type Column = "date" | "name" | "place" | "source";

function holidayText(holiday: Holiday, column: Column): string {
  if (column === "name") return holiday.name;
  if (column === "place") return holidayPlace(holiday);
  if (column === "source") return SOURCE_LABELS[holiday.source];
  return holiday.date;
}

function NewHolidayDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", name: "", scope: "municipal" as HolidayScope, uf: "", city: "" });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const missing = missingFieldsMessage([
      ["Data", form.date],
      ["Nome", form.name.trim()],
      ["UF", form.scope === "nacional" || form.uf],
      ["Cidade", form.scope !== "municipal" || form.city.trim()],
    ]);
    if (missing) return setLocalError(missing);
    await run(async () => {
      await createHoliday({
        date: form.date,
        name: form.name.trim(),
        scope: form.scope,
        uf: form.scope === "nacional" ? null : form.uf,
        city: form.scope === "municipal" ? form.city.trim() : null,
      });
      toast.success("Feriado cadastrado. Ele já conta como dia não útil nos vencimentos calculados.");
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Novo feriado</DialogTitle>
            <DialogDescription>
              Os nacionais podem ser buscados pelo botão da tela. Aqui entram os locais e os pontos facultativos da empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data *" id="h-data">
                <Input id="h-data" type="date" value={form.date} onChange={(event) => set("date")(event.target.value)} />
              </Field>
              <Field label="Âmbito *" id="h-ambito">
                <Choice
                  id="h-ambito"
                  value={form.scope}
                  onChange={set("scope")}
                  options={SCOPES.map((scope) => ({ id: scope.id, label: scope.label }))}
                />
              </Field>
            </div>
            <Field label="Nome *" id="h-nome">
              <Input id="h-nome" value={form.name} maxLength={120} onChange={(event) => set("name")(event.target.value)} />
            </Field>
            {form.scope !== "nacional" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="UF *" id="h-uf">
                  <Choice id="h-uf" searchable value={form.uf} onChange={set("uf")} options={UFS} />
                </Field>
                {form.scope === "municipal" && (
                  <Field label="Cidade *" id="h-cidade">
                    <Input id="h-cidade" value={form.city} maxLength={80} onChange={(event) => set("city")(event.target.value)} />
                  </Field>
                )}
              </div>
            )}
          </div>
          <FormError message={localError ?? error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Voltar
            </Button>
            <Button type="submit" disabled={submitting}>
              Cadastrar feriado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteHolidayDialog({
  holiday,
  onClose,
  onDone,
}: {
  holiday: Holiday;
  onClose: () => void;
  onDone: () => void;
}) {
  const { error, submitting, run } = useFormAction();
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Excluir {holiday.name}</DialogTitle>
          <DialogDescription>
            {formatDate(holiday.date)} deixa de contar como dia não útil nos próximos cálculos de vencimento.
            {holiday.source === "brasilapi" && " Como veio da BrasilAPI, ele volta se os feriados do ano forem buscados de novo."}
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
                await deleteHoliday(holiday.id);
                toast.success("Feriado excluído.");
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

/** A aba "Feriados" do Cadastros: os nacionais da BrasilAPI e os locais do financeiro. */
export function HolidaysTab() {
  const thisYear = new Date().getFullYear();
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortState<Column>>({ column: "date", descending: false });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [year, setYear] = useState(String(thisYear));
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listHolidays());
    } catch (err) {
      setRows(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os feriados");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const found = (rows ?? []).filter(
      (row) =>
        !needle ||
        [row.name, holidayPlace(row), formatDate(row.date), weekday(row.date)].join(" ").toLowerCase().includes(needle)
    );
    return sort ? sortedBy(found, (row) => holidayText(row, sort.column), sort.descending) : found;
  }, [rows, term, sort]);

  const national = (rows ?? []).filter((row) => row.scope === "nacional").length;

  function changeSort(column: Column) {
    setSort((current) => ({ column, descending: current?.column === column ? !current.descending : false }));
  }

  async function sync() {
    setSyncing(true);
    try {
      toast.success(syncMessage(await syncHolidays(Number(year))));
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível buscar os feriados agora");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Cadastros"
        icon={BookUser}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[100px] bg-card" aria-label="Ano dos feriados nacionais">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {syncYears(thisYear).map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
              {syncing ? <Spinner aria-label="Buscando" className="size-4" /> : <CloudDownload size={16} />}
              Buscar nacionais do ano
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!rows}>
              <Plus size={16} />
              Novo feriado
            </Button>
          </div>
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
          value={rows ? shown.length : null}
          hint={term ? "na busca de agora" : "sem busca: todos"}
          icon={Eye}
          tone="azul"
        />
        <CountCard label="Total de feriados" value={rows ? rows.length : null} hint="nacionais e locais" icon={Layers} tone="roxo" />
        <CountCard label="Nacionais" value={rows ? national : null} hint="da BrasilAPI ou cadastrados" icon={CalendarDays} tone="verde" />
        <CountCard
          label="Locais"
          value={rows ? rows.length - national : null}
          hint="estaduais e municipais"
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
              aria-label="Buscar em feriados"
              placeholder="Buscar em feriados…"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Todo feriado daqui conta como dia não útil, além dos nacionais fixos e da Páscoa que o sistema já conhece.
          </span>
        </div>

        {!rows ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : shown.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Data" column="date" sort={sort} onSort={changeSort} />
                  <SortHead label="Nome" column="name" sort={sort} onSort={changeSort} />
                  <SortHead label="Onde vale" column="place" sort={sort} onSort={changeSort} />
                  <SortHead label="Origem" column="source" sort={sort} onSort={changeSort} />
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((holiday) => (
                  <TableRow key={holiday.id}>
                    <TableCell className={cn(TD, "whitespace-nowrap font-semibold tabular-nums text-brand-cinza-escuro")}>
                      {formatDate(holiday.date)}
                      <span className="block text-xs font-normal text-muted-foreground">{weekday(holiday.date)}</span>
                    </TableCell>
                    <TableCell className={cn(TD, "whitespace-normal font-semibold text-brand-cinza-escuro")}>{holiday.name}</TableCell>
                    <TableCell className={TD}>{holidayPlace(holiday)}</TableCell>
                    <TableCell className={TD}>
                      <Tag color={holiday.source === "brasilapi" ? "azul" : "cinza"}>{SOURCE_LABELS[holiday.source]}</Tag>
                    </TableCell>
                    <TableCell className={cn(TD, "whitespace-nowrap text-right")}>
                      <RowButton icon={Trash2} label={`Excluir ${holiday.name}`} onClick={() => setDeleting(holiday)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {plural(shown.length, "feriado", "feriados")}
            </div>
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {term
              ? "Nenhum feriado com essa busca."
              : "Nenhum feriado cadastrado ainda. Busque os nacionais do ano ou cadastre um local."}
          </p>
        )}
      </div>

      {creating && (
        <NewHolidayDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {deleting && (
        <DeleteHolidayDialog
          holiday={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            void load();
          }}
        />
      )}
    </main>
  );
}
