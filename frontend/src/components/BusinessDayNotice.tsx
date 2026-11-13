"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { checkBusinessDay, isCheckable, shortDay, type BusinessDayCheck } from "@/lib/businessDays";
import { formatDate } from "@/lib/payables";

/**
 * Avisa na hora, embaixo do campo, quando a data escolhida cai em fim de semana ou feriado, e deixa
 * antecipar (dia útil anterior), postergar (próximo dia útil) ou manter. Não trava o lançamento.
 * `unlessDate` é a data que a conta já tinha: na edição, só avisa se a pessoa mudou para outra.
 */
export function BusinessDayNotice({
  date,
  onPick,
  unlessDate,
}: {
  date: string;
  onPick: (date: string) => void;
  unlessDate?: string;
}) {
  const [check, setCheck] = useState<BusinessDayCheck | null>(null);
  const [kept, setKept] = useState<string | null>(null);

  useEffect(() => {
    if (!isCheckable(date)) return;
    let current = true;
    // espera a pessoa terminar de digitar antes de perguntar ao servidor
    const timer = setTimeout(() => {
      checkBusinessDay(date).then(
        (result) => current && setCheck(result),
        () => current && setCheck(null) // sem resposta, sem aviso: o lançamento continua livre
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [date]);

  if (!check || check.date !== date || check.isBusinessDay || kept === date || date === unlessDate) return null;
  return (
    <Alert className="border-[#fcd34d] bg-[#fffbeb] text-[#92400e]">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        {formatDate(date)} é {check.reason}
      </AlertTitle>
      <AlertDescription className="text-[#92400e]">
        <p>Deseja antecipar ou postergar o vencimento?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onPick(check.previous)}>
            Antecipar para {shortDay(check.previous)}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onPick(check.next)}>
            Postergar para {shortDay(check.next)}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setKept(date)}>
            Manter {formatDate(date).slice(0, 5)}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
