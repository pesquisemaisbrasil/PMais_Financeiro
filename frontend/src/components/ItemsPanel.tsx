"use client";

import { Info, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NUM, TD, TH, Tag } from "@/components/finance";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  brl,
  formatDate,
  inssAmount,
  itemIsPaid,
  itemPaymentLabel,
  noteLabel,
  originNotes,
  plural,
  toCents,
  type PayableDetail,
} from "@/lib/payables";
import { cn } from "@/lib/utils";

type Filter = "todos" | "abertos" | "pagos";

/**
 * Pessoas do lançamento agrupado, abertas na própria linha da lista (kickoff de 03/11, K3): o resumo
 * de quantas já foram pagas, de onde o lançamento veio, a busca por nome, as abas Todos, Em aberto e
 * Pagos e o detalhe de cada uma (chave Pix mascarada, nota, valor e situação).
 */
export function ItemsPanel({ payable }: { payable: PayableDetail }) {
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const paid = useMemo(() => new Set(payable.items.filter((item) => itemIsPaid(payable, item)).map((item) => item.id)), [payable]);
  const openTotal = useMemo(
    () => payable.items.filter((item) => !paid.has(item.id)).reduce((sum, item) => sum + toCents(item.amount), 0) / 100,
    [payable.items, paid]
  );
  const items = useMemo(() => {
    const clean = term.trim().toLowerCase();
    return payable.items.filter(
      (item) =>
        (filter === "todos" || (filter === "pagos") === paid.has(item.id)) &&
        (!clean || item.name.toLowerCase().includes(clean))
    );
  }, [payable.items, paid, term, filter]);
  // Só incentivo tem data da pesquisa e chave Pix: nas outras folhas a coluna ficaria vazia.
  const withSurvey = payable.items.some((item) => item.surveyDate);
  const withPix = payable.origin === "incentivo" || payable.items.some((item) => item.pixMasked);
  const total = payable.items.length;
  const counts: Record<Filter, number> = { todos: total, abertos: total - paid.size, pagos: paid.size };
  const notes = originNotes(payable.origin);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <strong className="text-[13px]">
            {plural(total, "pessoa", "pessoas")} · {brl(payable.amount)}
          </strong>
          <span className="text-xs text-muted-foreground">
            {paid.size} de {total} pagos · {brl(openTotal)} em aberto
          </span>
        </div>
        <div className="relative w-full max-w-[260px]">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
          <Input
            className="h-8 bg-card pl-8 text-[13px]"
            aria-label="Buscar pessoa"
            placeholder="Buscar pessoa neste lançamento…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="flex items-center gap-1.5">
              <Info size={13} aria-hidden className="shrink-0" />
              {note}
            </li>
          ))}
        </ul>
      )}
      <Tabs value={filter} onValueChange={(next) => setFilter(next as Filter)} className="mb-3">
        <TabsList>
          {(
            [
              ["todos", "Todos"],
              ["abertos", "Em aberto"],
              ["pagos", "Pagos"],
            ] as const
          ).map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label} <span className="ml-1 tabular-nums text-muted-foreground">{counts[id]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {items.length ? (
        <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Pessoa</TableHead>
                {withPix && <TableHead className={TH}>Chave Pix</TableHead>}
                {withSurvey && <TableHead className={TH}>Data da pesquisa</TableHead>}
                <TableHead className={TH}>Nota</TableHead>
                <TableHead className={cn(TH, NUM)}>Valor</TableHead>
                <TableHead className={TH}>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className={cn(TD, "font-semibold text-brand-cinza-escuro")}>{item.name}</TableCell>
                  {withPix && (
                    <TableCell className={cn(TD, "tabular-nums text-muted-foreground")}>{item.pixMasked ?? "—"}</TableCell>
                  )}
                  {withSurvey && <TableCell className={TD}>{formatDate(item.surveyDate)}</TableCell>}
                  <TableCell className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {noteLabel(item)}
                      {item.invoiceStatus === "Pendente" && <Tag color="ambar">NF pendente</Tag>}
                      {item.invoiceStatus === "Recebida" && <Tag color="verde">NF recebida</Tag>}
                    </span>
                    {item.invoiceDate && (
                      <span className="block text-xs text-muted-foreground">emitida em {formatDate(item.invoiceDate)}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(TD, NUM, "font-bold")}>
                    {brl(item.amount)}
                    {item.grossAmount && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        bruto {brl(item.grossAmount)} · INSS −{brl(inssAmount(item.grossAmount, item.amount))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn(TD, "text-muted-foreground")}>{itemPaymentLabel(payable, item)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {term.trim() ? "Ninguém com esse nome." : "Ninguém nessa situação."}
        </p>
      )}
    </div>
  );
}
