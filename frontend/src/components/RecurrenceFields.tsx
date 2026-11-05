"use client";

import { useState } from "react";
import { Field } from "@/components/finance";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, simulateRecurrence } from "@/lib/api";
import { RECURRENCE_KINDS, brl, formatDate, type Occurrence, type RecurrenceKind } from "@/lib/payables";

export interface RecurrenceState {
  repeat: boolean;
  kind: RecurrenceKind;
  count: string;
  estimated: boolean;
  /** O que o servidor simulou. Serve para saber o que a pessoa mudou na tabela. */
  simulated: Occurrence[] | null;
  /** A tabela como está agora, com as mudanças. */
  rows: Occurrence[] | null;
}

export const NO_RECURRENCE: RecurrenceState = {
  repeat: false,
  kind: "mensal",
  count: "12",
  estimated: false,
  simulated: null,
  rows: null,
};

/** "Repetir esta conta": tipo, quantidade e a tabela de ocorrências, que dá para ajustar antes de salvar. */
export function RecurrenceFields({
  value,
  onChange,
  dueDate,
  amount,
  disabled,
  onError,
  noun = "conta",
}: {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  dueDate: string;
  amount: string | null;
  disabled: boolean;
  onError: (message: string | null) => void;
  /** "conta" no Contas a pagar; "título" no Contas a receber */
  noun?: string;
}) {
  const [simulating, setSimulating] = useState(false);
  const set = (patch: Partial<RecurrenceState>) =>
    // mexer em tipo, quantidade ou valor invalida a tabela que já tinha sido simulada
    onChange({ ...value, simulated: null, rows: null, ...patch });

  async function simulate() {
    const count = Number(value.count);
    if (!dueDate || !amount || !Number.isInteger(count) || count < 2 || count > 60) {
      return onError("Informe o vencimento, o valor e uma quantidade de 2 a 60.");
    }
    onError(null);
    setSimulating(true);
    try {
      const rows = await simulateRecurrence({ kind: value.kind, startDate: dueDate, count, amount });
      onChange({ ...value, simulated: rows, rows });
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Não foi possível simular.");
    } finally {
      setSimulating(false);
    }
  }

  function edit(index: number, patch: Partial<Occurrence>) {
    onChange({ ...value, rows: (value.rows ?? []).map((row) => (row.index === index ? { ...row, ...patch } : row)) });
  }

  return (
    <div className="rounded-xl border border-border px-3.5 py-3">
      <div className="flex items-center gap-2 text-xs">
        <Checkbox
          id="p-repetir"
          checked={value.repeat}
          onCheckedChange={(checked) => set({ repeat: checked === true })}
        />
        <Label htmlFor="p-repetir" className="text-[13px] font-semibold">
          Repetir esta conta
        </Label>
        <span className="text-muted-foreground">aluguel, telefonia, software, parcelas…</span>
      </div>
      {value.repeat && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Como se repete" id="p-rec-tipo">
              <Choice
                id="p-rec-tipo"
                value={value.kind}
                onChange={(kind) => set({ kind: kind as RecurrenceKind })}
                options={RECURRENCE_KINDS}
              />
            </Field>
            <Field label="Quantas vezes" id="p-rec-qtd" hint="Com a primeira. De 2 a 60.">
              <Input
                id="p-rec-qtd"
                inputMode="numeric"
                value={value.count}
                onChange={(event) => set({ count: event.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" disabled={disabled || simulating} onClick={simulate}>
                Simular
              </Button>
            </div>
          </div>
          {value.kind !== "parcelado" && (
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                id="p-rec-est"
                checked={value.estimated}
                onCheckedChange={(checked) => onChange({ ...value, estimated: checked === true })}
              />
              <Label htmlFor="p-rec-est" className="text-xs font-normal">
                Valor estimado (luz, por exemplo): troque cada mês pelo valor real da fatura
              </Label>
            </div>
          )}
          {value.rows && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 text-xs">Nº</TableHead>
                  <TableHead className="px-2 text-xs">Vencimento</TableHead>
                  <TableHead className="px-2 text-xs">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.rows.map((row) => (
                  <TableRow key={row.index}>
                    <TableCell className="px-2 py-1.5 text-[13px]">{row.index}</TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Input
                        type="date"
                        aria-label={`Vencimento da ocorrência ${row.index}`}
                        value={row.dueDate}
                        onChange={(event) => edit(row.index, { dueDate: event.target.value })}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Input
                        inputMode="decimal"
                        aria-label={`Valor da ocorrência ${row.index}`}
                        value={row.amount}
                        onChange={(event) => edit(row.index, { amount: event.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {value.rows && (
            <p className="text-xs text-muted-foreground">
              {value.rows.length} {noun === "conta" ? "contas" : "títulos"}, de {formatDate(value.rows[0].dueDate)} a{" "}
              {formatDate(value.rows[value.rows.length - 1].dueDate)}, no total de{" "}
              {brl(value.rows.reduce((sum, row) => sum + Number(row.amount), 0))}. Vencimento em fim de semana
              ou feriado vai para o próximo dia útil.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
