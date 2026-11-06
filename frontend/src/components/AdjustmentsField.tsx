"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/finance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADJUSTMENT_KINDS,
  NET_ZERO_MESSAGE,
  centsText,
  draftCents,
  netText,
  parseDrafts,
  sortDrafts,
  type AdjustmentDraft,
  type AdjustmentKind,
} from "@/lib/adjustments";
import { brl, toField } from "@/lib/payables";

/**
 * Os três totais (acréscimos, descontos e impostos), cada um com o botão que abre a lista de
 * lançamentos. O total fica só para leitura: quem muda é a janela do botão. Mostra o líquido.
 */
export function AdjustmentsField({
  drafts,
  onChange,
  gross,
}: {
  drafts: AdjustmentDraft[];
  onChange: (drafts: AdjustmentDraft[]) => void;
  /** O valor bruto como está digitado no formulário. */
  gross: string;
}) {
  const [editing, setEditing] = useState<AdjustmentKind | null>(null);
  const net = netText(gross, drafts);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      {ADJUSTMENT_KINDS.map((item) => {
        const count = drafts.filter((draft) => draft.kind === item.kind).length;
        return (
          <div key={item.kind} className="grid grid-cols-[minmax(0,1fr)_8rem_8.5rem] items-center gap-2 text-[13px]">
            <Label htmlFor={`adj-${item.kind}`} className="justify-end text-right font-normal text-muted-foreground">
              {item.sign} {item.total}
            </Label>
            <Input
              id={`adj-${item.kind}`}
              readOnly
              tabIndex={-1}
              className="bg-muted text-right tabular-nums"
              value={brl(centsText(draftCents(drafts, item.kind)))}
            />
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setEditing(item.kind)}>
              {item.button}
              {count > 0 && ` (${count})`}
            </Button>
          </div>
        );
      })}
      {net !== null && (
        <p className="text-right text-[13px]">
          <span className="text-muted-foreground">Valor líquido: </span>
          <strong className="tabular-nums">{brl(net)}</strong>
          {Number(net) <= 0 && <span className="block text-xs text-red-700">{NET_ZERO_MESSAGE}</span>}
        </p>
      )}
      {editing && (
        <AdjustmentsDialog
          kind={editing}
          drafts={drafts.filter((draft) => draft.kind === editing)}
          onClose={() => setEditing(null)}
          onSave={(rows) => {
            onChange(sortDrafts([...drafts.filter((draft) => draft.kind !== editing), ...rows]));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AdjustmentsDialog({
  kind,
  drafts,
  onSave,
  onClose,
}: {
  kind: AdjustmentKind;
  drafts: AdjustmentDraft[];
  onSave: (rows: AdjustmentDraft[]) => void;
  onClose: () => void;
}) {
  const meta = ADJUSTMENT_KINDS.find((item) => item.kind === kind)!;
  const [rows, setRows] = useState<AdjustmentDraft[]>(drafts.length ? drafts : [{ kind, description: "", amount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const change = (index: number, patch: Partial<AdjustmentDraft>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  function save() {
    const parsed = parseDrafts(rows);
    if (parsed.error) return setError(parsed.error);
    onSave(parsed.lines.map((line) => ({ kind, description: line.description, amount: toField(line.amount) })));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{meta.button}</DialogTitle>
          <DialogDescription>{meta.help}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-2">
              <Input
                aria-label={`Descrição da linha ${index + 1}`}
                placeholder={meta.example}
                maxLength={120}
                value={row.description}
                onChange={(event) => change(index, { description: event.target.value })}
              />
              <Input
                aria-label={`Valor da linha ${index + 1}`}
                inputMode="decimal"
                placeholder="0,00"
                className="text-right"
                value={row.amount}
                onChange={(event) => change(index, { amount: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar a linha ${index + 1}`}
                onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setRows((current) => [...current, { kind, description: "", amount: "" }])}
          >
            <Plus size={14} />
            Adicionar linha
          </Button>
          <p className="text-right text-[13px]">
            <span className="text-muted-foreground">Total: </span>
            <strong className="tabular-nums">{brl(centsText(draftCents(rows, kind)))}</strong>
          </p>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={save}>
            Salvar {meta.button.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
