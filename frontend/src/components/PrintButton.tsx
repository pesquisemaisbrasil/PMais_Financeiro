"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { plural, type PrintTable } from "@/lib/payables";

const printedAt = () =>
  new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * "Imprimir resultados": busca tudo o que os filtros trazem (não só a página da tela) e abre a
 * impressão do navegador. A folha fica escondida na tela; na impressão ela é a única coisa que sai.
 */
export function PrintButton({ load }: { load: () => Promise<PrintTable> }) {
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<PrintTable | null>(null);

  async function print() {
    setBusy(true);
    try {
      const table = await load();
      // a folha precisa estar na página quando a impressão abrir; sai de lá quando ela fechar
      flushSync(() => setSheet(table));
      window.addEventListener("afterprint", () => setSheet(null), { once: true });
      window.print();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível preparar a impressão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-9 gap-2 bg-card font-normal"
        aria-label="Imprimir resultados"
        title="Imprimir resultados"
        disabled={busy}
        onClick={() => void print()}
      >
        <Printer size={16} />
        {busy ? "Preparando…" : "Imprimir"}
      </Button>
      {sheet && createPortal(<Sheet table={sheet} />, document.body)}
    </>
  );
}

function Sheet({ table }: { table: PrintTable }) {
  const money = table.totals.map((total) => total !== "");
  const head = "h-auto px-1.5 py-1 text-[10px] font-semibold text-black";
  const cell = "whitespace-normal px-1.5 py-1 text-[10px] leading-tight text-black";
  return (
    <div className="hidden bg-white text-black print:block">
      <h1 className="text-sm font-semibold">{table.title}</h1>
      <p className="mb-2 text-[10px]">
        Impresso em {printedAt()} · {plural(table.rows.length, "resultado", "resultados")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {table.headers.map((header, index) => (
              <TableHead key={header} className={`${head} ${money[index] ? "text-right" : ""}`}>
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, line) => (
            <TableRow key={line} className="break-inside-avoid">
              {row.map((value, index) => (
                <TableCell key={index} className={`${cell} ${money[index] ? "text-right tabular-nums" : ""}`}>
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow className="break-inside-avoid border-t-2 font-semibold">
            {table.totals.map((total, index) => (
              <TableCell key={index} className={`${cell} ${money[index] ? "text-right tabular-nums" : ""}`}>
                {index === 0 ? "Total" : total}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
