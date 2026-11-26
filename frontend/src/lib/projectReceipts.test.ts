import { describe, expect, it } from "vitest";
import { shortMonth, yearOptions } from "./projectReceipts";

describe("recebimentos de projetos × ano", () => {
  it("a lista de anos vai do próximo a cinco para trás", () => {
    expect(yearOptions("2026-11-26")).toEqual(["2027", "2026", "2025", "2024", "2023", "2022", "2021"]);
  });

  it("o mês aparece curto, porque o ano está no filtro", () => {
    expect(shortMonth("março/2026")).toBe("mar");
  });
});
