import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

const cents = (text: string) => Math.round(Number(text.replace(/[^\d,]/g, "").replace(",", ".")) * 100);

test("relatório do projeto: números, a parte do projeto em cada conta, documentos e links", async ({ page }) => {
  await signIn(page, "relatorio@e2e.invalid");

  // O menu leva à lista de projetos
  await page.getByRole("button", { name: "Relatórios" }).click();
  await page.getByRole("link", { name: "Relatório do projeto" }).click();
  await expect(page.getByRole("heading", { name: "Relatório do projeto" })).toBeVisible();
  await expect(page.getByRole("row", { name: /PRJ-1790/ })).toBeVisible();
  await page.getByRole("link", { name: "Abrir o relatório de PRJ-1804" }).click();

  // Aqui não se paga, e o orçamento (do Connect) ainda não chega: sem ele, também não há saldo
  await expect(page.getByText("Aqui não se paga")).toBeVisible();
  await expect(page.getByText("Sem orçamento definido")).toBeVisible();
  await expect(page.getByText("definido no Connect")).toBeVisible();

  // Só a parte deste projeto em cada conta: a hospedagem de R$ 1.980,00 é dividida com outro projeto
  const hotel = page.getByRole("row", { name: /Hospedagem da equipe de campo/ });
  await expect(hotel).toContainText("R$ 1.188,00");
  await expect(hotel).not.toContainText("1.980,00");
  await expect(page.getByRole("row", { name: /Impressão de questionários/ })).toContainText("R$ 1.250,00");
  // a conta de outro projeto não entra
  await expect(page.getByRole("row", { name: /Passagens de ônibus/ })).toHaveCount(0);

  // Provisão fica à parte: não é gasto
  await expect(page.getByRole("row", { name: /Gráfica · PRJ-1804/ })).toContainText("R$ 1.300,00");
  await expect(page.getByText("1 provisão em aberto · ainda não é gasto")).toBeVisible();

  // O total é a soma exata das linhas, e é o que os cartões mostram
  const values = await page
    .getByRole("table")
    .first()
    .locator("tbody tr:not(:last-child) td:nth-child(5)")
    .allInnerTexts();
  const total = await page.getByRole("row", { name: /^Total/ }).locator("td").nth(1).innerText();
  expect(values.length).toBeGreaterThan(2);
  expect(values.reduce((sum, text) => sum + cents(text), 0)).toBe(cents(total));
  expect(await page.getByText(total, { exact: true }).count()).toBeGreaterThanOrEqual(2);

  // Sem documentos nos lançamentos, o relatório diz isso; a conta abre pelo link da linha
  await expect(page.getByText("Nenhum documento anexado aos lançamentos deste projeto.")).toBeVisible();
  await page.getByRole("link", { name: "Abrir a conta Impressão de questionários em Contas a pagar" }).click();
  const opened = page.getByRole("dialog");
  await opened.getByRole("tab", { name: /Documentos/ }).click();
  const pdf = Buffer.from("%PDF-1.4\n%planilha do relatório, fictícia\n");
  await opened.getByRole("combobox", { name: "Tipo do documento" }).click();
  await page.getByRole("option", { name: "Planilha" }).click();
  await opened.getByLabel("Anexar documentos").setInputFiles({
    name: "planilha-do-projeto.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByText("Documento anexado.")).toBeVisible();

  // De volta ao relatório, o documento está lá, com a conta de onde veio, e baixa o mesmo arquivo
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Relatório · / })).toBeVisible();
  const document = page.getByRole("listitem").filter({ hasText: "planilha-do-projeto.pdf" });
  await expect(document).toContainText("Planilha");
  await expect(document).toContainText("Impressão de questionários");
  await expect(page.getByRole("row", { name: /Impressão de questionários/ })).toContainText("1 documento");
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Baixar planilha-do-projeto.pdf" }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe("planilha-do-projeto.pdf");
  expect(await readFile(await saved.path())).toEqual(pdf);

  // "Pagar em Contas a pagar" abre a lista só com as contas deste projeto
  await page.getByRole("link", { name: "Pagar em Contas a pagar" }).click();
  await expect(page.getByRole("row", { name: /Impressão de questionários/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Passagens de ônibus/ })).toHaveCount(0);

  // E o código do projeto na lista de Contas a pagar leva ao relatório dele
  await page.goto("/contas-a-pagar");
  await page.getByRole("row", { name: /Impressão de questionários/ }).getByRole("link", { name: "PRJ-1804" }).click();
  await expect(page).toHaveURL(/\/relatorios\/projeto\?codigo=1804/);
  await expect(page.getByRole("heading", { name: /Relatório · / })).toBeVisible();
});
