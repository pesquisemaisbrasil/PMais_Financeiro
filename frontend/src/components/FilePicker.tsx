"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Escolher arquivo em português. O campo nativo escreve "Choose File / No file chosen" na língua
 * do navegador e não dá para traduzir, então ele fica escondido e um botão abre a janela.
 * O campo continua no lugar, com o mesmo `id`, para o rótulo (e os testes) acharem.
 */
export function FilePicker({
  id,
  accept,
  multiple = false,
  disabled = false,
  status,
  onPick,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Texto ao lado do botão, em geral o nome do arquivo. `null` esconde; sem valor, "Nenhum arquivo escolhido". */
  status?: string | null;
  onPick: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <Input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // deixa escolher o mesmo arquivo de novo
          onPick(files);
        }}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        <Upload size={14} />
        {multiple ? "Escolher arquivos" : "Escolher arquivo"}
      </Button>
      {status !== null && (
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">{status ?? "Nenhum arquivo escolhido"}</span>
      )}
    </div>
  );
}
