"use client";

import {
  Ban,
  Replace,
  CalendarClock,
  CircleCheck,
  CircleDot,
  Clock,
  Link2,
  PiggyBank,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Situation } from "@/lib/payables";
import { cn } from "@/lib/utils";

const COLORS = {
  verde: "bg-brand-verde/15 text-[#047857]",
  ambar: "bg-[#fef3c7] text-[#b45309]",
  vermelho: "bg-[#fee2e2] text-[#b91c1c]",
  azul: "bg-brand-azul-deep/15 text-brand-azul-deep",
  cinza: "bg-brand-cinza-claro text-brand-cinza-escuro",
  roxo: "bg-brand-roxo/10 text-brand-roxo",
};

export function Tag({
  color,
  icon: Icon,
  children,
}: {
  color: keyof typeof COLORS;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn("gap-1 rounded-full border-0 px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-current/15", COLORS[color])}>
      {Icon && <Icon size={13} />}
      {children}
    </Badge>
  );
}

const SITUATIONS: Record<Situation, [string, keyof typeof COLORS, LucideIcon]> = {
  pago: ["Paga", "verde", CircleCheck],
  parcial: ["Parcial", "azul", CircleDot],
  vencido: ["Vencida", "vermelho", TriangleAlert],
  hoje: ["Vence hoje", "ambar", CalendarClock],
  a_vencer: ["A vencer", "cinza", Clock],
  devolvido: ["Devolvida", "vermelho", Undo2],
  cancelado: ["Cancelada", "cinza", Ban],
  substituido: ["Substituída", "cinza", Replace],
};

export function SituationTag({ situation }: { situation: Situation }) {
  const [label, color, icon] = SITUATIONS[situation];
  return (
    <Tag color={color} icon={icon}>
      {label}
    </Tag>
  );
}

export function OriginTag({ origin }: { origin: string }) {
  if (origin === "connect") {
    return (
      <Tag color="azul" icon={Link2}>
        Do Connect
      </Tag>
    );
  }
  if (origin === "incentivo") return <Tag color="roxo">Incentivos</Tag>;
  if (origin === "folha") return <Tag color="cinza">Folha</Tag>;
  return null;
}

export function ProvisionTag() {
  return (
    <Tag color="roxo" icon={PiggyBank}>
      Provisão
    </Tag>
  );
}

export function PageHeader({
  overline,
  title,
  icon: Icon,
  subtitle,
  actions,
}: {
  overline?: string;
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {overline && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[.05em] text-brand-azul-deep">{overline}</div>
        )}
        <h1 className="mb-1 flex items-center gap-2.5 text-xl font-semibold text-brand-cinza-escuro">
          <span className="grid size-9 place-items-center rounded-xl bg-[linear-gradient(135deg,#4063ee,#009cef)] text-white shadow-[0_6px_14px_-6px_rgb(64_99_238/.7)]">
            <Icon size={18} />
          </span>
          {title}
        </h1>
        {subtitle && <p className="max-w-[720px] text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <span>{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

// Classes que se repetem nas tabelas: mesmo visual do protótipo validado com o financeiro.
export const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/.04),0_12px_28px_-20px_rgb(64_99_238/.28)]";
export const TH = "px-4 py-3 text-xs font-medium text-muted-foreground";
export const TD = "px-4 py-3.5 text-[13px]";
export const NUM = "text-right tabular-nums";

export function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="mb-2">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
