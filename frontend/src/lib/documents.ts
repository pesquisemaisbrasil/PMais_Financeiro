/** Documentos anexados à conta: o que a tela confere antes de enviar (o servidor confere de novo). */

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".docx", ".xml"];
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(",");
export const DOCUMENT_HINT = "PDF, imagem (JPG ou PNG), planilha (XLSX), documento (DOCX) ou XML, até 20 MB cada";

/** O tipo do documento, para achar a nota ou o boleto sem abrir um por um. A lista é a do servidor. */
export const DOCUMENT_KINDS = [
  { id: "nota", label: "Nota fiscal" },
  { id: "boleto", label: "Boleto" },
  { id: "contrato", label: "Contrato" },
  { id: "comprovante", label: "Comprovante" },
  { id: "recibo", label: "Recibo" },
  { id: "planilha", label: "Planilha" },
  { id: "outro", label: "Outro" },
];
export const DEFAULT_DOCUMENT_KIND = "outro";

/** O nome do tipo para mostrar; o que não está na lista é "Outro". */
export function kindLabel(kind: string): string {
  return DOCUMENT_KINDS.find((option) => option.id === kind)?.label ?? "Outro";
}

/** O que muda ao renomear: só o que veio é alterado. */
export interface DocumentChange {
  name?: string;
  kind?: string;
}

/** Texto de erro do arquivo, ou null se pode seguir. */
export function checkDocument(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (file.size === 0) return `${file.name}: o arquivo está vazio`;
  if (!DOCUMENT_EXTENSIONS.includes(extension) || file.size > MAX_DOCUMENT_BYTES) {
    return `${file.name}: envie PDF, imagem, planilha, documento ou XML de até 20 MB`;
  }
  return null;
}

/** "340 KB", "1,4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Baixa o arquivo no computador, com o nome dele. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
