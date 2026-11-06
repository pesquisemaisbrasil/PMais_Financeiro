"use client";

import { ClipboardPaste, Plus, X } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/finance";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  allocationDiff,
  brl,
  parsePastedAllocations,
  type AllocationRow,
  type Project,
} from "@/lib/payables";

const BLANK: AllocationRow = { projectId: "", amount: "" };

/**
 * Divide o valor de um lançamento entre projetos, em campos: projeto e valor de cada parte, sem
 * ninguém digitar separador. Para muitas linhas, dá para colar da planilha (código e valor
 * separados por tabulação, ponto e vírgula ou espaço), e elas viram campos para conferir.
 */
export function ProjectSplit({
  rows,
  onChange,
  projects,
  amount,
  disabled,
}: {
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  /** Só os projetos que aceitam lançamento (os fechados não entram). */
  projects: Project[];
  /** O valor do lançamento, já em "1000.00", para mostrar quanto falta. */
  amount: string;
  disabled?: boolean;
}) {
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const status = rows.length ? allocationDiff(rows, amount) : null;

  const update = (index: number, patch: Partial<AllocationRow>) =>
    onChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)));

  function add() {
    // O primeiro clique já abre duas partes: dividir em uma só não faz sentido.
    onChange(rows.length ? [...rows, BLANK] : [BLANK, BLANK]);
  }

  function usePasted() {
    const result = parsePastedAllocations(pasted, projects);
    setPasteError(result.error);
    if (result.error || !result.rows.length) return;
    onChange(result.rows);
    setPasted("");
  }

  return (
    <div role="group" aria-label="Dividir entre projetos" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Dividir entre projetos (opcional)</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}>
          <Plus size={14} />
          Adicionar projeto
        </Button>
      </div>
      {rows.map((row, index) => {
        const taken = new Set(rows.filter((_, other) => other !== index).map((other) => other.projectId));
        return (
          <div key={index} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
            <SearchSelect
              ariaLabel={`Projeto da linha ${index + 1}`}
              value={row.projectId}
              placeholder="Escolha o projeto"
              onChange={(value) => update(index, { projectId: value })}
              options={projects
                .filter((project) => !taken.has(String(project.id)))
                .map((project) => ({ id: project.id, label: `PRJ-${project.code} · ${project.title}` }))}
            />
            <Input
              aria-label={`Valor da linha ${index + 1} (R$)`}
              inputMode="decimal"
              placeholder="0,00"
              value={row.amount}
              onChange={(event) => update(index, { amount: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Tirar a linha ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, other) => other !== index))}
            >
              <X size={16} />
            </Button>
          </div>
        );
      })}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status === null
            ? "Informe o valor da conta para conferir a soma."
            : status.diff === 0
              ? `A divisão fecha com o valor da conta (${brl(status.total / 100)}).`
              : status.diff > 0
                ? `Faltam ${brl(status.diff / 100)} para fechar.`
                : `Passou ${brl(-status.diff / 100)} do valor da conta.`}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">Colar várias linhas da planilha</summary>
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            aria-label="Linhas coladas da planilha"
            className="font-mono text-xs"
            placeholder={"1804 600,00\n1790 400,00"}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
          <p className="text-muted-foreground">
            Uma linha por projeto: o código e o valor, separados por espaço, tabulação (como o Excel cola) ou ponto e
            vírgula.
          </p>
          <FormError message={pasteError} />
          <div>
            <Button type="button" variant="outline" size="sm" disabled={disabled || !pasted.trim()} onClick={usePasted}>
              <ClipboardPaste size={14} />
              Passar para os campos
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
