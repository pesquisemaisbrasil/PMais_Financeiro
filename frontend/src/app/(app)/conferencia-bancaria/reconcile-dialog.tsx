"use client";

import { useEffect, useState } from "react";
import { Field, FormError, Tag } from "@/components/finance";
import { SearchSelect } from "@/components/SearchSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import {
  CLASSIFICATIONS,
  checkReconcile,
  listSuggestions,
  markException,
  needsInvoice,
  reasonsText,
  reconcileLine,
  type Suggestion,
  type Transaction,
} from "@/lib/bank";
import { brl, formatDate } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type Mode = "lancamento" | "excecao";

/**
 * Conciliar uma linha do extrato: à esquerda a linha, à direita os lançamentos que podem ser a
 * origem dela (valor igual e até 3 dias de diferença). Escolhe-se um, confere-se a classificação e
 * concilia. Sem lançamento que sirva, a linha pode ficar como exceção, com o motivo.
 */
export function ReconcileDialog({
  line,
  onClose,
  onDone,
}: {
  line: Transaction;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [mode, setMode] = useState<Mode>("lancamento");
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const [classification, setClassification] = useState("");
  const [nfNumber, setNfNumber] = useState("");
  const [nfIssuedOn, setNfIssuedOn] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const outgoing = Number(line.amount) < 0;

  useEffect(() => {
    listSuggestions(line.id).then(setFound, (err) => {
      setFound([]);
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível buscar os lançamentos agora.");
    });
  }, [line.id]);

  function choose(suggestion: Suggestion) {
    setChosen(suggestion);
    setLocalError(null);
    // o lançamento já diz como classificar e qual é a nota; a pessoa confere e muda se precisar
    setClassification(suggestion.classification ?? "");
    setNfNumber(suggestion.nfNumber ?? "");
    setNfIssuedOn(suggestion.nfIssuedOn ?? "");
  }

  async function reconcile() {
    if (!chosen) return setLocalError("Escolha o lançamento da linha.");
    const refusal = checkReconcile({ classification, nfNumber, nfIssuedOn });
    if (refusal) return setLocalError(refusal);
    setLocalError(null);
    await run(async () => {
      await reconcileLine(line.id, {
        targetKind: chosen.targetKind,
        targetId: chosen.targetId,
        itemId: chosen.itemId,
        classification,
        nfNumber: needsInvoice(classification) ? nfNumber.trim() : null,
        nfIssuedOn: needsInvoice(classification) ? nfIssuedOn : null,
      });
      onDone("Linha conciliada.");
    });
  }

  async function except() {
    if (!reason.trim()) return setLocalError("Diga o motivo da exceção.");
    setLocalError(null);
    await run(async () => {
      await markException(line.id, { reason: reason.trim(), classification: classification || null });
      onDone("Linha marcada como exceção.");
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Conciliar linha do extrato</DialogTitle>
          <DialogDescription>
            Ligue a linha ao lançamento que a explica. Só aparecem lançamentos com baixa nessa conta, de valor
            igual e até 3 dias de diferença.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <section aria-label="A linha do extrato" className="rounded-xl border border-border bg-brand-azul-deep/[0.03] p-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Linha do extrato</p>
            <p className={cn("text-xl font-semibold tabular-nums", outgoing ? "text-[#b91c1c]" : "text-[#047857]")}>
              {brl(line.amount)}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">{outgoing ? "Saída" : "Entrada"}</p>
            <p className="text-sm font-medium text-brand-cinza-escuro">{line.description}</p>
            <p className="text-xs text-muted-foreground">{formatDate(line.postedOn)}</p>
          </section>

          <div className="flex min-w-0 flex-col gap-3">
            <Tabs value={mode} onValueChange={(next) => setMode(next as Mode)}>
              <TabsList>
                <TabsTrigger value="lancamento">Conciliar com um lançamento</TabsTrigger>
                <TabsTrigger value="excecao">Marcar exceção</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "lancamento" ? (
              <>
                {found === null ? (
                  <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner aria-label="Buscando" className="size-4" />
                    Buscando lançamentos…
                  </p>
                ) : found.length ? (
                  <ul className="flex flex-col gap-2" aria-label="Lançamentos sugeridos">
                    {found.map((suggestion) => {
                      const selected = chosen?.targetId === suggestion.targetId && chosen?.itemId === suggestion.itemId;
                      return (
                        <li key={`${suggestion.targetKind}-${suggestion.targetId}-${suggestion.itemId ?? 0}`}>
                          <Button
                            type="button"
                            variant="outline"
                            aria-pressed={selected}
                            className={cn(
                              "h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left",
                              selected && "border-brand-azul-deep bg-brand-azul-deep/10"
                            )}
                            onClick={() => choose(suggestion)}
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="text-[13px] font-semibold text-brand-cinza-escuro">
                                {suggestion.description}
                                {suggestion.who ? ` · ${suggestion.who}` : ""}
                              </span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {suggestion.projectCodes.length
                                  ? `${suggestion.projectCodes.map((code) => `PRJ-${code}`).join(", ")} · `
                                  : ""}
                                {suggestion.targetKind === "payable" ? "pago" : "recebido"} em {formatDate(suggestion.paidOn)}{" "}
                                · {brl(suggestion.amount)}
                              </span>
                              <span className="text-xs font-normal text-brand-azul-deep">{reasonsText(suggestion)}</span>
                            </span>
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Alert>
                    <AlertDescription>
                      {loadError ??
                        `Nenhum lançamento com baixa de ${brl(Math.abs(Number(line.amount)))} até 3 dias dessa linha. Dê a baixa no Contas a ${outgoing ? "pagar" : "receber"} ou marque a linha como exceção.`}
                    </AlertDescription>
                  </Alert>
                )}

                {chosen && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                    <Field label="Classificação *" id="cl-class" hint="O que a contabilidade vai ler nesta linha.">
                      <SearchSelect
                        id="cl-class"
                        value={classification}
                        onChange={setClassification}
                        options={CLASSIFICATIONS}
                      />
                    </Field>
                    {needsInvoice(classification) && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Número da nota *" id="cl-nf">
                          <Input id="cl-nf" value={nfNumber} onChange={(event) => setNfNumber(event.target.value)} />
                        </Field>
                        <Field label="Emissão da nota *" id="cl-nf-data">
                          <Input
                            id="cl-nf-data"
                            type="date"
                            value={nfIssuedOn}
                            onChange={(event) => setNfIssuedOn(event.target.value)}
                          />
                        </Field>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Conciliando com <Tag color="azul">{chosen.description}</Tag>
                      {chosen.who ? ` (${chosen.who})` : ""}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Exceção é a linha que não tem lançamento (tarifa, rendimento, transferência entre contas). Ela conta
                  como conciliada, e o motivo fica no histórico.
                </p>
                <Field label="Motivo *" id="ex-motivo">
                  <Input id="ex-motivo" value={reason} onChange={(event) => setReason(event.target.value)} />
                </Field>
                <Field label="Classificação" id="ex-class" hint="Opcional na exceção.">
                  <SearchSelect id="ex-class" value={classification} onChange={setClassification} options={CLASSIFICATIONS} />
                </Field>
              </div>
            )}
            <FormError message={localError ?? error} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          {mode === "lancamento" ? (
            <Button type="button" disabled={submitting || !chosen} onClick={() => void reconcile()}>
              Conciliar
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={() => void except()}>
              Marcar exceção
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
