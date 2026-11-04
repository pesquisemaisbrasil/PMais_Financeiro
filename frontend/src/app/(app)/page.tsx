"use client";

import {
  CalendarClock,
  CalendarDays,
  FileCheck,
  HandCoins,
  House,
  Landmark,
  Link2,
  PiggyBank,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CARD, ErrorBox, NUM, PageHeader, ProvisionTag, SituationTag, TD, TH, Tag } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getHome } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { brl, formatDate, greeting, plural, weekday, type AttentionItem, type HomeSummary } from "@/lib/payables";
import { cn } from "@/lib/utils";

const ICON_COLORS = {
  azul: "bg-brand-azul-deep/10 text-brand-azul-deep",
  verde: "bg-brand-verde/15 text-[#047857]",
  ambar: "bg-[#fef3c7] text-[#b45309]",
  vermelho: "bg-[#fee2e2] text-[#b91c1c]",
  roxo: "bg-brand-roxo/10 text-brand-roxo",
};

const ATTENTION_ICONS: Record<AttentionItem["kind"], [LucideIcon, keyof typeof ICON_COLORS]> = {
  vencidas: [TriangleAlert, "vermelho"],
  hoje: [CalendarClock, "ambar"],
  devolvida: [Undo2, "vermelho"],
  connect: [Link2, "azul"],
  provisoes: [PiggyBank, "ambar"],
};

function Kpi({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  color: keyof typeof ICON_COLORS;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <span className={cn("grid size-9 flex-shrink-0 place-items-center rounded-[10px]", ICON_COLORS[color])}>
        <Icon size={16} />
      </span>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <h2 className="text-sm font-bold text-brand-cinza-escuro">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Content({ home }: { home: HomeSummary }) {
  const { user } = useAuth();
  const largest = Math.max(1, ...home.cashflow.map((week) => Number(week.outflow)));

  return (
    <>
      <PageHeader
        overline={`${weekday(home.today)}, ${formatDate(home.today)}`}
        title={`${greeting(new Date())}, ${user?.name.split(" ")[0]}`}
        icon={House}
        subtitle="O que precisa da sua atenção hoje e como fica o caixa nas próximas semanas."
      />

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Kpi
          label="Contas vencidas"
          value={brl(home.overdue.value)}
          detail={plural(home.overdue.count, "conta", "contas")}
          icon={TriangleAlert}
          color={home.overdue.count ? "vermelho" : "verde"}
        />
        <Kpi
          label="A pagar em 7 dias"
          value={brl(home.nextSevenDays.value)}
          detail={plural(home.nextSevenDays.count, "conta", "contas")}
          icon={CalendarDays}
          color="ambar"
        />
        <Kpi label="A receber em aberto" value="—" detail="Chega com Contas a receber" icon={HandCoins} color="verde" />
        <Kpi label="Saldo nos bancos" value="—" detail="Chega com a Conferência do banco" icon={Landmark} color="azul" />
      </div>

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
        <div className={CARD}>
          <CardTitle title="Precisa da sua atenção" subtitle={plural(home.attention.length, "item", "itens")} />
          {home.attention.length ? (
            <ul>
              {home.attention.map((item) => {
                const [Icon, color] = ATTENTION_ICONS[item.kind];
                return (
                  <li key={item.link + item.title} className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
                    <span className={cn("grid size-8 flex-shrink-0 place-items-center rounded-[10px]", ICON_COLORS[color])}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[13px]">{item.title}</strong>
                      <span className="text-xs text-muted-foreground">{item.text}</span>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={item.link}>{item.action}</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Tudo em dia. Nada pendente agora.</p>
          )}
        </div>

        <div className={CARD}>
          <CardTitle
            title="Fluxo de caixa previsto"
            subtitle="O que vence em cada semana, com as provisões. Entradas e saldo chegam com Contas a receber e a Conferência do banco."
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Semana</TableHead>
                <TableHead className={cn(TH, NUM)}>Entradas</TableHead>
                <TableHead className={cn(TH, NUM)}>Saídas</TableHead>
                <TableHead className={cn(TH, NUM)}>Saldo previsto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {home.cashflow.map((week) => (
                <TableRow key={week.label}>
                  <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{week.label}</TableCell>
                  <TableCell className={cn(TD, NUM, "text-muted-foreground")}>—</TableCell>
                  <TableCell className={cn(TD, NUM)}>
                    {Number(week.outflow) > 0 && (
                      <span
                        className="mr-1.5 inline-block h-2 rounded-full bg-amber-500 align-middle"
                        style={{ width: `${(Number(week.outflow) / largest) * 60}px` }}
                      />
                    )}
                    {Number(week.outflow) > 0 ? brl(week.outflow) : "—"}
                    {Number(week.provision) > 0 && (
                      <span className="block text-xs text-muted-foreground">{brl(week.provision)} de provisão</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(TD, NUM, "text-muted-foreground")}>—</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className={CARD}>
        <CardTitle title="Próximos vencimentos" subtitle="Contas a pagar e provisões em aberto, da mais antiga para a mais nova" />
        {home.upcoming.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Vencimento</TableHead>
                <TableHead className={TH}>Tipo</TableHead>
                <TableHead className={TH}>Quem</TableHead>
                <TableHead className={TH}>Descrição</TableHead>
                <TableHead className={TH}>Situação</TableHead>
                <TableHead className={cn(TH, NUM)}>Em aberto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {home.upcoming.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className={TD}>{formatDate(entry.dueDate)}</TableCell>
                  <TableCell className={TD}>
                    {entry.type === "provisao" ? <ProvisionTag /> : <Tag color="ambar">Pagar</Tag>}
                  </TableCell>
                  <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{entry.payee}</TableCell>
                  <TableCell className={TD}>
                    <Link className="hover:underline" href={`/contas-a-pagar?conta=${entry.id}`}>
                      {entry.description}
                    </Link>
                  </TableCell>
                  <TableCell className={TD}>
                    <SituationTag situation={entry.situation} />
                  </TableCell>
                  <TableCell className={cn(TD, NUM, "font-bold")}>{brl(entry.pending)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <FileCheck size={16} />
            Nenhuma conta em aberto.
          </p>
        )}
      </div>
    </>
  );
}

export default function HomePage() {
  const [home, setHome] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHome(await getHome());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o resumo");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial da tela
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : home ? (
        <Content home={home} />
      ) : (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}
    </main>
  );
}
