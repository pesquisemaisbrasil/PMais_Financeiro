"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function Toast({
  message,
  error,
  onDismiss,
}: {
  message: string | null;
  error: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (error) toast.error(error);
    else if (message) toast.success(message);
    else return;
    // Libera o estado da página logo em seguida, para que a mesma mensagem possa ser disparada de novo.
    onDismiss();
  }, [message, error, onDismiss]);

  return null;
}
