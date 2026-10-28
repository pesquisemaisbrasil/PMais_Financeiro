import { ArrowRight, Check, CircleDot, Clock3, LockKeyhole } from "lucide-react";
import { Link } from "wouter";
import type { ProductModule } from "@shared/catalog";
import { groupLabels, readinessLabels } from "@shared/catalog";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}

export function ReadinessBadge({ readiness }: { readiness: ProductModule["readiness"] }) {
  return (
    <span className={`readiness-badge readiness-${readiness}`}>
      <Clock3 size={13} aria-hidden="true" />
      {readinessLabels[readiness]}
    </span>
  );
}

export function ModuleCard({ module }: { module: ProductModule }) {
  return (
    <article className="module-card">
      <div className="module-card-topline">
        <span className="module-number">{module.number}</span>
        <span className="module-group">{groupLabels[module.group]}</span>
      </div>
      <div className="module-card-icon" aria-hidden="true">
        <CircleDot size={17} />
      </div>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <div className="module-card-footer">
        <ReadinessBadge readiness={module.readiness} />
        <Link className="text-link" href={`/modulos/${module.id}`}>
          Ver guia <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function SafeguardList({ items }: { items: string[] }) {
  return (
    <ul className="safeguard-list">
      {items.map(item => (
        <li key={item}>
          <Check size={16} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="read-only-notice" role="note">
      <LockKeyhole size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
