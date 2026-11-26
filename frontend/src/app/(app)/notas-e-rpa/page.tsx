"use client";

import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { CARD, ErrorBox, Field, FormError, NUM, PageHeader, TD, TH } from "@/components/finance";
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, getReference } from "@/lib/api";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/bank-month";
import { titleHref } from "@/lib/cashFlow";
import { saveBlob } from "@/lib/documents";
import {
  exportRpa,
  getPendingInvoices,
  getRpa,
  registerInvoice,
  type PendingInvoice,
  type PendingInvoices,
  type RpaMonth,
} from "@/lib/fiscal";
import { place } from "@/lib/nav";
import { brl, formatDate, plural, type Reference } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type TabId = "nf" | "rpa";

function Loading({ label }: { label: string }) {
  return (
    <div className="flex justify-center p-8">
      <Spinner aria-label={label} className="size-6 text-brand-cinza-escuro/70" />
    </div>
  );
}

function PayableLink({ id, text }: { id: number; text: string }) {
  return (
    <Link href={titleHref({ kind: "pagar", titleId: id })} className="text-brand-azul-deep underline-offset-2 hover:underline">
      {text}
    </Link>
  );
}

/** A nota chegou: número e emissão, e o aviso some. Fica no histórico do lançamento. */
function RegisterDialog({ row, onClose, onDone }: { row: PendingInvoice; onClose: () => void; onDone: () => void }) {
  const { error, submitting, run } = useFormAction();
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Registrar NF</DialogTitle>
          <DialogDescription>
            {row.name} · {brl(row.amount)}. O aviso de NF pendente sai, e o registro fica no histórico do lançamento.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3.5">
          <Field label="Número da NF *" id="nf-numero">
            <Input id="nf-numero" autoFocus maxLength={50} value={number} onChange={(event) => setNumber(event.target.value)} />
          </Field>
          <Field label="Data de emissão *" id="nf-emissao">
            <DateInput id="nf-emissao" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </Field>
        </div>
        <FormError message={localError ?? error} />
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            disabled={submitting}
            onClick={() => {
              if (!number.trim() || !issueDate) return setLocalError("Informe o número e a data de emissão da nota.");
              setLocalError(null);
              void run(async () => {
                await registerInvoice(row.itemId, number.trim(), issueDate);
                toast.success("NF registrada. O aviso de NF pendente saiu.");
                onDone();
              });
            }}
          >
            {submitting ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvoicesTab({ reference }: { reference: Reference | null }) {
  const [project, setProject] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PendingInvoices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<PendingInvoice | null>(null);
  // a busca mais recente: a resposta de um filtro que já mudou é descartada
  const latest = useRef(0);

  useEffect(() => {
    if (searchText === search) return;
    const timer = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    try {
      const result = await getPendingInvoices(project, search);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar as NF pendentes");
    }
  }, [project, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da aba quando o filtro muda
    void load();
  }, [load]);

  return (
    <>
      <div data-tour="filtros" className={cn(CARD, "mb-4 flex flex-wrap items-end gap-3 px-4 py-4")}>
        <Field label="Projeto" id="nf-projeto">
          <SearchSelect
            id="nf-projeto"
            className="w-[240px]"
            value={project}
            onChange={setProject}
            placeholder="Todos"
            options={[
              { id: "", label: "Todos" },
              ...(reference?.projects ?? []).map((p) => ({ id: p.id, label: `PRJ-${p.code} · ${p.title}` })),
            ]}
          />
        </Field>
        <div className="relative w-full max-w-[300px]">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
          <Input
            className="bg-card pl-8"
            aria-label="Buscar pessoa ou lançamento"
            placeholder="Buscar pessoa ou lançamento…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Loading label="Carregando as NF pendentes" />}

      {data && !data.rows.length && (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhuma NF pendente nesses filtros.
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div data-tour="lista" className={cn(CARD, "overflow-x-auto")}>
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            {plural(data.rows.length, "pessoa", "pessoas")} sem a nota, somando {brl(data.total)}. É só aviso: o
            pagamento continua liberado.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Pessoa</TableHead>
                <TableHead className={TH}>Projeto</TableHead>
                <TableHead className={TH}>Lançamento</TableHead>
                <TableHead className={TH}>Vencimento</TableHead>
                <TableHead className={TH}>Situação</TableHead>
                <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                <TableHead className={TH}>
                  <span className="sr-only">Ação</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.itemId}>
                  <TableCell className={cn(TD, "font-medium text-brand-cinza-escuro")}>{row.name}</TableCell>
                  <TableCell className={TD}>{row.project}</TableCell>
                  <TableCell className={TD}>
                    <PayableLink id={row.payableId} text={row.description} />
                  </TableCell>
                  <TableCell className={TD}>{formatDate(row.dueDate)}</TableCell>
                  <TableCell className={TD}>{row.situation}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(row.amount)}</TableCell>
                  <TableCell className={cn(TD, "text-right")}>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Registrar a NF de ${row.name}`}
                      onClick={() => setRegistering(row)}
                    >
                      Registrar NF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {registering && (
        <RegisterDialog
          row={registering}
          onClose={() => setRegistering(null)}
          onDone={() => {
            setRegistering(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function RpaTab({ reference }: { reference: Reference | null }) {
  const [month, setMonth] = useState(() => currentMonth());
  const [company, setCompany] = useState("");
  const [data, setData] = useState<RpaMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    try {
      const result = await getRpa(month, company);
      if (mine === latest.current) setData(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar a lista de RPA");
    }
  }, [month, company]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da aba quando o mês muda
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      saveBlob(await exportRpa(month, company), `rpa-${month}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar a lista de RPA");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div data-tour="mes" className={cn(CARD, "mb-4 flex flex-wrap items-end gap-3 px-4 py-4")}>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pagos em</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium text-brand-cinza-escuro" aria-live="polite">
              {monthLabel(month)}
            </span>
            <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <Field label="Empresa" id="rpa-empresa">
          <SearchSelect
            id="rpa-empresa"
            className="w-[200px]"
            value={company}
            onChange={setCompany}
            placeholder="Todas"
            options={[{ id: "", label: "Todas" }, ...(reference?.companies ?? []).map((c) => ({ id: c.id, label: c.name }))]}
          />
        </Field>
        <Button variant="outline" className="ml-auto" onClick={handleExport} disabled={exporting || !data}>
          <FileSpreadsheet aria-hidden="true" />
          {exporting ? "Exportando…" : "Exportar Excel"}
        </Button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Loading label="Carregando a lista de RPA" />}

      {data && !data.rows.length && (
        <div className={cn(CARD, "px-5 py-8 text-center text-sm text-muted-foreground")}>
          Nenhuma pessoa paga por RPA em {data.label}.
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div data-tour="lista" className={cn(CARD, "overflow-x-auto")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Pessoa</TableHead>
                <TableHead className={TH}>Projeto</TableHead>
                <TableHead className={TH}>Lançamento</TableHead>
                <TableHead className={TH}>Pago em</TableHead>
                <TableHead className={cn(TH, NUM)}>Bruto</TableHead>
                <TableHead className={cn(TH, NUM)}>INSS</TableHead>
                <TableHead className={cn(TH, NUM)}>Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.itemId}>
                  <TableCell className={cn(TD, "font-medium text-brand-cinza-escuro")}>{row.name}</TableCell>
                  <TableCell className={TD}>{row.project}</TableCell>
                  <TableCell className={TD}>
                    <PayableLink id={row.payableId} text={`Nº ${row.payableId}`} />
                  </TableCell>
                  <TableCell className={TD}>{formatDate(row.paidOn)}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(row.gross)}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(row.inss)}</TableCell>
                  <TableCell className={cn(TD, NUM)}>{brl(row.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className={cn(TD, "font-semibold uppercase text-brand-cinza-escuro")} colSpan={4}>
                  Total · {plural(data.rows.length, "pessoa", "pessoas")}
                </TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.gross)}</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.inss)}</TableCell>
                <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(data.net)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Entra quem recebe por RPA e foi paga no mês. O INSS é o descontado na importação da folha (o percentual fica em
        Cadastros → Impostos retidos). O CPF e o PIS da pessoa ainda não vêm do Connect: a contabilidade completa no recibo.
      </p>
    </>
  );
}

export default function NotasERpaPage() {
  const [tab, setTab] = useState<TabId>("nf");
  const [reference, setReference] = useState<Reference | null>(null);

  useEffect(() => {
    getReference().then(setReference, () => setReference(null));
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      <PageHeader
        {...place("/notas-e-rpa")}
        icon={FileText}
        subtitle="Acompanha os documentos fiscais da folha de campo. Nada é pago aqui: a baixa e os anexos ficam no lançamento, em Contas a pagar."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
        <TabsList data-tour="abas" className="mb-4">
          <TabsTrigger value="nf">NF pendente</TabsTrigger>
          <TabsTrigger value="rpa">RPA do mês</TabsTrigger>
        </TabsList>
        <TabsContent value="nf">
          <PendingInvoicesTab reference={reference} />
        </TabsContent>
        <TabsContent value="rpa">
          <RpaTab reference={reference} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
