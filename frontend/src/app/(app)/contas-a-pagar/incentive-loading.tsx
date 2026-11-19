"use client";

import { useEffect, useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { loadedCount } from "@/lib/incentive-loading";
import { plural } from "@/lib/payables";

const TICK_MS = 60;
/** Quanto tempo o "N incentivos carregados" fica na tela antes de a janela fechar. */
const DONE_MS = 800;

export function IncentiveLoading({
  total,
  confirmed,
  onFinished,
}: {
  total: number;
  /** O servidor já criou os lançamentos: só então a contagem chega ao total. */
  confirmed: boolean;
  onFinished: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - start), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const count = loadedCount(total, elapsed, confirmed);
  const finished = count >= total;
  const percent = Math.round((count / total) * 100);

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(onFinished, DONE_MS);
    return () => clearTimeout(timer);
  }, [finished, onFinished]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{finished ? "Incentivos carregados" : "Carregando incentivos"}</DialogTitle>
        <DialogDescription>
          {finished
            ? "Os lançamentos já estão no Contas a pagar."
            : "Não feche esta janela. Os lançamentos só entram quando todos estiverem prontos."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-6">
        {/* O leitor de tela ouve a frase uma vez só, e não cada número da contagem. */}
        <p className="sr-only" role="status">
          {finished
            ? plural(total, "incentivo carregado", "incentivos carregados")
            : `Carregando ${plural(total, "incentivo", "incentivos")}`}
        </p>
        <div aria-hidden className="flex items-baseline justify-between gap-3 text-sm font-medium tabular-nums">
          <span>
            {finished
              ? plural(total, "incentivo carregado", "incentivos carregados")
              : `${count} de ${plural(total, "incentivo", "incentivos")}`}
          </span>
          <span className="text-muted-foreground">{percent}%</span>
        </div>
        <Progress value={percent} aria-label="Incentivos carregados" />
      </div>
    </>
  );
}
