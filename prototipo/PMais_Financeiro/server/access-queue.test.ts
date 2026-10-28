import { describe, expect, it } from "vitest";
import { createAccessQueue } from "../client/src/lib/accessQueue";

describe("Fila das requisições de acesso", () => {
  it("nunca executa dois refreshes que renovam CSRF em paralelo", async () => {
    const queue = createAccessQueue();
    let active = 0; let maxActive = 0; let cookie = ""; let token = "";
    const calls = Array.from({length: 3}, (_, id) => queue(async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, id === 0 ? 15 : 1));
      cookie = `csrf-fixture-${id}`; token = cookie; active--;
    }));
    await Promise.all(calls);
    expect(maxActive).toBe(1); expect(cookie).toBe(token);
  });
  it("refresh não intercala renovação no meio de login e sua verificação", async () => {
    const queue = createAccessQueue(); const order: string[] = [];
    const login = queue(async () => {
      order.push("read-before"); await Promise.resolve();
      order.push("login"); await Promise.resolve(); order.push("read-after");
    });
    const refresh = queue(async () => { order.push("refresh"); });
    await Promise.all([login, refresh]);
    expect(order).toEqual(["read-before", "login", "read-after", "refresh"]);
  });
  it("uma falha não bloqueia verificações posteriores", async () => {
    const queue = createAccessQueue();
    await expect(queue(async () => { throw new Error("fixture-error"); })).rejects.toThrow("fixture-error");
    await expect(queue(async () => "recovered")).resolves.toBe("recovered");
  });
});
