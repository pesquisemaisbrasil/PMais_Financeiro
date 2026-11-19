"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DateInput, MonthInput } from "@/components/DateInput";
import { FormError, SituationTag } from "@/components/finance";
import { MoneyInput } from "@/components/MoneyInput";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { editBatch } from "@/lib/api";
import { batchRows, checkedTotal, draftFromRow, rowLocks, type BatchDraft } from "@/lib/batch-edit";
import { brl, plural, type PayableRow, type Reference } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

const HEAD = "px-2 text-xs";
const CELL = "px-2 py-2 align-top";

/**
 * Edição em lote, conta por conta (Bruno, 18/11/2026, como na tela "Edição em Lote" do sistema antigo):
 * uma linha por conta, com fornecedor, descrição e observação, valor, vencimento, pagar em e
 * competência. Só as linhas marcadas são salvas; mexer numa linha já a marca. Cada linha passa pela
 * edição da conta no servidor, e uma recusada não grava nenhuma.
 */
export function BatchEditForm({
  rows,
  reference,
  onCancel,
  onDone,
}: {
  rows: PayableRow[];
  reference: Reference;
  onCancel: () => void;
  onDone: (count: number) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, BatchDraft>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, draftFromRow(row)]))
  );
  const editable = rows.filter((row) => !rowLocks(row).row);
  const checkedCount = editable.filter((row) => drafts[row.id].checked).length;
  const suppliers = reference.suppliers.map((s) => ({ id: s.id, label: `${s.nickname} · ${s.name}` }));

  // mexeu na linha: ela fica marcada para salvar (dá para desmarcar na caixa da esquerda)
  function change(id: number, patch: Partial<BatchDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], checked: true, ...patch } }));
  }

  function markAll(checked: boolean) {
    setDrafts((current) => {
      const next = { ...current };
      for (const row of editable) next[row.id] = { ...next[row.id], checked };
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const built = batchRows(rows, drafts);
    if (built.error) return setLocalError(built.error);
    setLocalError(null);
    await run(async () => onDone((await editBatch(built.rows)).count));
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-3 pt-3">
      <p className="text-xs text-muted-foreground">
        Marque a caixa da esquerda em cada conta que vai salvar; mexer numa linha já a marca. As linhas não marcadas
        ficam como estão. Em conta paga, o valor fica bloqueado.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-9 px-2">
              <Checkbox
                aria-label="Marcar todas"
                checked={editable.length > 0 && checkedCount === editable.length}
                disabled={!editable.length}
                onCheckedChange={(checked) => markAll(checked === true)}
              />
            </TableHead>
            <TableHead className={cn(HEAD, "min-w-48")}>Fornecedor</TableHead>
            <TableHead className={cn(HEAD, "min-w-52")}>Descrição e observação</TableHead>
            <TableHead className={cn(HEAD, "min-w-28")}>Valor principal (R$)</TableHead>
            <TableHead className={cn(HEAD, "min-w-40")}>Vencimento</TableHead>
            <TableHead className={cn(HEAD, "min-w-40")}>Pagar em</TableHead>
            <TableHead className={cn(HEAD, "min-w-24")}>Competência</TableHead>
            <TableHead className={HEAD}>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const draft = drafts[row.id];
            const locks = rowLocks(row);
            const name = row.description;
            return (
              <TableRow key={row.id} className={cn(draft.checked && "bg-brand-azul-deep/5")}>
                <TableCell className={cn(CELL, "pt-4")}>
                  <Checkbox
                    aria-label={`Salvar ${name}`}
                    checked={draft.checked}
                    disabled={Boolean(locks.row)}
                    onCheckedChange={(checked) => change(row.id, { checked: checked === true })}
                  />
                </TableCell>
                {locks.row ? (
                  <TableCell colSpan={6} className={cn(CELL, "pt-4 text-sm text-muted-foreground")}>
                    {row.payee} · {name}: {locks.row}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className={CELL}>
                      {locks.supplier ? (
                        <span className="block pt-2 text-sm">
                          {row.payee}
                          <span className="block text-xs text-muted-foreground">{locks.supplier}</span>
                        </span>
                      ) : (
                        <Choice
                          className="w-48"
                          ariaLabel={`Fornecedor de ${name}`}
                          searchable
                          value={draft.supplierId}
                          onChange={(value) => change(row.id, { supplierId: value })}
                          options={suppliers}
                        />
                      )}
                    </TableCell>
                    <TableCell className={CELL}>
                      {/* um embaixo do outro: a célula da tabela não quebra linha sozinha */}
                      <div className="flex flex-col gap-1.5">
                        <Input
                          aria-label={`Descrição de ${name}`}
                          maxLength={255}
                          value={draft.description}
                          onChange={(event) => change(row.id, { description: event.target.value })}
                        />
                        <Input
                          aria-label={`Observação de ${name}`}
                          placeholder="Observação"
                          maxLength={2000}
                          value={draft.notes}
                          onChange={(event) => change(row.id, { notes: event.target.value })}
                        />
                      </div>
                    </TableCell>
                    <TableCell className={CELL}>
                      <MoneyInput
                        className="w-32"
                        aria-label={`Valor principal de ${name}`}
                        value={draft.amount}
                        disabled={Boolean(locks.amount)}
                        onChange={(event) => change(row.id, { amount: event.target.value })}
                      />
                      {locks.amount && <span className="mt-1 block text-xs text-muted-foreground">{locks.amount}</span>}
                    </TableCell>
                    <TableCell className={CELL}>
                      <DateInput
                        aria-label={`Vencimento de ${name}`}
                        value={draft.dueDate}
                        onChange={(event) => change(row.id, { dueDate: event.target.value })}
                      />
                    </TableCell>
                    <TableCell className={CELL}>
                      <DateInput
                        aria-label={`Pagar em de ${name}`}
                        value={draft.payOn}
                        onChange={(event) => change(row.id, { payOn: event.target.value })}
                      />
                    </TableCell>
                    <TableCell className={CELL}>
                      <MonthInput
                        aria-label={`Competência de ${name}`}
                        value={draft.competence}
                        onChange={(event) => change(row.id, { competence: event.target.value })}
                      />
                    </TableCell>
                  </>
                )}
                <TableCell className={cn(CELL, "pt-3.5")}>
                  <SituationTag situation={row.situation} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <FormError message={localError ?? error} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">
          Marcadas: {plural(checkedCount, "conta", "contas")} ·{" "}
          <strong className="text-brand-cinza-escuro">{brl(checkedTotal(rows, drafts))}</strong>
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !checkedCount}>
            <Save size={16} />
            {submitting ? "Salvando…" : `Salvar ${plural(checkedCount, "conta", "contas")}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
