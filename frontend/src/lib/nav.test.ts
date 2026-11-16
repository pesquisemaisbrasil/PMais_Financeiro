import { describe, expect, it } from "vitest";
import { NAV, isActive, normalizePath, place } from "./nav";

describe("a página atual do menu", () => {
  it("ignora a barra no fim do endereço: o site exportado da demonstração abre /contas-a-pagar/", () => {
    expect(normalizePath("/contas-a-pagar/")).toBe("/contas-a-pagar");
    expect(normalizePath("/contas-a-pagar")).toBe("/contas-a-pagar");
    expect(normalizePath("/")).toBe("/");
    expect(isActive("/contas-a-pagar", "/contas-a-pagar/", null)).toBe(true);
    expect(isActive("/contas-a-pagar", "/contas-a-pagar", null)).toBe(true);
    expect(isActive("/relatorios/projeto", "/relatorios/projeto/", null)).toBe(true);
  });

  it("só uma página fica marcada", () => {
    expect(isActive("/contas-a-receber", "/contas-a-pagar/", null)).toBe(false);
    expect(isActive("/", "/contas-a-pagar/", null)).toBe(false);
    expect(isActive("/", "/", null)).toBe(true);
    expect(isActive(undefined, "/contas-a-pagar", null)).toBe(false);
  });

  it("no Cadastros, quem decide é a aba do endereço, e sem ela vale a primeira", () => {
    expect(isActive("/cadastros?aba=suppliers", "/cadastros/", "suppliers")).toBe(true);
    expect(isActive("/cadastros?aba=companies", "/cadastros/", "suppliers")).toBe(false);
    expect(isActive("/cadastros?aba=companies", "/cadastros", null)).toBe(true);
    expect(isActive("/cadastros?aba=suppliers", "/cadastros", null)).toBe(false);
    expect(isActive("/cadastros?aba=suppliers", "/contas-a-pagar", "suppliers")).toBe(false);
  });
});

describe("o título da tela vem do menu", () => {
  it("diz a seção e a página: Financeiro - Contas a pagar, Cadastros - Fornecedores", () => {
    expect(place("/contas-a-pagar")).toEqual({ section: "Financeiro", title: "Contas a pagar" });
    expect(place("/cadastros?aba=suppliers")).toEqual({ section: "Cadastros", title: "Fornecedores" });
    expect(place("/cadastros?aba=categories")).toEqual({ section: "Cadastros", title: "Plano de contas" });
    expect(place("/incentivos")).toEqual({ section: "Relatórios", title: "Incentivos" });
  });

  it("toda página do menu tem endereço próprio e um título", () => {
    const hrefs = NAV.flatMap((entry) => entry.children ?? []).flatMap((leaf) => (leaf.href ? [leaf.href] : []));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(place(href).title).not.toBe("");
  });

  it("endereço que não está no menu é erro do código, não um título em branco", () => {
    expect(() => place("/nao-existe")).toThrow("não está no menu");
  });
});
