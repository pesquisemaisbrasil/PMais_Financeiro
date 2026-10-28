import { confirmDemo } from "@/lib/demoConfirm";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  FileText,
  LayoutDashboard,
  Network,
  RotateCcw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { modules } from "@shared/catalog";
import {
  DemoEmpty,
  DemoMetric,
  DemoPageShell,
  DemoPanel,
  DemoStatus,
} from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import {
  formatBrl,
  pendingCents,
  sumCents,
  todayInSaoPaulo,
} from "@/lib/demoModel";

const panelClassName =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm [&_.demo-card-heading]:mb-5 [&_.demo-card-heading]:flex [&_.demo-card-heading]:flex-wrap [&_.demo-card-heading]:items-start [&_.demo-card-heading]:justify-between [&_.demo-card-heading]:gap-3 [&_.demo-card-heading_h2]:text-base [&_.demo-card-heading_p]:mt-1 [&_.demo-card-heading_p]:text-sm [&_.demo-card-heading_p]:text-slate-500 [&_.demo-card-actions]:flex [&_.demo-card-actions]:items-center [&_.demo-card-actions]:gap-2";

const metricGridClassName =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6 [&_.demo-metric]:flex [&_.demo-metric]:min-h-[140px] [&_.demo-metric]:items-start [&_.demo-metric]:gap-3 [&_.demo-metric]:rounded-xl [&_.demo-metric]:border [&_.demo-metric]:border-slate-200 [&_.demo-metric]:bg-white [&_.demo-metric]:p-4 [&_.demo-metric]:shadow-sm [&_.demo-metric-icon]:inline-flex [&_.demo-metric-icon]:h-9 [&_.demo-metric-icon]:w-9 [&_.demo-metric-icon]:shrink-0 [&_.demo-metric-icon]:items-center [&_.demo-metric-icon]:justify-center [&_.demo-metric-icon]:rounded-lg [&_.demo-metric-icon]:bg-indigo-50 [&_.demo-metric-icon]:text-indigo-600 [&_.demo-metric>div]:flex [&_.demo-metric>div]:min-w-0 [&_.demo-metric>div]:flex-col [&_.demo-metric>div]:gap-1 [&_.demo-metric>div>span]:text-xs [&_.demo-metric>div>span]:font-semibold [&_.demo-metric>div>span]:leading-4 [&_.demo-metric>div>span]:text-slate-500 [&_.demo-metric>div>strong]:text-xl [&_.demo-metric>div>strong]:leading-7 [&_.demo-metric>div>strong]:text-slate-900 [&_.demo-metric>div>small]:text-xs [&_.demo-metric>div>small]:leading-4 [&_.demo-metric>div>small]:text-slate-500";

const emptyStateClassName =
  "rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 [&_.demo-empty]:flex [&_.demo-empty]:min-h-24 [&_.demo-empty]:flex-col [&_.demo-empty]:justify-center [&_.demo-empty]:gap-1 [&_.demo-empty_strong]:text-sm [&_.demo-empty_span]:text-xs [&_.demo-empty_span]:text-slate-500";

export default function DemoDashboard() {
  const { state, resetDemo } = useDemoStore();
  const [resetMessage, setResetMessage] = useState("");
  const today = todayInSaoPaulo();

  const indicators = useMemo(() => {
    const month = today.slice(0, 7);
    const payableTitles = state.titles.filter(
      title => title.direction === "pagar"
    );
    const receivableTitles = state.titles.filter(
      title => title.direction === "receber"
    );
    const monthSettlements = state.titles.flatMap(title =>
      title.settlements
        .filter(settlement => settlement.date.startsWith(month))
        .map(settlement => ({ ...settlement, direction: title.direction }))
    );
    const pendingFieldItems = state.fieldItems.filter(
      item => item.status === "pendente"
    );
    const unreconciledTransactions = state.bankTransactions.filter(
      transaction => !transaction.reconciled
    );

    return {
      payablePendingCents: sumCents(
        payableTitles.map(title => pendingCents(title))
      ),
      payablePendingCount: payableTitles.filter(
        title => pendingCents(title) > 0
      ).length,
      receivablePendingCents: sumCents(
        receivableTitles.map(title => pendingCents(title))
      ),
      receivablePendingCount: receivableTitles.filter(
        title => pendingCents(title) > 0
      ).length,
      monthSettledCents: sumCents(
        monthSettlements.map(settlement => settlement.amountCents)
      ),
      monthSettlementCount: monthSettlements.length,
      monthPayableSettledCents: sumCents(
        monthSettlements
          .filter(settlement => settlement.direction === "pagar")
          .map(settlement => settlement.amountCents)
      ),
      monthReceivableSettledCents: sumCents(
        monthSettlements
          .filter(settlement => settlement.direction === "receber")
          .map(settlement => settlement.amountCents)
      ),
      expectedProvisionCents: sumCents(
        state.provisions
          .filter(provision => provision.status === "prevista")
          .map(provision => provision.amountCents)
      ),
      expectedProvisionCount: state.provisions.filter(
        provision => provision.status === "prevista"
      ).length,
      pendingFieldItemCount: pendingFieldItems.length,
      pendingFieldItemCents: sumCents(
        pendingFieldItems.map(item => item.amountCents)
      ),
      unreconciledCount: unreconciledTransactions.length,
    };
  }, [state, today]);

  const handleReset = async () => {
    if (
      !(await confirmDemo(
        "Restaurar os dados sintéticos iniciais da demonstração? Alterações locais serão descartadas."
      ))
    )
      return;
    resetDemo();
    setResetMessage(
      "Demonstração restaurada com os dados sintéticos iniciais."
    );
  };

  return (
    <DemoPageShell
      module="Visão geral"
      title="Dashboard da demonstração"
      description="Uma leitura rápida do estado sintético do P+ Financeiro. Os indicadores abaixo são calculados no navegador a partir das movimentações desta demonstração — não representam dados reais."
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          <Link className="button-secondary" href="/modulos">
            Catálogo informativo <BookOpen size={16} aria-hidden="true" />
          </Link>
          <button
            className="button-secondary"
            type="button"
            onClick={handleReset}
          >
            <RotateCcw size={16} aria-hidden="true" /> Restaurar demonstração
          </button>
        </div>
      }
    >
      {resetMessage ? (
        <p
          className="-mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
          aria-live="polite"
        >
          {resetMessage}
        </p>
      ) : null}

      <section aria-labelledby="demo-indicators-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Leitura do estado demo</p>
            <h2
              className="text-lg font-semibold text-slate-900"
              id="demo-indicators-title"
            >
              Indicadores financeiros sintéticos
            </h2>
          </div>
          <DemoStatus tone="info">
            Competência local: {today.slice(0, 7)}
          </DemoStatus>
        </div>
        <div className={metricGridClassName}>
          <DemoMetric
            label="Saldo de pagar pendente"
            value={formatBrl(indicators.payablePendingCents)}
            detail={`${indicators.payablePendingCount} título(s) com saldo`}
            icon={FileText}
            tone="blue"
          />
          <DemoMetric
            label="Saldo de receber pendente"
            value={formatBrl(indicators.receivablePendingCents)}
            detail={`${indicators.receivablePendingCount} título(s) com saldo`}
            icon={LayoutDashboard}
            tone="green"
          />
          <DemoMetric
            label="Realizado no mês"
            value={formatBrl(indicators.monthSettledCents)}
            detail={`${indicators.monthSettlementCount} settlement(s) • São Paulo`}
            icon={BarChart3}
            tone="purple"
          />
          <DemoMetric
            label="Provisões previstas"
            value={formatBrl(indicators.expectedProvisionCents)}
            detail={`${indicators.expectedProvisionCount} previsão(ões) ativas`}
            icon={Network}
            tone="cyan"
          />
          <DemoMetric
            label="Itens de campo pendentes"
            value={String(indicators.pendingFieldItemCount)}
            detail={
              formatBrl(indicators.pendingFieldItemCents) + " aguardando lote"
            }
            icon={ShieldCheck}
            tone="amber"
          />
          <DemoMetric
            label="Extrato não conciliado"
            value={String(indicators.unreconciledCount)}
            detail="linha(s) simulada(s) para revisar"
            icon={Settings2}
            tone="blue"
          />
        </div>
      </section>

      <DemoPanel
        className={panelClassName}
        title="Sinalizações da demonstração"
        subtitle="Atalhos para o próximo passo, sem automatizar nenhuma baixa ou confirmação."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Conciliação
              </h3>
              <DemoStatus
                tone={indicators.unreconciledCount ? "warning" : "positive"}
              >
                {indicators.unreconciledCount
                  ? `${indicators.unreconciledCount} aberta(s)`
                  : "Em dia"}
              </DemoStatus>
            </div>
            {indicators.unreconciledCount ? (
              <p className="text-sm leading-6 text-slate-600">
                Revise as linhas do extrato sintético antes de fechar o período.
              </p>
            ) : (
              <div className={emptyStateClassName}>
                <DemoEmpty title="Nenhuma linha pendente">
                  O extrato demo está conciliado.
                </DemoEmpty>
              </div>
            )}
            <Link className="text-link mt-3" href="/demo/conciliacao">
              Abrir conciliação <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Contas</h3>
              <DemoStatus
                tone={
                  indicators.payablePendingCount +
                  indicators.receivablePendingCount
                    ? "info"
                    : "positive"
                }
              >
                {indicators.payablePendingCount +
                indicators.receivablePendingCount
                  ? "Acompanhar"
                  : "Em dia"}
              </DemoStatus>
            </div>
            {indicators.payablePendingCount +
            indicators.receivablePendingCount ? (
              <p className="text-sm leading-6 text-slate-600">
                Há títulos demo aguardando liquidação ou acompanhamento de
                vencimento.
              </p>
            ) : (
              <div className={emptyStateClassName}>
                <DemoEmpty title="Nenhum título pendente">
                  Contas a pagar e a receber sem saldo aberto.
                </DemoEmpty>
              </div>
            )}
            <Link className="text-link mt-3" href="/demo/contas">
              Abrir contas <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Campo e folha
              </h3>
              <DemoStatus
                tone={indicators.pendingFieldItemCount ? "warning" : "positive"}
              >
                {indicators.pendingFieldItemCount
                  ? `${indicators.pendingFieldItemCount} item(ns)`
                  : "Sem pendências"}
              </DemoStatus>
            </div>
            {indicators.pendingFieldItemCount ? (
              <p className="text-sm leading-6 text-slate-600">
                Itens de campo podem formar um lote demo para revisão e
                aprovação humana.
              </p>
            ) : (
              <div className={emptyStateClassName}>
                <DemoEmpty title="Campo organizado">
                  Não há itens demo aguardando lote.
                </DemoEmpty>
              </div>
            )}
            <Link className="text-link mt-3" href="/demo/folha">
              Abrir folha de campo <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </DemoPanel>

      <DemoPanel
        className={panelClassName}
        title="Sete módulos no fluxo demo"
        subtitle="Escolha uma frente para explorar o mockup. O catálogo explica a intenção do produto; estes atalhos mostram o estado local da demonstração."
        actions={
          <Link className="text-link" href="/modulos">
            Conhecer o catálogo <ArrowRight size={15} aria-hidden="true" />
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(module => (
            <Link
              className="group flex min-h-40 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-sm"
              href={`/demo/${module.id}`}
              key={module.id}
              aria-label={`Abrir demonstração: ${module.title}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold tracking-[0.16em] text-indigo-600">
                  {module.number}
                </span>
                <Network
                  size={17}
                  aria-hidden="true"
                  className="text-slate-400 transition group-hover:text-indigo-600"
                />
              </div>
              <strong className="mt-4 text-sm leading-5 text-slate-900">
                {module.shortTitle}
              </strong>
              <span className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                {module.description}
              </span>
              <span className="mt-auto flex items-center gap-1 pt-4 text-xs font-semibold text-indigo-600">
                Abrir módulo <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </DemoPanel>

      <DemoPanel
        className={panelClassName}
        title="Fluxo entre módulos"
        subtitle="Os eventos permanecem locais e demonstrativos, mas preservam a sequência esperada do produto."
      >
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Link
            className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 transition hover:border-indigo-200"
            href="/demo/contas"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">
              01 • Contas
            </span>
            <strong className="mt-2 block text-sm text-slate-900">
              Títulos e liquidações
            </strong>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Registra o saldo pendente e a data de cada settlement.
            </span>
          </Link>
          <div
            className="hidden items-center justify-center text-indigo-400 md:flex"
            aria-hidden="true"
          >
            <ArrowRight size={20} />
          </div>
          <Link
            className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 transition hover:border-cyan-200"
            href="/demo/conciliacao"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-700">
              02 • Conciliação
            </span>
            <strong className="mt-2 block text-sm text-slate-900">
              Extrato linha a linha
            </strong>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Recebe as transações sintéticas para classificação e fechamento.
            </span>
          </Link>
          <div
            className="hidden items-center justify-center text-indigo-400 md:flex"
            aria-hidden="true"
          >
            <ArrowRight size={20} />
          </div>
          <Link
            className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 transition hover:border-emerald-200"
            href="/demo/relatorios"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
              03 • Relatórios
            </span>
            <strong className="mt-2 block text-sm text-slate-900">
              Leitura do realizado
            </strong>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Consulta os totais derivados dos registros demonstrativos.
            </span>
          </Link>
        </div>
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
          Liquidações de demonstração alimentam conciliação e relatórios.
        </p>
      </DemoPanel>

      <DemoPanel
        className={panelClassName}
        title="Estado técnico"
        subtitle="Separado dos indicadores operacionais para deixar claro o que é mockup e o que ainda depende de implantação."
      >
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600"
              aria-hidden="true"
            >
              <Settings2 size={17} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-slate-900">
                  Estado local da demonstração
                </strong>
                <DemoStatus tone="info">Sem endpoint de métricas</DemoStatus>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                O estado é salvo apenas neste navegador. Integrações,
                autenticação, persistência de produção e operações financeiras
                reais não estão ativas.
              </p>
            </div>
          </div>
          <Link className="button-secondary shrink-0" href="/implantacao">
            Ver implantação <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </DemoPanel>
    </DemoPageShell>
  );
}
