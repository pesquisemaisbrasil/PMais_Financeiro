import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Acesso por empresa (Bruno, 27/11/2026): o admin escolhe em Acessos quais empresas cada pessoa vê.

test("acesso por empresa: o admin libera só a MC, e a pessoa só enxerga a MC", async ({ page, browser }) => {
  await signIn(page, "empresas-admin@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: "Acessos" }).click();
  await page.getByRole("tab", { name: "Pessoas e telas" }).click();
  const row = page.getByRole("row", { name: /empresas-pessoa/ });
  await expect(row).toContainText("Todas");
  await row.getByRole("button", { name: "Empresas de empresas-pessoa" }).click();
  const dialog = page.getByRole("dialog", { name: "Empresas de empresas-pessoa" });
  await dialog.getByRole("radio", { name: "Só algumas" }).click();
  const save = dialog.getByRole("button", { name: "Salvar empresas" });
  await expect(save).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "MC", exact: true }).check();
  await save.click();
  await expect(page.getByText("Empresas salvas.")).toBeVisible();
  await expect(row).toContainText("MC");

  const context = await browser.newContext();
  const person = await context.newPage();
  await signIn(person, "empresas-pessoa@e2e.invalid");
  await person.goto("/contas-a-pagar");
  await person.getByRole("combobox", { name: "Visão por período" }).click();
  await person.getByRole("option", { name: "Tudo" }).click();
  await expect(person.getByRole("row", { name: /Imóveis Batel/ }).first()).toBeVisible();
  await expect(person.getByRole("row", { name: /Gráfica Ponto Certo/ })).toHaveCount(0);
  await person.getByRole("combobox", { name: "Empresa" }).click();
  await expect(person.getByRole("option")).toHaveText(["Todas as empresas", "MC"]);
  await person.keyboard.press("Escape");
  // o cadastro de empresa nova some para quem vê só algumas
  await person.goto("/cadastros");
  await expect(person.getByRole("row", { name: /MC/ }).first()).toBeVisible();
  await expect(person.getByRole("button", { name: "Nova empresa" })).toHaveCount(0);
  await context.close();
});
