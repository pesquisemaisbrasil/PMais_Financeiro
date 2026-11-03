import { useState } from "react";
import { ApiError } from "./api";

/** Estado de envio e mensagem de erro das etapas do login. */
export function useFormAction() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível continuar");
    } finally {
      setSubmitting(false);
    }
  }

  return { error, submitting, run };
}
