import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_FAVORITES,
  addFavorite,
  favoritesKey,
  pick,
  readFavorites,
  removeFavorite,
  writeFavorites,
  type Favorite,
} from "./favorites";

// os testes rodam sem navegador: um localStorage de mentira, só com o que o módulo usa
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  clear: () => store.clear(),
});

describe("filtro favorito", () => {
  beforeEach(() => localStorage.clear());

  it("guarda por pessoa e por tela, e volta igual", () => {
    const key = favoritesKey(7, "dre");
    expect(key).toBe("financeiro:favoritos:7:dre");
    const list = addFavorite([], "  Matriz ", { company: "3" })!;
    expect(writeFavorites(key, list)).toBe(true);
    expect(readFavorites(key)).toEqual([{ name: "Matriz", value: { company: "3" } }]);
    expect(readFavorites(favoritesKey(8, "dre"))).toEqual([]);
  });

  it("lixo no navegador vira lista vazia, e item sem forma é ignorado", () => {
    localStorage.setItem("k", "{não é json");
    expect(readFavorites("k")).toEqual([]);
    localStorage.setItem("k", JSON.stringify([{ name: "ok", value: {} }, { name: 1 }, "x", { name: "y", value: [] }]));
    expect(readFavorites("k")).toEqual([{ name: "ok", value: {} }]);
  });

  it("o mesmo nome troca o favorito; a lista cheia recusa um nome novo", () => {
    const one = addFavorite([], "Matriz", { company: "1" })!;
    expect(addFavorite(one, "matriz", { company: "2" })).toEqual([{ name: "matriz", value: { company: "2" } }]);
    const full: Favorite[] = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ name: `f${i}`, value: {} }));
    expect(addFavorite(full, "novo", {})).toBeNull();
    expect(addFavorite(full, "F3", { a: "b" })?.[3]).toEqual({ name: "F3", value: { a: "b" } });
    expect(removeFavorite(one, "Matriz")).toEqual([]);
  });

  it("aplica só as chaves que a tela conhece, com o mesmo tipo", () => {
    const now = { company: "", showAccounts: false, columns: ["a"], filters: {} as Record<string, string> };
    const saved = {
      company: "3",
      showAccounts: "sim",
      columns: ["b", 5],
      filters: { unit: "2", bad: { x: 1 } },
      start: "2020-01-01",
    };
    expect(pick(now, saved)).toEqual({ company: "3", showAccounts: false, columns: ["b"], filters: { unit: "2" } });
  });
});
