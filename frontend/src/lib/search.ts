// Busca em todo o sistema (pedido do Bruno, 18/11/2026; spec busca-geral). O servidor procura e
// separa por grupo; aqui ficam os tipos e o destaque da palavra buscada nos resultados.

export interface SearchHit {
  title: string;
  subtitle: string;
  /** Para onde o clique leva: a conta aberta, o relatório do projeto ou o cadastro com a busca. */
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  /** Quantos acharam no grupo; `hits` traz só os primeiros. */
  total: number;
  /** "Ver todos": a tela do grupo com a mesma busca. */
  moreHref: string;
  hits: SearchHit[];
}

export interface SearchResult {
  term: string;
  groups: SearchGroup[];
}

/** O servidor recusa menos que isso; a tela nem pergunta. */
export const SEARCH_MIN_LENGTH = 2;

/** Mesma regra do servidor: sem acento e sem diferença de maiúscula. */
export function fold(text: string): string {
  // NFD separa a letra do acento (U+0300 a U+036F), e o acento sai
  return Array.from(text.normalize("NFD"))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code < 0x300 || code > 0x36f;
    })
    .join("")
    .toLowerCase();
}

/**
 * A regra de toda busca do sistema (Bruno, 18/11/2026), a mesma do servidor: cada palavra digitada
 * aparece no texto, em qualquer pedaço e em qualquer ordem, sem acento e sem diferença de maiúscula
 * ("certo PON" acha "Gráfica Ponto Certo"; "itau" acha "Itaú"). Busca vazia acha tudo.
 */
export function matchesSearch(text: string, term: string): boolean {
  const haystack = fold(text);
  return fold(term)
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** O termo está pronto para ir ao servidor (pelo menos 2 letras, fora os espaços). */
export function searchable(term: string): boolean {
  return term.replace(/\s+/g, "").length >= SEARCH_MIN_LENGTH;
}

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Pedaços do texto com as palavras buscadas marcadas, sem acento e sem diferença de maiúscula:
 * "itau" marca "Itaú" em "Tarifa do Itaú". Cada palavra do termo é marcada onde aparecer.
 */
export function highlightParts(text: string, term: string): TextPart[] {
  const words = term.split(/\s+/).map(fold).filter(Boolean);
  if (!text || !words.length) return [{ text, match: false }];
  const chars = [...text];
  // o texto sem acento, letra a letra, lembrando de qual letra original cada uma veio
  let flat = "";
  const owner: number[] = [];
  chars.forEach((char, index) => {
    for (const piece of fold(char)) {
      flat += piece;
      owner.push(index);
    }
  });
  const marked = chars.map(() => false);
  for (const word of words) {
    for (let from = flat.indexOf(word); from >= 0; from = flat.indexOf(word, from + word.length)) {
      for (let i = from; i < from + word.length; i++) marked[owner[i]] = true;
    }
  }
  const parts: TextPart[] = [];
  chars.forEach((char, index) => {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[index]) last.text += char;
    else parts.push({ text: char, match: marked[index] });
  });
  return parts;
}
