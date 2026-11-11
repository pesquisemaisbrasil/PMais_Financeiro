"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  ChartColumn,
  CircleCheck,
  Download,
  FileText,
  Gauge,
  Hourglass,
  Info,
  ListChecks,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, NUM, PageHeader, SituationTag, TD, TH, Tag } from "@/components/finance";
import { TONES, type IndicatorTone } from "@/components/IndicatorCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, downloadDocument } from "@/lib/api";
import { fileSize, kindLabel, saveBlob } from "@/lib/documents";
import { brl, formatDate, plural } from "@/lib/payables";
import {
  getProjectReport,
  listProjectReports,
  paidShare,
  projectReportHref,
  type ProjectReport,
  type ProjectSummary,
  type ReportDocument,
  type ReportLine,
} from "@/lib/projectReport";
import { cn } from "@/lib/utils";

export default function ProjectReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      }
    >
      <ByUrl />
    </Suspense>
  );
}

/** Sem `?codigo=`, a lista dos projetos; com ele, o relatório daquele projeto. */
function ByUrl() {
  const code = useSearchParams().get("codigo");
  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      {code ? <Report key={code} code={code} /> : <ProjectList />}
    </main>
  );
}

const loadError = (error: unknown) =>
  error instanceof ApiError ? error.message : "Não foi possível carregar o relatório";

// ---- Lista de projetos ----

function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProjects(await listProjectReports());
    } catch (err) {
      setError(loadError(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        overline="Relatórios"
        title="Relatório do projeto"
        icon={ChartColumn}
        subtitle="Escolha um projeto para ver quanto foi lançado, pago e falta pagar, e os documentos de todos os lançamentos dele. Aqui não se paga."
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!projects && !error && (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}
      {projects && (
        <div className={cn(CARD, "overflow-hidden")}>
          {projects.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Projeto</TableHead>
                  <TableHead className={TH}>Situação</TableHead>
                  <TableHead className={cn(TH, NUM)}>Lançado</TableHead>
                  <TableHead className={cn(TH, NUM)}>Pago</TableHead>
                  <TableHead className={cn(TH, NUM)}>A pagar</TableHead>
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className={cn(TD, "whitespace-normal")}>
                      <span className="font-semibold text-brand-azul-deep">PRJ-{project.code}</span>
                      <span className="block text-brand-cinza-escuro">{project.title}</span>
                    </TableCell>
                    <TableCell className={TD}>
                      <Tag color={project.status === "encerrado" ? "cinza" : "verde"}>
                        {project.status === "encerrado" ? "Encerrado" : "Em andamento"}
                      </Tag>
                    </TableCell>
                    <TableCell className={cn(TD, NUM)}>
                      {brl(project.launched)}
                      <span className="block text-xs text-muted-foreground">
                        {plural(project.payableCount, "conta", "contas")}
                      </span>
                    </TableCell>
                    <TableCell className={cn(TD, NUM)}>{brl(project.paid)}</TableCell>
                    <TableCell className={cn(TD, NUM)}>{brl(project.pending)}</TableCell>
                    <TableCell className={cn(TD, "text-right")}>
                      <Button asChild variant="outline" size="sm">
                        <Link href={projectReportHref(project.code)} aria-label={`Abrir o relatório de PRJ-${project.code}`}>
                          Abrir relatório <ArrowUpRight size={14} />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhum projeto ainda. Eles chegam do P+ Connect: em Cadastros, Projetos, use Atualizar do Connect.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ---- Relatório de um projeto ----

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: IndicatorTone;
}) {
  const look = TONES[tone];
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl px-3.5 py-3 shadow-[0_1px_2px_rgb(15_23_42/.06)]", look.idle)}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", look.chip)}>
          <Icon size={15} aria-hidden="true" />
        </span>
      </span>
      <span className="text-[15px] font-semibold tabular-nums text-brand-cinza-escuro">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function Report({ code }: { code: string }) {
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await getProjectReport(code));
    } catch (err) {
      setError(loadError(err));
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <BackLink />
        <ErrorBox message={error} onRetry={load} />
      </>
    );
  }
  if (!report) {
    return (
      <div className="flex justify-center p-8">
        <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
      </div>
    );
  }

  const { project } = report;
  const share = paidShare(report.launched, report.paid);
  const kind = [
    project.projectType ? `Tipo: ${project.projectType}` : "Sem tipo marcado",
    project.hasIncentive ? `incentivo em ${project.incentiveDays ?? "?"} dias úteis` : "sem incentivo",
  ].join(" · ");

  return (
    <>
      <BackLink />
      <PageHeader
        overline={`PRJ-${project.code}`}
        title={`Relatório · ${project.title}`}
        icon={ChartColumn}
        subtitle={kind}
        actions={
          <>
            {project.status === "encerrado" && <Tag color="cinza">Encerrado</Tag>}
            <Button asChild>
              <Link href={`/contas-a-pagar?modo=tudo&projeto=${project.id}`}>
                <ArrowUpRight size={16} /> Pagar em Contas a pagar
              </Link>
            </Button>
          </>
        }
      />

      <Alert className="mb-4 border-brand-azul-deep/20 bg-brand-azul-deep/5">
        <Info className="text-brand-azul-deep" />
        <AlertTitle>Aqui não se paga</AlertTitle>
        <AlertDescription>
          O relatório soma o que foi lançado em Contas a pagar para este projeto e junta os documentos de todos os
          lançamentos. Para pagar, abra a conta em Contas a pagar.
        </AlertDescription>
      </Alert>

      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        <StatCard
          label="Orçamento"
          value={report.budget === null ? "—" : brl(report.budget)}
          hint="definido no Connect"
          icon={Gauge}
          tone="azul"
        />
        <StatCard
          label="Lançado"
          value={brl(report.launched)}
          hint={plural(report.lines.length, "conta", "contas")}
          icon={ListChecks}
          tone="roxo"
        />
        <StatCard
          label="Pago"
          value={brl(report.paid)}
          hint={share ? `${share} do lançado` : "nada lançado"}
          icon={CircleCheck}
          tone="verde"
        />
        <StatCard label="A pagar" value={brl(report.pending)} hint="saldo em aberto" icon={Hourglass} tone="ambar" />
        <StatCard
          label="Saldo do orçamento"
          value={report.balance === null ? "—" : brl(report.balance)}
          hint="orçamento menos lançado"
          icon={PiggyBank}
          tone="ceu"
        />
        <StatCard
          label="Gasto total do projeto"
          value={brl(report.totalSpent)}
          hint={`${brl(report.paid)} já pago · todas as contas`}
          icon={Wallet}
          tone="roxo"
        />
        <StatCard
          label="Provisionado a pagar"
          value={brl(report.provisioned)}
          hint={`${plural(report.provisions.length, "provisão em aberto", "provisões em aberto")} · ainda não é gasto`}
          icon={PiggyBank}
          tone="ambar"
        />
      </div>
      {report.budget === null && (
        <p className={cn(CARD, "mb-6 px-5 py-3 text-sm text-muted-foreground")}>
          Sem orçamento definido · {brl(report.launched)} lançados. O orçamento vem do Connect.
        </p>
      )}

      <Lines
        title="Lançamentos de Contas a pagar"
        hint="Só a parte deste projeto em cada conta"
        lines={report.lines}
        totals={report}
        empty="Nenhuma conta lançada para este projeto ainda."
      />
      {report.provisions.length > 0 && (
        <Lines
          title="Provisões em aberto"
          hint="Ainda não é gasto: vira conta quando chega o valor real"
          lines={report.provisions}
          empty=""
        />
      )}
      <Documents documents={report.documents} />
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/relatorios/projeto"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-cinza-escuro/80 hover:text-brand-azul-deep"
    >
      <ArrowLeft size={16} /> Projetos
    </Link>
  );
}

// A tabela perde colunas conforme a tela estreita: categoria e documentos só em tela bem larga,
// e "Pago" some abaixo de 1280px (o pendente e o valor já dizem o resto). O que sobra cabe sem cortar.
const LTH = cn(TH, "px-3");
const LTD = cn(TD, "px-3");
const WIDE = "hidden 2xl:table-cell";
const WIDER = "hidden xl:table-cell";

function Lines({
  title,
  hint,
  lines,
  totals,
  empty,
}: {
  title: string;
  hint: string;
  lines: ReportLine[];
  totals?: { launched: string; paid: string; pending: string };
  empty: string;
}) {
  return (
    <section className={cn(CARD, "mb-6 overflow-hidden")}>
      <header className="px-5 pb-2 pt-4">
        <h2 className="text-base font-semibold text-brand-cinza-escuro">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </header>
      {lines.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={LTH}>Vencimento</TableHead>
              <TableHead className={LTH}>Fornecedor e descrição</TableHead>
              <TableHead className={cn(LTH, WIDE)}>Categoria</TableHead>
              <TableHead className={LTH}>Situação</TableHead>
              <TableHead className={cn(LTH, NUM)}>Valor do projeto</TableHead>
              <TableHead className={cn(LTH, NUM, WIDER)}>Pago</TableHead>
              <TableHead className={cn(LTH, NUM)}>Pendente</TableHead>
              <TableHead className={cn(LTH, WIDE)}>Documentos</TableHead>
              <TableHead className={LTH} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className={LTD}>{formatDate(line.dueDate)}</TableCell>
                <TableCell className={cn(LTD, "whitespace-normal")}>
                  <span className="font-semibold text-brand-cinza-escuro">{line.payee}</span>
                  <span className="block text-xs text-muted-foreground">{line.description}</span>
                </TableCell>
                <TableCell className={cn(LTD, "whitespace-normal", WIDE)}>{line.categoryName}</TableCell>
                <TableCell className={LTD}>
                  <SituationTag situation={line.situation} />
                </TableCell>
                <TableCell className={cn(LTD, NUM)}>{brl(line.amount)}</TableCell>
                <TableCell className={cn(LTD, NUM, WIDER)}>{brl(line.paid)}</TableCell>
                <TableCell className={cn(LTD, NUM)}>{brl(line.pending)}</TableCell>
                <TableCell className={cn(LTD, WIDE)}>
                  {line.documentCount ? plural(line.documentCount, "documento", "documentos") : "—"}
                </TableCell>
                <TableCell className={cn(LTD, "text-right")}>
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      href={`/contas-a-pagar?modo=tudo&conta=${line.id}`}
                      aria-label={`Abrir a conta ${line.description} em Contas a pagar`}
                    >
                      Abrir <ArrowUpRight size={14} />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {totals && (
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell className={LTD} colSpan={2}>
                  Total
                </TableCell>
                <TableCell className={cn(LTD, WIDE)} />
                <TableCell className={LTD} />
                <TableCell className={cn(LTD, NUM)}>{brl(totals.launched)}</TableCell>
                <TableCell className={cn(LTD, NUM, WIDER)}>{brl(totals.paid)}</TableCell>
                <TableCell className={cn(LTD, NUM)}>{brl(totals.pending)}</TableCell>
                <TableCell className={cn(LTD, WIDE)} />
                <TableCell className={LTD} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function Documents({ documents }: { documents: ReportDocument[] }) {
  const [busy, setBusy] = useState<number | null>(null);

  async function download(document: ReportDocument) {
    setBusy(document.id);
    try {
      saveBlob(await downloadDocument(document.payableId, document.id), document.name);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível baixar o documento.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={cn(CARD, "mb-6 overflow-hidden")}>
      <header className="px-5 pb-2 pt-4">
        <h2 className="text-base font-semibold text-brand-cinza-escuro">Documentos dos lançamentos</h2>
        <p className="text-xs text-muted-foreground">
          Planilhas, comprovantes e notas anexados às contas deste projeto. Cada download fica no histórico da conta.
        </p>
      </header>
      {documents.length ? (
        <ul className="flex flex-col gap-2 px-5 pb-5 pt-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-cinza-escuro">
                    <span className="break-all">{document.name}</span>
                    <Tag color="azul">{kindLabel(document.kind)}</Tag>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fileSize(document.size)} · {document.uploadedBy} ·{" "}
                    {new Date(document.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · da conta{" "}
                    <Link
                      className="font-medium text-brand-azul-deep hover:underline"
                      href={`/contas-a-pagar?modo=tudo&conta=${document.payableId}`}
                    >
                      {document.payableDescription}
                    </Link>
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Baixar ${document.name}`}
                disabled={busy === document.id}
                onClick={() => void download(document)}
              >
                {busy === document.id ? <Spinner aria-label="Baixando" className="size-4" /> : <Download size={14} />}
                Baixar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">
          Nenhum documento anexado aos lançamentos deste projeto.
        </p>
      )}
    </section>
  );
}
