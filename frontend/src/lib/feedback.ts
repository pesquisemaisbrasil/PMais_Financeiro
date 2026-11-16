/**
 * Solicitações da equipe (só na versão de demonstração): os tipos, o que a tela confere antes de
 * enviar e a chave do desenvolvimento guardada no navegador. Quem guarda é a função do Netlify
 * (netlify/solicitacoes.mjs). docs/specs/solicitacoes.md
 */
import { normalizePath, place } from "./nav";

export const FEEDBACK_TYPES = [
  { id: "bug", label: "Correção de bug", hint: "Algo deu erro ou não funciona como deveria." },
  { id: "regra", label: "Correção de regra", hint: "Funciona, mas a regra do financeiro está errada." },
  { id: "melhoria", label: "Melhoria", hint: "Uma ideia para facilitar o trabalho." },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["id"];

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  description: string;
  /** A tela de onde a pessoa enviou (o endereço, com o ?aba= do Cadastros). */
  page: string;
  sender: string;
  createdAt: string;
  image: { contentType: string; size: number };
}

/** O mesmo limite da função do Netlify: ela recebe no máximo 6 MB, e a imagem vai codificada. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).join(",");

export function feedbackTypeLabel(type: string): string {
  return FEEDBACK_TYPES.find((option) => option.id === type)?.label ?? type;
}

/** O problema da imagem escolhida ou colada, em palavras; null quando ela serve. */
export function imageProblem(file: File): string | null {
  if (!(file.type in IMAGE_TYPES)) return "Anexe uma imagem PNG, JPG, WEBP ou GIF (um print da tela).";
  if (file.size > MAX_IMAGE_BYTES) return "A imagem passa de 4 MB. Recorte um pedaço menor da tela.";
  return null;
}

/** A imagem do Ctrl+V (o print recortado com Windows + Shift + S), se o que foi colado tem uma. */
export function pastedImage(data: Pick<DataTransfer, "files"> | null): File | null {
  const file = [...(data?.files ?? [])].find((item) => item.type in IMAGE_TYPES);
  return file ? new File([file], `print-colado.${IMAGE_TYPES[file.type]}`, { type: file.type }) : null;
}

/** O nome da tela de onde veio a solicitação, como no título dela ("Cadastros - Fornecedores"). */
export function pageLabel(page: string): string {
  const [path, query] = page.split("?");
  const clean = normalizePath(path || "/");
  if (clean === "/") return "Início";
  const href = clean === "/cadastros" ? `/cadastros?aba=${new URLSearchParams(query).get("aba") ?? "companies"}` : clean;
  try {
    const { section, title } = place(href);
    return `${section} - ${title}`;
  } catch {
    return page;
  }
}

const KEY_STORAGE = "financeiro:chave-solicitacoes";

/** A chave do desenvolvimento, guardada só neste navegador para não digitar toda vez. */
export function savedFeedbackKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function saveFeedbackKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // sem armazenamento (janela privativa): a chave é pedida de novo na próxima visita
  }
}
