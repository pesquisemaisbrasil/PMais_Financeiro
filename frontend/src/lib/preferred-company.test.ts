import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPreferredCompany, savePreferredCompany } from "./preferred-company";

describe("empresa preferida", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  it("guarda por pessoa, volta a todas com vazio e ignora lixo", () => {
    savePreferredCompany(7, "3");
    expect(readPreferredCompany(7)).toBe("3");
    expect(readPreferredCompany(8)).toBe("");
    savePreferredCompany(7, "");
    expect(readPreferredCompany(7)).toBe("");
    localStorage.setItem("financeiro:empresa-preferida:7", "1,2");
    expect(readPreferredCompany(7)).toBe("");
    expect(readPreferredCompany(undefined)).toBe("");
  });
});
