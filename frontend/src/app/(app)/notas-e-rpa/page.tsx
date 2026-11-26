"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Download, FileClock, FileSearch, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/DateInput";
import { CARD, ErrorBox, Field, FormError, NUM, PageHeader, TD, TH } from "@/components/finance";
import { CardTitle, ICON_COLORS, Kpi } from "@/components/Kpi";
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
import { ApiError } from "@/lib/api";
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
import { brl, formatDate } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

// Como no protótipo: os números no alto, a Lista de RPA e a NF pendente lado a lado, e a conferência embaixo.

function Loading({ label }: { label: string }) {
  return (
    <div className="flex justify-center p-8">
      <Spinner aria-label={label} className="size-6 text-brand-cinza-escuro/70" />
    </div>
  );
}

/** O projeto só quando a descrição do lançamento ainda não o traz ("Entrevistadores · PRJ-1804"). */
function withProject(description: string, project: string): string {
  return description.includes(project) ? "" : ` · ${project}`;
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

export default function NotasERpaPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [pending, setPending] = useState<PendingInvoices | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [rpa, setRpa] = useState<RpaMonth | null>(null);
  const [rpaError, setRpaError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<PendingInvoice | null>(null);
  const [exporting, setExporting] = useState(false);
  // o mês mais recente: a resposta de um mês que já mudou é descartada
  const latest = useRef(0);

  const loadPending = useCallback(async () => {
    setPendingError(null);
    try {
      setPending(await getPendingInvoices("", ""));
    } catch (err) {
      setPending(null);
      setPendingError(err instanceof ApiError ? err.message : "Não foi possível carregar as NF pendentes");
    }
  }, []);

  const loadRpa = useCallback(async () => {
    const mine = ++latest.current;
    setRpaError(null);
    try {
      const result = await getRpa(month, "");
      if (mine === latest.current) setRpa(result);
    } catch (err) {
      if (mine !== latest.current) return;
      setRpa(null);
      setRpaError(err instanceof ApiError ? err.message : "Não foi possível carregar a lista de RPA");
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da lista quando o mês muda
    void loadRpa();
  }, [loadRpa]);

  async function handleExport() {
    setExporting(true);
    try {
      saveBlob(await exportRpa(month, ""), `rpa-${month}.xlsx`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar a lista de RPA");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        {...place("/notas-e-rpa")}
        icon={ReceiptText}
        subtitle="NF pendente, lista de RPA para a contabilidade e conferência das notas do portal. Para pagar folha, incentivos ou provisões, use Contas a pagar."
        actions={
          <Button variant="outline" asChild>
            <Link href="/contas-a-pagar">
              <ArrowUpRight aria-hidden="true" />
              Ir para Contas a pagar
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="NF pendente"
          value={pending ? String(pending.rows.length) : "—"}
          detail="aviso, não bloqueia"
          icon={FileClock}
          color="ambar"
        />
        <Kpi
          label="RPA no mês"
          value={rpa ? String(rpa.rows.length) : "—"}
          detail={rpa ? `${brl(rpa.inss)} de INSS em ${rpa.label}` : "—"}
          icon={ReceiptText}
          color="azul"
        />
        <Kpi label="Notas do portal" value="—" detail="em breve: importar o arquivo do portal" icon={FileSearch} color="roxo" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section data-tour="rpa" className={cn(CARD, "overflow-hidden")}>
          <CardTitle
            title="Lista de RPA"
            subtitle="Para a contabilidade emitir os recibos"
            actions={
              <>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span className="min-w-[112px] text-center text-xs font-medium text-brand-cinza-escuro" aria-live="polite">
                    {monthLabel(month)}
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !rpa}>
                  <Download aria-hidden="true" />
                  {exporting ? "Exportando…" : "Exportar"}
                </Button>
              </>
            }
          />
          {rpaError && (
            <div className="p-4">
              <ErrorBox message={rpaError} onRetry={loadRpa} />
            </div>
          )}
          {!rpa && !rpaError && <Loading label="Carregando a lista de RPA" />}
          {rpa && !rpa.rows.length && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum RPA pago em {rpa.label}.</p>
          )}
          {rpa && rpa.rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Pessoa</TableHead>
                    <TableHead className={cn(TH, NUM)}>Bruto</TableHead>
                    <TableHead className={cn(TH, NUM)}>INSS</TableHead>
                    <TableHead className={cn(TH, NUM)}>Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rpa.rows.map((row) => (
                    <TableRow key={row.itemId}>
                      <TableCell className={TD}>
                        <span className="block font-medium text-brand-cinza-escuro">{row.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          <PayableLink id={row.payableId} text={row.description} />
                          {withProject(row.description, row.project)} · pago em{" "}
                          {formatDate(row.paidOn)}
                        </span>
                      </TableCell>
                      <TableCell className={cn(TD, NUM)}>{brl(row.gross)}</TableCell>
                      <TableCell className={cn(TD, NUM, "text-muted-foreground")}>− {brl(row.inss)}</TableCell>
                      <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(row.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className={cn(TD, "font-semibold")}>Total</TableCell>
                    <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(rpa.gross)}</TableCell>
                    <TableCell className={cn(TD, NUM, "font-semibold")}>− {brl(rpa.inss)}</TableCell>
                    <TableCell className={cn(TD, NUM, "font-semibold")}>{brl(rpa.net)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          <p className="px-5 pb-4 pt-3 text-xs text-muted-foreground">
            Entra quem recebe por RPA e foi paga no mês. O INSS (o percentual fica em Cadastros → Impostos retidos) é
            calculado na importação da folha, nunca digitado, e paga-se o líquido. O CPF e o PIS ainda não vêm do Connect:
            a contabilidade completa no recibo.
          </p>
        </section>

        <section data-tour="nf" className={cn(CARD, "overflow-hidden")}>
          <CardTitle title="NF pendente" subtitle="Só aviso: não tira ninguém do pagamento" />
          {pendingError && (
            <div className="p-4">
              <ErrorBox message={pendingError} onRetry={loadPending} />
            </div>
          )}
          {!pending && !pendingError && <Loading label="Carregando as NF pendentes" />}
          {pending && (
            <ul aria-label="NF pendente" className="max-h-[520px] overflow-y-auto">
              {pending.rows.map((row) => (
                <li key={row.itemId} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  <span className={cn("grid size-8 flex-shrink-0 place-items-center rounded-[10px]", ICON_COLORS.ambar)}>
                    <FileClock size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm font-semibold text-brand-cinza-escuro">{row.name}</strong>
                    <span className="block text-xs text-muted-foreground">
                      <PayableLink id={row.payableId} text={row.description} />
                      {withProject(row.description, row.project)} · {brl(row.amount)}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" aria-label={`Registrar a NF de ${row.name}`} onClick={() => setRegistering(row)}>
                    Registrar NF
                  </Button>
                </li>
              ))}
              {!pending.rows.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma nota pendente.</li>}
            </ul>
          )}
        </section>
      </div>

      <section data-tour="conferencia" className={cn(CARD, "overflow-hidden")}>
        <CardTitle
          title="Conferência de notas recebidas"
          subtitle="Notas emitidas contra os CNPJs do Grupo × notas lançadas nas contas"
        />
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Em breve: importar o arquivo exportado do portal da prefeitura ou do Emissor Nacional para cruzar com as contas e
          mostrar as notas que faltam lançar e as canceladas.
        </p>
      </section>

      {registering && (
        <RegisterDialog
          row={registering}
          onClose={() => setRegistering(null)}
          onDone={() => {
            setRegistering(null);
            void loadPending();
          }}
        />
      )}
    </main>
  );
}
