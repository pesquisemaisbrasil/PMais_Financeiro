import { describe, expect, it } from "vitest";
import { closeTab, forgetTabs, hrefOf, openBeside, readTabs, sync, tabLabel, toTab, visit, writeTabs, type TabsState } from "./tabs";

const pagar = { path: "/contas-a-pagar", query: "" };
const receber = { path: "/contas-a-receber", query: "" };
const inicio = { path: "/", query: "" };

describe("abas de telas", () => {
  it("toTab: só as telas do sistema, sem a barra do fim e sem o ?", () => {
    expect(toTab("/contas-a-pagar/", "?modo=tudo")).toEqual({ path: "/contas-a-pagar", query: "modo=tudo" });
    expect(toTab("")).toEqual(inicio);
    expect(toTab("/login")).toBeNull();
    expect(hrefOf({ path: "/cadastros", query: "aba=suppliers" })).toBe("/cadastros?aba=suppliers");
    expect(hrefOf(pagar)).toBe("/contas-a-pagar");
  });

  it("navegação comum troca a tela da aba atual; tela já aberta só vai para a aba dela", () => {
    expect(visit([inicio, pagar], "/", receber)).toEqual([receber, pagar]);
    expect(visit([inicio, pagar], "/", { path: "/contas-a-pagar", query: "modo=tudo" })).toEqual([
      inicio,
      { path: "/contas-a-pagar", query: "modo=tudo" },
    ]);
    expect(visit([], null, pagar)).toEqual([pagar]);
  });

  it("duplo clique abre a aba logo depois da atual e não repete tela", () => {
    expect(openBeside([inicio, pagar], "/", receber)).toEqual([inicio, receber, pagar]);
    expect(openBeside([inicio, pagar], "/", pagar)).toEqual([inicio, pagar]);
    expect(openBeside([inicio], null, receber)).toEqual([inicio, receber]);
  });

  it("fechar a aba da frente passa para a vizinha da direita, ou da esquerda; a última não fecha", () => {
    const state: TabsState = { tabs: [inicio, pagar, receber], active: "/contas-a-pagar", waiting: null };
    expect(closeTab(state, "/contas-a-pagar")).toEqual({
      state: { tabs: [inicio, receber], active: "/contas-a-receber", waiting: "/contas-a-receber" },
      next: receber,
    });
    expect(closeTab({ ...state, active: "/contas-a-receber" }, "/contas-a-receber").next).toEqual(pagar);
    // fechar uma aba de trás não muda a da frente
    expect(closeTab(state, "/")).toEqual({ state: { ...state, tabs: [pagar, receber] }, next: null });
    const single: TabsState = { tabs: [pagar], active: "/contas-a-pagar", waiting: null };
    expect(closeTab(single, "/contas-a-pagar")).toEqual({ state: single, next: null });
  });

  it("sync: segue o endereço, e ao fechar espera o endereço chegar na vizinha antes de mexer", () => {
    const state: TabsState = { tabs: [inicio, pagar], active: "/", waiting: null };
    expect(sync(state, null)).toBe(state);
    expect(sync(state, inicio)).toBe(state);
    expect(sync(state, pagar)).toEqual({ tabs: [inicio, pagar], active: "/contas-a-pagar", waiting: null });
    expect(sync(state, receber)).toEqual({ tabs: [receber, pagar], active: "/contas-a-receber", waiting: null });
    // o filtro do endereço mudou na mesma tela: a aba guarda o novo
    const filtered = { path: "/", query: "x=1" };
    expect(sync(state, filtered).tabs[0]).toEqual(filtered);

    const closing: TabsState = { tabs: [inicio], active: "/", waiting: "/" };
    // o endereço ainda é o da aba fechada: nada muda (senão ela voltaria no lugar da vizinha)
    expect(sync(closing, pagar)).toBe(closing);
    expect(sync(closing, inicio)).toEqual({ tabs: [inicio], active: "/", waiting: null });
  });

  it("o nome da aba vem do menu", () => {
    expect(tabLabel(inicio)).toBe("Início");
    expect(tabLabel(pagar)).toBe("Contas a pagar");
    expect(tabLabel({ path: "/cadastros", query: "aba=suppliers" })).toBe("Fornecedores");
    expect(tabLabel({ path: "/cadastros", query: "" })).toBe("Empresas");
    expect(tabLabel({ path: "/cadastros", query: "aba=holidays" })).toBe("Cadastros");
    expect(tabLabel({ path: "/acessos", query: "" })).toBe("Acessos");
    expect(tabLabel({ path: "/incentivos", query: "" })).toBe("Incentivos");
  });

  it("ao sair, apaga só as abas guardadas", () => {
    const storage = {
      "financeiro:abas:2": "{}",
      "financeiro:abas:7": "{}",
      "financeiro:passeio-visto": "1",
      removeItem(key: string) {
        delete (this as Record<string, unknown>)[key];
      },
    };
    forgetTabs(storage as unknown as Storage);
    expect(Object.keys(storage)).toEqual(["financeiro:passeio-visto", "removeItem"]);
  });

  it("guardar e ler na aba do navegador, ignorando o que não é tela ou está estragado", () => {
    const state: TabsState = { tabs: [inicio, pagar], active: "/contas-a-pagar", waiting: "/" };
    expect(readTabs(writeTabs(state))).toEqual({ ...state, waiting: null });
    expect(
      readTabs(JSON.stringify({ tabs: [{ path: "/login" }, pagar, pagar, { path: 3 }], active: "/nada" }))
    ).toEqual({ tabs: [pagar], active: "/contas-a-pagar", waiting: null });
    expect(readTabs("{estragado")).toEqual({ tabs: [], active: null, waiting: null });
    expect(readTabs(null)).toEqual({ tabs: [], active: null, waiting: null });
  });
});
