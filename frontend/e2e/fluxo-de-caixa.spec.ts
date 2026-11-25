import { expect, test } from "@playwright/test";
import { currentMonth, monthLabel } from "../src/lib/bank-month";
import { defaultRange, todayInSaoPaulo } from "../src/lib/cashFlow";
import { addDays } from "../src/lib/payables";
import { signIn } from "./fixtures";

/** "2026-11-23" e "2026-11-29" viram "23/11 a 29/11", como o servidor rotula a semana. */
function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  return `${monday.slice(8, 10)}/${monday.slice(5, 7)} a ${sunday.slice(8, 10)}/${sunday.slice(5, 7)}`;
}

test("fluxo de caixa: o previsto da semana lista os títulos em aberto, por mês, exportar e a data trocada", async ({
  page,
}) => {
  await signIn(page, "fluxo@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("button", { name: "Relatórios" }).click();
  await menu.getByRole("link", { name: "Fluxo de caixa" }).click();
  await expect(page.getByRole("heading", { name: "Relatórios - Fluxo de caixa" })).toBeVisible();
  await expect(page.getByText(/^Saldo em /)).toBeVisible();

  // A provisão de supervisão do seed vence daqui a 22 dias: a semana dela mostra o título em aberto
  const monday = defaultRange(addDays(todayInSaoPaulo(), 22)).start;
  await page.getByRole("button", { name: `Ver o que compõe ${weekLabel(monday)}` }).click();
  const dialog = page.getByRole("dialog");
  const forecast = dialog.getByRole("region", { name: "Previsto" });
  const provision = forecast.getByRole("row", { name: /Supervisão de campo · PRJ-1790/ });
  await expect(provision).toContainText("R$ 6.000,00");
  await expect(provision).toContainText("Provisão");
  await expect(dialog.getByRole("region", { name: "Realizado" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Por mês: uma linha por mês, a começar pelo de hoje
  await page.getByRole("combobox", { name: "Agrupar por" }).click();
  await page.getByRole("option", { name: "Mês" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`^${monthLabel(currentMonth())}`) })).toBeVisible();

  // Exportar leva a mesma tabela para o Excel
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fluxo-de-caixa-.*\.xlsx$/);

  // A data final antes da inicial: a tela diz o motivo
  const start = await page.getByLabel("De", { exact: true }).inputValue();
  expect(start).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  await page.getByLabel("Até", { exact: true }).fill("2020-01-01");
  await expect(page.getByText("A data final vem antes da inicial")).toBeVisible();
});
