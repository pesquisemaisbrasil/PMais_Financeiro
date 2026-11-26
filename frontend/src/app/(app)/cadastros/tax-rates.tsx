"use client";

import { BookUser } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, Field, FormError, PageHeader } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, getTaxRates, saveTaxRates } from "@/lib/api";
import { parsePercent, percentField } from "@/lib/adjustments";
import { place } from "@/lib/nav";
import type { TaxRate } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";

const fieldsOf = (rates: TaxRate[]) => Object.fromEntries(rates.map((rate) => [rate.code, percentField(rate.rate)]));

/**
 * A aba "Impostos retidos" do Cadastros (Bruno, 19/11/2026): os percentuais que toda conta a pagar nova
 * já traz calculados sobre o valor principal. Trocar aqui vale para todos, só nas contas novas.
 */
export function TaxRatesTab() {
  const [rates, setRates] = useState<TaxRate[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { error, submitting, run } = useFormAction();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await getTaxRates();
      setRates(list);
      setValues(fieldsOf(list));
    } catch (err) {
      setRates(null);
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar os impostos retidos");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!rates) return;
    const body: { code: string; rate: string }[] = [];
    for (const rate of rates) {
      const value = parsePercent(values[rate.code] ?? "");
      if (value === null) return setLocalError(`Informe o percentual de ${rate.name} entre 0 e 100, como 1,5.`);
      body.push({ code: rate.code, rate: value });
    }
    await run(async () => {
      const list = await saveTaxRates(body);
      setRates(list);
      setValues(fieldsOf(list));
      toast.success("Percentuais salvos. Valem para as contas a pagar novas daqui para frente.");
    });
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        {...place("/cadastros?aba=taxRates")}
        icon={BookUser}
        subtitle="Os percentuais que toda conta a pagar nova já traz, calculados sobre o valor principal. Na conta, o valor de cada imposto pode ser mudado ou zerado. O INSS do RPA não entra na conta: é o desconto de quem recebe por RPA nas folhas de campo importadas daqui para frente."
      />

      {loadError && (
        <div className="mb-4">
          <ErrorBox message={loadError} onRetry={load} />
        </div>
      )}

      {!rates ? (
        !loadError && (
          <div className="flex justify-center p-8">
            <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
          </div>
        )
      ) : (
        <form onSubmit={submit} noValidate className={`${CARD} max-w-[520px] p-5`}>
          <FormError message={localError ?? error} />
          <div className="flex flex-col gap-3.5">
            {rates.map((rate) => (
              <Field key={rate.code} inline label={`${rate.name} (%)`} id={`imposto-${rate.code}`}>
                <Input
                  id={`imposto-${rate.code}`}
                  inputMode="decimal"
                  className="sm:max-w-32"
                  value={values[rate.code] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [rate.code]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            A troca vale para todos, só nas contas novas: as já lançadas não mudam. Fica no histórico quem trocou e
            quando.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner aria-label="Salvando" className="size-4" />}
              Salvar percentuais
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
