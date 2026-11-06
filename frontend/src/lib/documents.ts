/** Documentos anexados à conta: o que a tela confere antes de enviar (o servidor confere de novo). */

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".docx", ".xml"];
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(",");
export const DOCUMENT_HINT = "PDF, imagem (JPG ou PNG), planilha (XLSX), documento (DOCX) ou XML, até 20 MB cada";

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
