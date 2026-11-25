import { describe, expect, it } from "vitest";
import { defaultRange, titleHref, todayInSaoPaulo } from "./cashFlow";

describe("fluxo de caixa", () => {
  it("abre desta semana, de segunda, até o domingo de 4 semanas depois", () => {
    // 25/11/2026 é uma quarta
    expect(defaultRange("2026-11-25")).toEqual({ start: "2026-11-23", end: "2026-12-27" });
    // segunda e domingo ficam na própria semana
    expect(defaultRange("2026-11-23").start).toBe("2026-11-23");
    expect(defaultRange("2026-11-29").start).toBe("2026-11-23");
  });

  it("hoje é o dia de São Paulo, mesmo de madrugada em UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-11-26T02:00:00Z"))).toBe("2026-11-25");
  });

  it("o título abre na tela dele", () => {
    expect(titleHref({ kind: "pagar", titleId: 7 })).toBe("/contas-a-pagar?modo=tudo&conta=7");
    expect(titleHref({ kind: "receber", titleId: 9 })).toBe("/contas-a-receber?modo=tudo&conta=9");
  });
});
