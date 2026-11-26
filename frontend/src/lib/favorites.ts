/**
 * Filtro favorito (PF-76): a pessoa guarda os filtros, as colunas e as opções de uma tela com um
 * nome e reabre depois. Fica só no navegador, por pessoa e por tela (decisão do Bruno, 26/11/2026).
 * As datas não entram: o favorito vale para o período que estiver na tela.
 */

export interface Favorite {
  name: string;
  value: Record<string, unknown>;
}

export const MAX_FAVORITES = 20;
export const MAX_NAME = 60;

export function favoritesKey(userId: number | undefined, screen: string): string {
  return `financeiro:favoritos:${userId ?? "anonimo"}:${screen}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** O que está guardado; lixo, ou o navegador sem acesso, vira lista vazia. */
export function readFavorites(key: string): Favorite[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Favorite => isObject(item) && typeof item.name === "string" && isObject(item.value))
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function writeFavorites(key: string, list: Favorite[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

/** Guarda com o nome; o mesmo nome troca o que estava. `null` quando a lista já está cheia. */
export function addFavorite(list: Favorite[], name: string, value: Record<string, unknown>): Favorite[] | null {
  const clean = name.trim().slice(0, MAX_NAME);
  const index = list.findIndex((item) => same(item.name, clean));
  if (index >= 0) return list.map((item, i) => (i === index ? { name: clean, value } : item));
  if (list.length >= MAX_FAVORITES) return null;
  return [...list, { name: clean, value }];
}

export function removeFavorite(list: Favorite[], name: string): Favorite[] {
  return list.filter((item) => item.name !== name);
}

/**
 * Os valores guardados por cima dos de agora, só nas chaves que a tela conhece e com o mesmo tipo:
 * um favorito de uma versão antiga, ou mexido à mão, não quebra a tela.
 */
export function pick<T extends Record<string, unknown>>(current: T, saved: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...current };
  for (const [key, now] of Object.entries(current)) {
    const value = saved[key];
    if (Array.isArray(now)) {
      if (Array.isArray(value)) result[key] = value.filter((item) => typeof item === "string");
    } else if (isObject(now)) {
      if (isObject(value)) {
        result[key] = Object.fromEntries(
          Object.entries(value).filter(([, inner]) => typeof inner === "string" || typeof inner === "boolean")
        );
      }
    } else if (typeof value === typeof now) {
      result[key] = value;
    }
  }
  return result as T;
}
