import { afterEach, describe, expect, it, vi } from "vitest";
import { TOUR_SEEN_KEY, TOUR_STEPS, availableSteps, markTourSeen, tourSeen, tourSelector } from "./tour";

/** O armazenamento do navegador, de mentira (os testes de lib rodam em Node). */
function stubStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe("passos do passeio", () => {
  it("começa com as boas-vindas, sem elemento, e cada passo tem título e texto", () => {
    expect(TOUR_STEPS[0].target).toBeNull();
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.text.length).toBeGreaterThan(0);
    }
  });

  it("não repete o elemento destacado", () => {
    const targets = TOUR_STEPS.map((step) => step.target).filter(Boolean);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("acha o elemento pelo data-tour", () => {
    expect(tourSelector("menu")).toBe('[data-tour="menu"]');
  });

  it("deixa de fora o passo cujo elemento não está na tela", () => {
    const present = new Set([tourSelector("menu"), tourSelector("avisos")]);
    const steps = availableSteps((selector) => present.has(selector));
    expect(steps.map((step) => step.target)).toEqual([null, "menu", "avisos"]);
  });
});

describe("já visto", () => {
  it("abre sozinho só enquanto este navegador não viu", () => {
    const data = stubStorage();
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(data[TOUR_SEEN_KEY]).toBe("1");
    expect(tourSeen()).toBe(true);
  });

  it("sem armazenamento, não abre sozinho e não quebra", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(tourSeen()).toBe(true);
    expect(() => markTourSeen()).not.toThrow();
  });
});
