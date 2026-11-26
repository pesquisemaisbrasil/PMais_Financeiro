import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Peças do Início e de Notas e RPA, como no protótipo: o número do alto e o título de cada cartão. */

export const ICON_COLORS = {
  azul: "bg-brand-azul-deep/10 text-brand-azul-deep",
  verde: "bg-brand-verde/15 text-[#047857]",
  ambar: "bg-[#fef3c7] text-[#b45309]",
  vermelho: "bg-[#fee2e2] text-[#b91c1c]",
  roxo: "bg-brand-roxo/10 text-brand-roxo",
};

export function Kpi({
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
    <div role="group" aria-label={label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
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

export function CardTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-bold text-brand-cinza-escuro">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
