"use client";

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
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADJUSTMENT_FIELDS,
  ADJUSTMENT_KINDS,
  NET_ZERO_MESSAGE,
  centsText,
  draftCents,
  draftsFromFields,
  fieldValues,
  fieldsCents,
  netText,
  percentText,
  sortDrafts,
  type AdjustmentDraft,
  type AdjustmentKind,
} from "@/lib/adjustments";
import { brl, parseMoney, type TaxRate } from "@/lib/payables";
import { cn } from "@/lib/utils";

/** Um campo do bloco: o rótulo em cima, alinhado à esquerda, e o campo (e o botão, se houver) embaixo. */
function Row({
  label,
  htmlFor,
  strong = false,
  inline = false,
  children,
}: {
  label: string;
  htmlFor: string;
  strong?: boolean;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-2 gap-y-1",
        inline && "sm:grid-cols-[150px_minmax(0,1fr)_7.5rem] sm:gap-x-3"
      )}
    >
      <Label
        htmlFor={htmlFor}
        className={cn(
          "col-span-2 text-[13px]",
          inline && "sm:col-span-1 sm:justify-end sm:text-right",
          strong ? "font-semibold" : "font-normal text-muted-foreground"
        )}
      >
        <RedStars text={label} />
      </Label>
      {children}
    </div>
  );
}

/**
 * Os valores da conta, na ordem do sistema antigo e alinhados à esquerda, sem moldura: valor principal
 * (digitado), os totais de acréscimos, descontos e impostos (só para leitura; cada botão abre a janela com
 * os campos fixos do sistema antigo) e o valor líquido, que é o principal + acréscimos − descontos − impostos.
 */
export function ValuesCard({
  grossId,
  grossLabel,
  gross,
  onGrossChange,
  drafts,
  onChange,
  inline = false,
  taxRates,
}: {
  grossId: string;
  grossLabel: string;
  /** O valor principal como está digitado. */
  gross: string;
  onGrossChange: (value: string) => void;
  drafts: AdjustmentDraft[];
  onChange: (drafts: AdjustmentDraft[]) => void;
  /** Os nomes à esquerda, alinhados com os campos `inline` do formulário. */
  inline?: boolean;
  /** Na conta nova: os percentuais dos impostos retidos, mostrados ao lado de cada imposto (19/11). */
  taxRates?: TaxRate[];
}) {
  const [editing, setEditing] = useState<AdjustmentKind | null>(null);
  const net = netText(gross, drafts);
  return (
    <div className={cn("flex w-full flex-col gap-2", inline ? "max-w-[612px]" : "max-w-[460px]")}>
      <Row label={grossLabel} htmlFor={grossId} strong inline={inline}>
        <MoneyInput
          id={grossId}
          className="col-span-2"
          placeholder="0,00"
          value={gross}
          onChange={(event) => onGrossChange(event.target.value)}
        />
      </Row>
      {ADJUSTMENT_KINDS.map((item) => {
        const count = drafts.filter((draft) => draft.kind === item.kind).length;
        return (
          <Row
            key={item.kind}
            label={`${item.sign} ${item.total}`}
            htmlFor={`${grossId}-${item.kind}`}
            inline={inline}
          >
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
      <Row label="Valor líquido" htmlFor={`${grossId}-liquido`} strong inline={inline}>
        <Input
          id={`${grossId}-liquido`}
          readOnly
          tabIndex={-1}
          className="col-span-2 bg-muted px-2 text-right font-semibold tabular-nums"
          value={net === null ? "—" : brl(net)}
        />
      </Row>
      {net !== null && Number(net) <= 0 && (
        <p className={cn("text-xs text-red-700", inline && "sm:pl-[162px]")}>{NET_ZERO_MESSAGE}</p>
      )}
      {editing && (
        <AdjustmentsDialog
          idPrefix={grossId}
          focusKind={editing}
          drafts={drafts}
          gross={gross}
          taxRates={taxRates}
          onClose={() => setEditing(null)}
          onSave={(rows) => {
            onChange(sortDrafts(rows));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** A janela do sistema antigo: Acréscimos (juros, multa, outros), Descontos e Impostos, em três colunas. */
function AdjustmentsDialog({
  idPrefix,
  focusKind,
  drafts,
  gross,
  taxRates = [],
  onSave,
  onClose,
}: {
  idPrefix: string;
  /** O grupo do botão clicado: o cursor começa no primeiro campo dele. */
  focusKind: AdjustmentKind;
  drafts: AdjustmentDraft[];
  gross: string;
  taxRates?: TaxRate[];
  onSave: (rows: AdjustmentDraft[]) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => fieldValues(drafts));
  const [error, setError] = useState<string | null>(null);
  const fieldId = (key: string) => `${idPrefix}-ajuste-${key}`;
  const first = ADJUSTMENT_FIELDS.find((field) => field.kind === focusKind);
  // "0,65%" ao lado do imposto retido, só na conta nova e com percentual acima de zero
  const percent = (key: string) => {
    const rate = taxRates.find((item) => item.code === key);
    return rate && Number(rate.rate) > 0 ? percentText(rate.rate) : null;
  };
  const waitingGross = taxRates.some((rate) => Number(rate.rate) > 0) && !parseMoney(gross);

  function save() {
    const parsed = draftsFromFields(values);
    if (parsed.error) return setError(parsed.error);
    onSave(parsed.drafts);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[760px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (first) document.getElementById(fieldId(first.key))?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Acréscimos, descontos e impostos</DialogTitle>
          <DialogDescription>Preencha só o que a conta tem. O total de cada grupo entra no valor líquido.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-2 sm:grid-cols-3">
          {ADJUSTMENT_KINDS.map((group) => (
            <section key={group.kind} aria-label={group.button} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">{group.button}</h3>
              {group.kind === "imposto" && waitingGross && (
                <p className="text-xs text-muted-foreground">
                  Informe o valor principal: PIS, COFINS, CSLL e IR são calculados sobre ele.
                </p>
              )}
              {ADJUSTMENT_FIELDS.filter((field) => field.kind === group.kind).map((field) => (
                <div key={field.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                  <Label
                    htmlFor={fieldId(field.key)}
                    className="justify-end text-right text-[13px] font-normal text-muted-foreground"
                  >
                    <span className="flex flex-col items-end leading-tight">
                      {field.label}
                      {percent(field.key) && <span className="text-[11px]">{percent(field.key)}</span>}
                    </span>
                  </Label>
                  <MoneyInput
                    id={fieldId(field.key)}
                    aria-label={field.name === field.label && !percent(field.key) ? undefined : field.name}
                    placeholder="0,00"
                    className="text-right tabular-nums"
                    value={values[field.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </div>
              ))}
              <p className="mt-auto text-right text-[13px]">
                <span className="text-muted-foreground">Total: </span>
                <strong className="tabular-nums">{brl(centsText(fieldsCents(values, group.kind)))}</strong>
              </p>
            </section>
          ))}
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button type="button" onClick={save}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
