import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "./ui/alert-dialog";
import { registerDemoConfirmation } from "@/lib/demoConfirm";

export default function DemoConfirmationHost() {
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<((result: boolean) => void) | null>(null);
  function finish(result: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setMessage(null);
    resolve?.(result);
  }
  useEffect(() => {
    const unregister = registerDemoConfirmation((text, resolve) => {
      if (pending.current) { resolve(false); return; }
      pending.current = resolve;
      setMessage(text);
    });
    return () => { unregister(); pending.current?.(false); pending.current = null; };
  }, []);
  return (
    <AlertDialog open={message !== null} onOpenChange={open => { if (!open) finish(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar ação de demonstração</AlertDialogTitle>
          <AlertDialogDescription>{message}<br /><br /><strong>Somente dados sintéticos locais. Nenhum banco, Pix ou Connect será acionado.</strong></AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" onClick={() => finish(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={() => finish(true)}>Confirmar simulação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
