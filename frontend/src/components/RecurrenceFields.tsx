"use client";

import { useState } from "react";
import { DateInput } from "@/components/DateInput";
import { Field } from "@/components/finance";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, simulateRecurrence } from "@/lib/api";
import { BusinessDayNotice } from "@/components/BusinessDayNotice";
import { maskMoney } from "@/lib/money";
import {
  RECURRENCE_KINDS,
  brl,
  formatDate,
  occurrencesTotal,
  simulationIsCurrent,
  simulationKey,
  type Occurrence,
  type RecurrenceKind,
} from "@/lib/payables";

export interface RecurrenceState {
  repeat: boolean;
  kind: RecurrenceKind;
  count: string;
  estimated: boolean;
  /** O que o servidor simulou. Serve para saber o que a pessoa mudou na tabela. */
  simulated: Occurrence[] | null;
  /** A tabela como está agora, com as mudanças. */
  rows: Occurrence[] | null;
  /** O vencimento e o valor com que a tabela foi simulada (ver `simulationIsCurrent`). */
  simulatedFor: string | null;
}

export const NO_RECURRENCE: RecurrenceState = {
  repeat: false,
  kind: "mensal",
  count: "12",
  estimated: false,
  simulated: null,
  rows: null,
  simulatedFor: null,
};

export { simulationIsCurrent };

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
    onChange({ ...value, simulated: null, rows: null, simulatedFor: null, ...patch });

  async function simulate() {
    const count = Number(value.count);
    if (!dueDate || !amount || !Number.isInteger(count) || count < 2 || count > 60) {
      return onError("Informe o vencimento, o valor e uma quantidade de 2 a 60.");
    }
    onError(null);
    setSimulating(true);
    try {
      const simulated = await simulateRecurrence({ kind: value.kind, startDate: dueDate, count, amount });
      // A tabela mostra o valor como o campo de valor escreve ("1.000,00"), não como a API ("1000.00"):
      // "333.33" lido em português parece trinta e três mil. `simulated` fica como o servidor mandou.
      const rows = simulated.map((row) => ({ ...row, amount: maskMoney(row.amount) }));
      onChange({ ...value, simulated, rows, simulatedFor: simulationKey(dueDate, amount) });
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Não foi possível simular.");
    } finally {
      setSimulating(false);
    }
  }

  function edit(index: number, patch: Partial<Occurrence>) {
    // Trocou a data na mão: o aviso de "foi para o próximo dia útil" não vale mais para essa linha.
    const moved = patch.dueDate !== undefined ? { movedFrom: null, movedReason: null } : {};
    onChange({
      ...value,
      rows: (value.rows ?? []).map((row) => (row.index === index ? { ...row, ...patch, ...moved } : row)),
    });
  }

  // a data da linha não é mais a que o servidor simulou (a pessoa trocou, ou antecipou ou manteve)
  const changedByHand = (row: Occurrence) =>
    value.simulated?.find((simulated) => simulated.index === row.index)?.dueDate !== row.dueDate;

  // mudou o vencimento ou o valor depois de simular: a tabela velha some e pede para simular de novo
  const stale = value.rows !== null && !simulationIsCurrent(value, dueDate, amount);
  const rows = stale ? null : value.rows;

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
          {stale && (
            <p role="alert" className="text-xs font-medium text-destructive">
              O valor ou o vencimento mudou depois de simular. Clique em Simular de novo para refazer a tabela.
            </p>
          )}
          {rows && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 text-xs">Nº</TableHead>
                  <TableHead className="px-2 text-xs">Vencimento</TableHead>
                  <TableHead className="px-2 text-xs">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.index}>
                    <TableCell className="px-2 py-1.5 text-[13px]">{row.index}</TableCell>
                    <TableCell className="px-2 py-1.5">
                      <DateInput
                        aria-label={`Vencimento da ocorrência ${row.index}`}
                        value={row.dueDate}
                        onChange={(event) => edit(row.index, { dueDate: event.target.value })}
                      />
                      {/* Como no campo Vencimento: a linha que caiu em fim de semana ou feriado avisa. A que o
                          sistema já levou para o próximo dia útil diz isso e deixa antecipar ou manter; a que
                          a pessoa trocou à mão é conferida de novo. */}
                      {(row.movedFrom || changedByHand(row)) && (
                        <BusinessDayNotice
                          className="mt-1.5"
                          date={row.movedFrom ?? row.dueDate}
                          movedTo={row.movedFrom ? row.dueDate : undefined}
                          onPick={(day) => edit(row.index, { dueDate: day })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <MoneyInput
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
          {rows && (
            <p className="text-xs text-muted-foreground">
              {rows.length} {noun === "conta" ? "contas" : "títulos"}, de {formatDate(rows[0].dueDate)} a{" "}
              {formatDate(rows[rows.length - 1].dueDate)}, no total de{" "}
              {brl(occurrencesTotal(rows))}. Vencimento em fim de semana
              ou feriado vai para o próximo dia útil; em cada linha dá para antecipar ou manter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
