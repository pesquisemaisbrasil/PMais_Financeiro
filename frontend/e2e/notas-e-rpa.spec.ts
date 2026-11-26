import { expect, test } from "@playwright/test";
import { currentMonth, monthLabel, shiftMonth } from "../src/lib/bank-month";
import { todayInSaoPaulo } from "../src/lib/cashFlow";
import { signIn } from "./fixtures";

test("Notas e RPA: a NF pendente sai da lista quando a nota é registrada, e o RPA do mês tem os totais", async ({
  page,
}) => {
  const month = currentMonth();
  // a lista de RPA deste mês vem pronta: no seed, ninguém de RPA foi pago (pagar mexeria nos outros testes)
  await page.route(
    (url) => url.pathname === "/fiscal/rpa" && url.searchParams.get("month") === month,
    (route) =>
      route.fulfill({
        json: {
          month,
          label: monthLabel(month),
          rows: [
            {
              itemId: 1,
              payableId: 7,
              name: "Paula Dias (exemplo)",
              project: "PRJ-1804",
              paidOn: todayInSaoPaulo(),
              gross: "1000.00",
              inss: "110.00",
              net: "890.00",
            },
          ],
          gross: "1000.00",
          inss: "110.00",
          net: "890.00",
        },
      })
  );
  await signIn(page, "notas@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: "Notas e RPA" }).click();
  await expect(page.getByRole("heading", { name: "Financeiro - Notas e RPA" })).toBeVisible();

  // NF pendente: só aviso, e a tela não paga nem importa nada
  const elisa = page.getByRole("row", { name: /Elisa Prado/ });
  await expect(elisa).toContainText("1.500,00");
  await expect(elisa.getByRole("link")).toHaveAttribute("href", /\/contas-a-pagar\?modo=tudo&conta=\d+/);
  await expect(page.getByRole("button", { name: /Dar baixa|Importar/ })).toHaveCount(0);

  await elisa.getByRole("button", { name: "Registrar a NF de Elisa Prado (exemplo)" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar NF" });
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog.getByText("Informe o número e a data de emissão da nota.")).toBeVisible();
  await dialog.getByLabel("Número da NF *").fill("4521");
  await dialog.getByLabel("Data de emissão *").fill(todayInSaoPaulo());
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("NF registrada. O aviso de NF pendente saiu.")).toBeVisible();
  await expect(elisa).toHaveCount(0);

  // RPA do mês: bruto, INSS e líquido, com o total
  await page.getByRole("tab", { name: "RPA do mês" }).click();
  await expect(page.getByRole("row", { name: /Paula Dias/ })).toContainText("110,00");
  await expect(page.getByRole("row", { name: /^Total/ })).toContainText("890,00");

  // o mês anterior, pela API de verdade: ninguém pago por RPA
  await page.getByRole("button", { name: "Mês anterior" }).click();
  const before = shiftMonth(month, -1);
  await expect(page.getByText(`Nenhuma pessoa paga por RPA em ${monthLabel(before)}.`)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`rpa-${before}.xlsx`);
});
