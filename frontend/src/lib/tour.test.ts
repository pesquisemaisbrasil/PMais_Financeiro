import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCREEN_TOURS,
  TOUR_SEEN_KEY,
  TOUR_STEPS,
  availableSteps,
  markTourSeen,
  tourFor,
  tourSeen,
  tourSelector,
} from "./tour";

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

describe("passeio de cada tela", () => {
  const screens = Object.entries(SCREEN_TOURS);

  it("cobre as telas do menu, menos o Início, que tem o passeio geral", () => {
    expect(Object.keys(SCREEN_TOURS).sort()).toEqual([
      "/cadastros",
      "/conferencia-bancaria",
      "/contas-a-pagar",
      "/contas-a-receber",
      "/divergencias",
      "/relatorios/fluxo-de-caixa",
      "/relatorios/projeto",
    ]);
  });

  it.each(screens)("%s começa pelo cabeçalho da tela e cada passo tem título e texto", (_path, steps) => {
    expect(steps[0].target).toBe("tela");
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const step of steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.text.length).toBeGreaterThan(0);
    }
  });

  it.each(screens)("%s não repete o elemento destacado", (_path, steps) => {
    const targets = steps.map((step) => step.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("escolhe o passeio pelo endereço, com ou sem barra no fim", () => {
    expect(tourFor("/contas-a-pagar")).toBe(SCREEN_TOURS["/contas-a-pagar"]);
    expect(tourFor("/contas-a-pagar/")).toBe(SCREEN_TOURS["/contas-a-pagar"]);
    expect(tourFor("/relatorios/projeto/")).toBe(SCREEN_TOURS["/relatorios/projeto"]);
  });

  it("no Início, numa tela sem passeio próprio ou sem endereço, mostra o geral", () => {
    expect(tourFor("/")).toBe(TOUR_STEPS);
    expect(tourFor("/tela-que-nao-existe")).toBe(TOUR_STEPS);
    expect(tourFor(null)).toBe(TOUR_STEPS);
    expect(tourFor(undefined)).toBe(TOUR_STEPS);
  });

  it("tela estreita ou sem dados deixa de fora só o passo cujo elemento não existe", () => {
    const present = new Set([tourSelector("tela"), tourSelector("busca")]);
    const steps = availableSteps((selector) => present.has(selector), SCREEN_TOURS["/contas-a-pagar"]);
    expect(steps.map((step) => step.target)).toEqual(["tela", "busca"]);
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
