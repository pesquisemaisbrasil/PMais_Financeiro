import type { ReactNode } from "react";

/** Rótulo e valor ao lado, tudo alinhado à esquerda, em blocos separados por um espaço. */
export function DetailGroup({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
      {children}
    </dl>
  );
}

export function DetailRow({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <>
      <dt className="text-left text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words font-semibold tabular-nums">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </>
  );
}
