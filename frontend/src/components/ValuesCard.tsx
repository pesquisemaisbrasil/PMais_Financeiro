"use client";

import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FormError, RedStars } from "@/components/finance";
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
import { cn } from "@/lib/utils";

/** Um campo do bloco: o rótulo em cima, alinhado à esquerda, e o campo (e o botão, se houver) embaixo. */
function Row({
  label,
  htmlFor,
  strong = false,
  children,
}: {
  label: string;
  htmlFor: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-2 gap-y-1">
      <Label
        htmlFor={htmlFor}
        className={cn("col-span-2 text-[13px]", strong ? "font-semibold" : "font-normal text-muted-foreground")}
      >
        <RedStars text={label} />
      </Label>
      {children}
    </div>
  );
}

/**
 * Os valores da conta, na ordem do sistema antigo e alinhados à esquerda, sem moldura: valor principal
 * (digitado), os totais de acréscimos, descontos e impostos (só para leitura, cada um com o botão que
 * abre a lista de lançamentos) e o valor líquido, que é o principal + acréscimos − descontos − impostos.
 */
export function ValuesCard({
  grossId,
  grossLabel,
  gross,
  onGrossChange,
  drafts,
  onChange,
}: {
  grossId: string;
  grossLabel: string;
  /** O valor principal como está digitado. */
  gross: string;
  onGrossChange: (value: string) => void;
  drafts: AdjustmentDraft[];
  onChange: (drafts: AdjustmentDraft[]) => void;
}) {
  const [editing, setEditing] = useState<AdjustmentKind | null>(null);
  const net = netText(gross, drafts);
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-2">
      <Row label={grossLabel} htmlFor={grossId} strong>
        <Input
          id={grossId}
          className="col-span-2"
          inputMode="decimal"
          placeholder="0,00"
          value={gross}
          onChange={(event) => onGrossChange(event.target.value)}
        />
      </Row>
      {ADJUSTMENT_KINDS.map((item) => {
        const count = drafts.filter((draft) => draft.kind === item.kind).length;
        return (
          <Row key={item.kind} label={`${item.sign} ${item.total}`} htmlFor={`${grossId}-${item.kind}`}>
            <Input
              id={`${grossId}-${item.kind}`}
              readOnly
              tabIndex={-1}
              className="bg-muted px-2 text-right tabular-nums"
              value={brl(centsText(draftCents(drafts, item.kind)))}
            />
            <Button type="button" variant="outline" size="sm" className="w-full px-2" onClick={() => setEditing(item.kind)}>
              {item.button}
              {count > 0 && ` (${count})`}
            </Button>
          </Row>
        );
      })}
      <Row label="Valor líquido" htmlFor={`${grossId}-liquido`} strong>
        <Input
          id={`${grossId}-liquido`}
          readOnly
          tabIndex={-1}
          className="col-span-2 bg-muted px-2 text-right font-semibold tabular-nums"
          value={net === null ? "—" : brl(net)}
        />
      </Row>
      {net !== null && Number(net) <= 0 && <p className="text-xs text-red-700">{NET_ZERO_MESSAGE}</p>}
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
