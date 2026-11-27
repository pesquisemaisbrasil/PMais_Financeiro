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
              description: "Entrevistadores · PRJ-1804",
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
  const nf = page.getByRole("list", { name: "NF pendente" });
  const elisa = nf.getByRole("listitem").filter({ hasText: "Elisa Prado" });
  await expect(elisa).toContainText("1.500,00");
  await expect(elisa.getByRole("link")).toHaveAttribute("href", /\/contas-a-pagar\?modo=tudo&conta=\d+/);
  await expect(page.getByRole("button", { name: /Dar baixa|Importar/ })).toHaveCount(0);
  // o número do alto é o tamanho da lista
  const pendingCount = await nf.getByRole("listitem").count();
  await expect(page.getByRole("group", { name: "NF pendente" })).toContainText(String(pendingCount));

  await elisa.getByRole("button", { name: "Registrar a NF de Elisa Prado (exemplo)" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar NF" });
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog.getByText("Informe o número e a data de emissão da nota.")).toBeVisible();
  await dialog.getByLabel("Número da NF *").fill("4521");
  await dialog.getByLabel("Data de emissão *").fill(todayInSaoPaulo());
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("NF registrada. O aviso de NF pendente saiu.")).toBeVisible();
  await expect(elisa).toHaveCount(0);
  await expect(page.getByRole("group", { name: "NF pendente" })).toContainText(String(pendingCount - 1));

  // Lista de RPA do mês: bruto, INSS e líquido, com o total, e o número no alto
  await expect(page.getByRole("row", { name: /Paula Dias/ })).toContainText("110,00");
  await expect(page.getByRole("group", { name: "RPA no mês" })).toContainText("110,00 de INSS");
  await expect(page.getByRole("row", { name: /^Total/ })).toContainText("890,00");
  // a lista de RPA cabe no cartão, sem cortar o líquido (27/11)
  const rpaTable = page.locator("table", { hasText: "Paula Dias" });
  expect(await rpaTable.evaluate((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth)).toBeLessThanOrEqual(0);

  // o mês anterior, pela API de verdade: ninguém pago por RPA
  await page.getByRole("button", { name: "Mês anterior" }).click();
  const before = shiftMonth(month, -1);
  await expect(page.getByText(`Nenhum RPA pago em ${monthLabel(before)}.`)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`rpa-${before}.xlsx`);
});
