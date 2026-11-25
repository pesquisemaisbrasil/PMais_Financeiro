import { expect, test } from "@playwright/test";
import { todayInSaoPaulo } from "../src/lib/cashFlow";
import { addDays } from "../src/lib/payables";
import { signIn } from "./fixtures";

test("DRE: as linhas e as contas, o filtro de projeto, exportar e a data trocada", async ({ page }) => {
  await signIn(page, "dre@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("button", { name: "Relatórios" }).click();
  await menu.getByRole("link", { name: "DRE" }).click();
  await expect(page.getByRole("heading", { name: "Relatórios - DRE" })).toBeVisible();

  // As contas do seed foram emitidas há 20 dias: o período começa dois meses atrás
  await page.getByLabel("De", { exact: true }).fill(addDays(todayInSaoPaulo(), -60));
  await expect(page.getByRole("row", { name: /^Despesas/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /^Resultado/ })).toBeVisible();
  // no seed, as contas não têm grupo: a linha é "Sem grupo"
  await expect(page.getByRole("row", { name: /^Sem grupo/ }).first()).toBeVisible();

  // Mostrar as contas abre as contas analíticas de cada linha
  const phone = page.getByRole("row", { name: /^3\.02 Energia e telefonia/ });
  await expect(phone).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar as contas" }).click();
  await expect(phone).toBeVisible();

  // Com o projeto, só as contas dele: a de telefonia não é de projeto nenhum
  await page.getByRole("combobox", { name: "Projeto" }).click();
  await page.getByRole("option", { name: /^PRJ-1790/ }).click();
  await expect(phone).toHaveCount(0);
  await expect(page.getByRole("row", { name: /^Despesas/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^dre-.*\.xlsx$/);

  // A data final antes da inicial: a tela diz o motivo
  await page.getByLabel("Até", { exact: true }).fill("2020-01-01");
  await expect(page.getByText("A data final vem antes da inicial")).toBeVisible();
});
