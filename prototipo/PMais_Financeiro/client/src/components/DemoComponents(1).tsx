import { AlertTriangle, HardDrive, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ProductComponents";
import { useDemoStore } from "@/contexts/DemoStore";

export function DemoPageShell({
  module,
  title,
  description,
  actions,
  children,
}: {
  module: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { persistenceError } = useDemoStore();
  return (
    <div className="page-stack demo-page">
      <div className="demo-warning" role="note" aria-label="Aviso de demonstração">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL</strong>
          <span>Estado salvo apenas neste navegador. Não insira informações pessoais ou financeiras reais.</span>
        </div>
        <span className="demo-local-chip"><HardDrive size={14} aria-hidden="true" /> Local</span>
      </div>
      <PageHeader eyebrow={`Demonstração / ${module}`} title={title} description={description} action={actions} />
      {persistenceError ? <div className="demo-storage-warning" role="status">{persistenceError}</div> : null}
      {children}
    </div>
  );
}

export function DemoPanel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`demo-card ${className}`.trim()}>
      <div className="demo-card-heading">
        <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        {actions ? <div className="demo-card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DemoMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "purple" | "cyan" | "amber";
}) {
  return (
    <article className={`demo-metric demo-metric-${tone}`}>
      {Icon ? <span className="demo-metric-icon"><Icon size={18} aria-hidden="true" /></span> : null}
      <div><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>
    </article>
  );
}

export function DemoStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "danger" | "info" }) {
  return <span className={`demo-status demo-status-${tone}`}>{children}</span>;
}

export function DemoEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="demo-empty"><strong>{title}</strong>{children ? <span>{children}</span> : null}</div>;
}
